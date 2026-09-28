import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SheetSetupModal } from '../src/components/SheetSetupModal';
import { LanguageProvider } from '../src/hooks/useLanguage';

const SHEET_URL = 'https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit';

function renderSetup(overrides: Partial<Record<string, any>> = {}) {
  const props = {
    onLinkExisting: vi.fn(async () => {}),
    onCreateNew: vi.fn(async () => {}),
    onSkip: vi.fn(),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <SheetSetupModal {...(props as any)} />
    </LanguageProvider>
  );
  return props;
}

function pasteLink(url: string) {
  fireEvent.change(screen.getByPlaceholderText('https://docs.google.com/spreadsheets/d/...'), {
    target: { value: url },
  });
}

describe('SheetSetupModal', () => {
  // The app used to answer "no ledger in Drive" by silently creating a blank
  // spreadsheet. An invited partner was never asked, landed in an empty app,
  // and the orphan sheet that left behind was later "found" on their next
  // device and passed for a real ledger.

  it('offers joining an existing ledger, not just creating one', () => {
    renderSetup();
    expect(screen.getByText('Link that ledger')).toBeTruthy();
    expect(screen.getByText('Start a new ledger')).toBeTruthy();
  });

  it('creates nothing on its own — every path is a deliberate choice', () => {
    const { onLinkExisting, onCreateNew } = renderSetup();
    expect(onCreateNew).not.toHaveBeenCalled();
    expect(onLinkExisting).not.toHaveBeenCalled();
  });

  it('passes the pasted link through for linking', async () => {
    const { onLinkExisting } = renderSetup();
    pasteLink(SHEET_URL);
    fireEvent.click(screen.getByText('Link that ledger'));
    await waitFor(() => expect(onLinkExisting).toHaveBeenCalledWith(SHEET_URL));
  });

  it('will not attempt to link an empty box', () => {
    renderSetup();
    const button = screen.getByText('Link that ledger').closest('button')!;
    expect(button.disabled).toBe(true);
  });

  it('surfaces the reason a link was refused instead of failing silently', async () => {
    const onLinkExisting = vi.fn(async () => {
      throw new Error('Your Google account cannot open that sheet. Ask its owner to share it with you as an Editor, then try again.');
    });
    renderSetup({ onLinkExisting });

    pasteLink(SHEET_URL);
    fireEvent.click(screen.getByText('Link that ledger'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/share it with you as an Editor/i);
  });

  it('lets the user retry after a refused link', async () => {
    const onLinkExisting = vi.fn()
      .mockRejectedValueOnce(new Error('No spreadsheet exists with that link or ID. Check it and try again.'))
      .mockResolvedValueOnce(undefined);
    renderSetup({ onLinkExisting });

    pasteLink(SHEET_URL);
    fireEvent.click(screen.getByText('Link that ledger'));
    expect(await screen.findByRole('alert')).toBeTruthy();

    // The box still holds the link and the button is live again.
    fireEvent.click(screen.getByText('Link that ledger'));
    await waitFor(() => expect(onLinkExisting).toHaveBeenCalledTimes(2));
  });

  it('creates a new ledger only when that button is pressed', async () => {
    const { onCreateNew } = renderSetup();
    fireEvent.click(screen.getByText('Start a new ledger'));
    await waitFor(() => expect(onCreateNew).toHaveBeenCalledTimes(1));
  });

  it('reports why creating a ledger failed', async () => {
    const onCreateNew = vi.fn(async () => {
      throw new Error('Failed to create Google Sheet: 403');
    });
    renderSetup({ onCreateNew });
    fireEvent.click(screen.getByText('Start a new ledger'));
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/403/);
  });

  it('offers a way out so the user is never trapped without a ledger', () => {
    const { onSkip } = renderSetup();
    fireEvent.click(screen.getByText('Decide later — keep this device offline'));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});

describe('SheetSetupModal - browse Drive', () => {
  it('hides the browse button when Picker is not configured', () => {
    renderSetup({ onBrowseDrive: undefined });
    expect(screen.queryByText('Browse my Google Drive')).toBeNull();
    // Pasting a link is still available as the fallback.
    expect(screen.getByPlaceholderText('https://docs.google.com/spreadsheets/d/...')).toBeTruthy();
  });

  it('links the sheet chosen in the Drive chooser', async () => {
    const onBrowseDrive = vi.fn(async () => 'picked-sheet-id');
    const { onLinkExisting } = renderSetup({ onBrowseDrive });

    fireEvent.click(screen.getByText('Browse my Google Drive'));

    await waitFor(() => expect(onLinkExisting).toHaveBeenCalledWith('picked-sheet-id'));
  });

  it('does nothing when the chooser is dismissed without a pick', async () => {
    const onBrowseDrive = vi.fn(async () => null);
    const { onLinkExisting } = renderSetup({ onBrowseDrive });

    fireEvent.click(screen.getByText('Browse my Google Drive'));

    await waitFor(() => expect(onBrowseDrive).toHaveBeenCalled());
    expect(onLinkExisting).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports why the chooser could not open', async () => {
    const onBrowseDrive = vi.fn(async () => {
      throw new Error('Could not load Google Picker. Check your connection and try again.');
    });
    renderSetup({ onBrowseDrive });

    fireEvent.click(screen.getByText('Browse my Google Drive'));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/Could not load Google Picker/);
  });
});
