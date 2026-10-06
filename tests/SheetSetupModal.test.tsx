import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

describe('empty-ledger recovery', () => {
  // A partner who opened the app before it learned to ask has a blank
  // "FarmLedger Database" sitting in their Drive. The Drive search finds it
  // (the app created it, so drive.file can see it), loads it, and they land
  // in an empty app — no prompt, because the search did not come back empty.
  // The condition below is what catches that case.
  const LEDGER_CHOICE_KEY = 'farmledger_ledger_choice_made';

  beforeEach(() => localStorage.clear());

  /** Mirrors the condition in useSheetSync's auto-fetch. */
  function shouldPromptSetup(sheet: any, local: any, choiceMade: boolean) {
    const sheetEmpty =
      (!sheet.members || sheet.members.length === 0) &&
      (!sheet.fields || sheet.fields.length === 0) &&
      (!sheet.seasons || sheet.seasons.length === 0) &&
      (!sheet.expenses || sheet.expenses.length === 0);
    const localHasData =
      (local.members && local.members.length > 0) ||
      (local.fields && local.fields.length > 0) ||
      (local.seasons && local.seasons.length > 0);
    return sheetEmpty && !localHasData && !choiceMade;
  }

  const empty = { members: [], fields: [], seasons: [], expenses: [] };
  const populated = { members: [{ id: 'm1' }], fields: [{ id: 'f1' }], seasons: [{ id: 's1' }], expenses: [] };

  it('asks when the found ledger is blank and so is the device', () => {
    expect(shouldPromptSetup(empty, empty, false)).toBe(true);
  });

  it('stays quiet once the ledger actually holds records', () => {
    expect(shouldPromptSetup(populated, empty, false)).toBe(false);
  });

  it('stays quiet when the device has offline records to push up', () => {
    // That case already has its own branch: push local state to the sheet.
    expect(shouldPromptSetup(empty, populated, false)).toBe(false);
  });

  it('never nags someone who deliberately started a fresh, still-empty ledger', () => {
    expect(shouldPromptSetup(empty, empty, true)).toBe(false);
  });

  it('treats an absent flag as "not yet chosen"', () => {
    expect(localStorage.getItem(LEDGER_CHOICE_KEY)).toBeNull();
    expect(shouldPromptSetup(empty, empty, localStorage.getItem(LEDGER_CHOICE_KEY) === 'true')).toBe(true);
  });
});
