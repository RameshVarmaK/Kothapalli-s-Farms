/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CloudOff, KeyRound, ShieldAlert, RefreshCw, AlertTriangle } from 'lucide-react';
import { SyncErrorKind } from '../utils/syncErrors';
import { useLanguage } from '../hooks/useLanguage';

interface SyncStatusBannerProps {
  kind: SyncErrorKind;
  /** Records added, edited or deleted on this device that the sheet lacks. */
  pendingChanges: number;
  /** When the next automatic retry fires, or null when none is scheduled. */
  nextRetryAt: number | null;
  isSyncing: boolean;
  /** The raw error, shown folded away for anyone who needs to report it. */
  details?: string;
  onRetry: () => void;
  onSignIn: () => void;
}

const COPY: Record<SyncErrorKind, { title: string; body: string }> = {
  offline: {
    title: 'Not saved to Google Sheet — no internet',
    body: "Your entries are safe on this device and will be sent as soon as you're back online.",
  },
  auth: {
    title: 'Google sign-in expired',
    body: 'Your entries are safe on this device. Sign in again to send them to the Google Sheet.',
  },
  access: {
    title: "This account can't edit the Google Sheet",
    body: "Your entries are safe on this device. Ask the sheet's owner to share it with you as an Editor, then tap Retry.",
  },
  busy: {
    title: 'Google Sheets is busy right now',
    body: 'Your entries are safe on this device and will be sent automatically.',
  },
  unknown: {
    title: "Couldn't save to Google Sheet",
    body: 'Your entries are safe on this device and will be sent automatically.',
  },
};

const ICONS: Record<SyncErrorKind, React.ElementType> = {
  offline: CloudOff,
  auth: KeyRound,
  access: ShieldAlert,
  busy: AlertTriangle,
  unknown: AlertTriangle,
};

/**
 * Shown under the header whenever the last push to the sheet failed. It says
 * why in plain words, reassures that nothing is lost, and offers the one
 * action that fixes it — the header's red ✕ alone was invisible on a phone.
 */
export const SyncStatusBanner: React.FC<SyncStatusBannerProps> = ({
  kind,
  pendingChanges,
  nextRetryAt,
  isSyncing,
  details,
  onRetry,
  onSignIn,
}) => {
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!nextRetryAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [nextRetryAt]);

  const Icon = ICONS[kind];
  const copy = COPY[kind];
  const secondsLeft = nextRetryAt ? Math.max(0, Math.ceil((nextRetryAt - now) / 1000)) : null;

  return (
    <div
      role="alert"
      className="bg-amber-50 border-b border-amber-200 px-4 md:px-6 py-3 text-amber-900 print:hidden"
    >
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <Icon size={18} className="text-amber-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold">{t(copy.title)}</p>
          <p className="text-xs mt-0.5 leading-relaxed">{t(copy.body)}</p>
          <p className="text-[11px] mt-1 font-semibold text-amber-700">
            {pendingChanges > 0 && (
              <span>
                {pendingChanges} {t(pendingChanges === 1 ? 'change not yet in the Google Sheet' : 'changes not yet in the Google Sheet')}
              </span>
            )}
            {pendingChanges > 0 && secondsLeft !== null && !isSyncing && <span> · </span>}
            {isSyncing ? (
              <span>{t('Retrying now...')}</span>
            ) : (
              secondsLeft !== null && (
                <span>
                  {t('Retrying in')} {secondsLeft}s
                </span>
              )
            )}
          </p>
          {details && (kind === 'access' || kind === 'unknown') && (
            <details className="mt-1">
              <summary className="text-[10px] text-amber-700 cursor-pointer">{t('Details')}</summary>
              <p className="text-[10px] text-amber-800 break-words mt-1">{details}</p>
            </details>
          )}
        </div>
        {kind === 'auth' ? (
          <button
            type="button"
            onClick={onSignIn}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 cursor-pointer"
          >
            {t('Sign in again')}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRetry}
            disabled={isSyncing}
            className="shrink-0 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg bg-white border border-amber-300 hover:bg-amber-100 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={12} className={isSyncing ? 'animate-spin' : ''} />
            {t('Retry')}
          </button>
        )}
      </div>
    </div>
  );
};
