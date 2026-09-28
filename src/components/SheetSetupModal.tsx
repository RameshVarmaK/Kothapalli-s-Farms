/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Cloud, Link2, FilePlus2, Loader2, AlertTriangle, FolderOpen } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';

interface SheetSetupModalProps {
  /** Link the ledger the user pastes. Rejects with a message fit to show. */
  onLinkExisting: (rawInput: string) => Promise<void>;
  /** Start a fresh ledger in the user's own Drive. */
  onCreateNew: () => Promise<void>;
  /** Carry on with this device only; the user can link later from Settings. */
  onSkip: () => void;
  /** Open Drive's file chooser; resolves to a sheet id, or null if closed.
   * Omitted when Picker isn't configured, and the button is then hidden. */
  onBrowseDrive?: () => Promise<string | null>;
}

/**
 * Shown when the user is signed in but no ledger could be found in their
 * Drive.
 *
 * The app used to answer this situation by silently creating a blank
 * spreadsheet. That was wrong twice over: a partner who had been invited to
 * an existing ledger was never asked, and landed in an empty app with no
 * hint that their farm's data was one paste away; and the blank sheet it
 * left behind was later *found* by the Drive search on their next device,
 * where it passed for a real ledger. Asking once removes both problems —
 * there is no orphan left around to be mistaken for the real thing.
 */
export const SheetSetupModal: React.FC<SheetSetupModalProps> = ({
  onLinkExisting,
  onCreateNew,
  onSkip,
  onBrowseDrive,
}) => {
  const { t } = useLanguage();
  const [sheetInput, setSheetInput] = useState('');
  const [busy, setBusy] = useState<'link' | 'create' | 'browse' | null>(null);
  const [error, setError] = useState('');

  const run = async (which: 'link' | 'create' | 'browse', action: () => Promise<void>) => {
    setError('');
    setBusy(which);
    try {
      await action();
    } catch (err: any) {
      setError(err?.message || String(err));
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center gap-3">
          <span className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100 shrink-0">
            <Cloud size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="font-extrabold text-slate-900 text-base leading-snug">
              {t('Set up your farm ledger')}
            </h2>
            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
              {t('We could not find a ledger in your Google Drive.')}
            </p>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[11px] font-semibold leading-relaxed"
          >
            <AlertTriangle size={15} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Joining an existing ledger comes first: someone who was invited is
            the person most likely to be stuck here. */}
        <div className="space-y-2">
          <label
            htmlFor="setup-sheet-input"
            className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest"
          >
            {t('Were you invited to a ledger?')}
          </label>
          {onBrowseDrive && (
            <button
              type="button"
              onClick={() =>
                run('browse', async () => {
                  const picked = await onBrowseDrive();
                  // null means they closed the chooser — not a failure.
                  if (picked) await onLinkExisting(picked);
                })
              }
              disabled={busy !== null}
              className="w-full inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-emerald-500 text-slate-700 font-bold text-xs px-4 py-3 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {busy === 'browse' ? <Loader2 size={15} className="animate-spin shrink-0" /> : <FolderOpen size={15} className="shrink-0" />}
              {busy === 'browse' ? t('Opening Drive...') : t('Browse my Google Drive')}
            </button>
          )}

          {onBrowseDrive && (
            <p className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-1">
              {t('or paste the link')}
            </p>
          )}

          <input
            id="setup-sheet-input"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={sheetInput}
            placeholder="https://docs.google.com/spreadsheets/d/..."
            onChange={e => setSheetInput(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-3 text-xs text-slate-700 font-semibold focus:outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={() => run('link', () => onLinkExisting(sheetInput))}
            disabled={busy !== null || !sheetInput.trim()}
            className="w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-3 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy === 'link' ? <Loader2 size={15} className="animate-spin shrink-0" /> : <Link2 size={15} className="shrink-0" />}
            {busy === 'link' ? t('Linking...') : t('Link that ledger')}
          </button>
          <p className="text-[10px] text-slate-400 font-medium leading-normal">
            {t('Pick the ledger from Drive, or paste the link a partner shared. Your device loads their records — nothing on their sheet is overwritten.')}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('or')}</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => run('create', onCreateNew)}
            disabled={busy !== null}
            className="w-full inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:border-emerald-500 text-slate-700 font-bold text-xs px-4 py-3 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            {busy === 'create' ? <Loader2 size={15} className="animate-spin shrink-0" /> : <FilePlus2 size={15} className="shrink-0" />}
            {busy === 'create' ? t('Creating...') : t('Start a new ledger')}
          </button>
          <p className="text-[10px] text-slate-400 font-medium leading-normal">
            {t('Creates a fresh spreadsheet in your own Google Drive. Choose this only if you are the first person setting up this farm.')}
          </p>
        </div>

        <button
          type="button"
          onClick={onSkip}
          disabled={busy !== null}
          className="w-full text-[11px] font-bold text-slate-400 hover:text-slate-600 py-2 transition-colors cursor-pointer disabled:opacity-50"
        >
          {t('Decide later — keep this device offline')}
        </button>
      </div>
    </div>
  );
};
