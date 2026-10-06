import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { saveDatabase, onLocalSaveStatus, LocalDatabase } from '../src/utils/database';
import { LocalSaveBanner } from '../src/components/LocalSaveBanner';
import { AttachmentUploader } from '../src/components/AttachmentUploader';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { createMemoryReceiptStore, setReceiptStoreBackend } from '../src/utils/receiptStore';
import { SyncStatusBanner } from '../src/components/SyncStatusBanner';
import { checkReceiptsFolderOnSignIn, resetReceiptsFolderState } from '../src/utils/receiptsFolder';

const db = { expenses: [] } as unknown as LocalDatabase;

// A storage whose writes fail the way a full one does.
function failWrites() {
  const real = globalThis.localStorage;
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => real.getItem(k),
    removeItem: (k: string) => real.removeItem(k),
    setItem: () => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); },
  });
  return { mockRestore: () => vi.unstubAllGlobals() };
}

afterEach(() => {
  vi.unstubAllGlobals();
  saveDatabase(db); // leave the shared save status healthy
  setReceiptStoreBackend(undefined);
});

describe('a failed save on this device is reported', () => {
  it('saveDatabase returns false and tells listeners, then recovers', () => {
    const heard: boolean[] = [];
    const stop = onLocalSaveStatus(f => heard.push(f));
    const spy = failWrites();
    expect(saveDatabase(db)).toBe(false);
    spy.mockRestore();
    expect(saveDatabase(db)).toBe(true);
    stop();
    expect(heard).toEqual([false, true, false]);
  });

  it('shows a persistent warning while saving fails, and clears it after a good save', () => {
    render(<LanguageProvider><LocalSaveBanner /></LanguageProvider>);
    expect(screen.queryByRole('alert')).toBeNull();

    const spy = failWrites();
    let ok: boolean | undefined;
    act(() => { ok = saveDatabase(db); });
    expect(ok).toBe(false);
    expect(screen.getByRole('alert').textContent).toContain('Entries on this device could not be saved — storage is full');

    spy.mockRestore();
    act(() => { saveDatabase(db); });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('choosing a receipt', () => {
  it('keeps the file in the receipt store and only metadata on the attachment', async () => {
    const store = createMemoryReceiptStore();
    setReceiptStoreBackend(store);
    const onChange = vi.fn();
    const { container } = render(
      <LanguageProvider>
        <AttachmentUploader attachments={[]} onAttachmentsChange={onChange} />
      </LanguageProvider>
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hello'], 'bill.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onChange).toHaveBeenCalled());
    const [att] = onChange.mock.calls[0][0];
    expect(att).toMatchObject({ fileName: 'bill.pdf', mimeType: 'application/pdf', pending: true });
    expect(att.data).toBeUndefined();
    expect(store.entries.get(att.id)?.data).toBe('aGVsbG8=');
  });
});

describe('the sync banner while local saving fails', () => {
  it('stops saying entries are safe on this device', () => {
    const props = {
      kind: 'offline' as const,
      pendingChanges: 1,
      nextRetryAt: null,
      isSyncing: false,
      onRetry: () => {},
      onSignIn: () => {},
    };
    render(<LanguageProvider><SyncStatusBanner {...props} /></LanguageProvider>);
    expect(screen.getByRole('alert').textContent).toContain('Your entries are safe on this device');

    const restore = failWrites();
    act(() => { saveDatabase(db); });
    const text = screen.getByRole('alert').textContent!;
    expect(text).not.toContain('safe on this device');
    expect(text).toContain('Your latest entries are only in this open page.');
    restore.mockRestore();
  });
});

describe('connect prompt', () => {
  it('appears in the receipt picker when this account cannot reach the shared folder', async () => {
    resetReceiptsFolderState();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('developerMetadata')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ developerMetadata: [{ metadataId: 1, metadataKey: 'farmledger.receiptsFolderId', metadataValue: 'folder_shared' }] }),
        } as any;
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' } as any;
    }));
    render(
      <LanguageProvider>
        <AttachmentUploader attachments={[]} onAttachmentsChange={() => {}} accessToken="tok" />
      </LanguageProvider>
    );
    expect(screen.queryByText('Connect the shared receipts folder')).toBeNull();
    await act(async () => { await checkReceiptsFolderOnSignIn('tok', 'sheet_1'); });
    expect(screen.getByText('Connect the shared receipts folder')).toBeTruthy();
    expect(screen.getByText('Open in Drive').closest('a')!.getAttribute('href'))
      .toBe('https://drive.google.com/drive/folders/folder_shared');
    resetReceiptsFolderState();
  });
});
