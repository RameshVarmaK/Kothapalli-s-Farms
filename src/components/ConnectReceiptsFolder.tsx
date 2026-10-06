/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import {
  ConnectResult,
  ReceiptsFolderState,
  connectReceiptsFolder,
  onReceiptsFolderStatus,
} from '../utils/receiptsFolder';
import { isPickerAvailable, pickReceiptsFolder } from '../utils/googlePicker';

const RESULT_COPY: Partial<Record<ConnectResult, string>> = {
  'wrong-folder': 'That is a different folder. Pick the "FarmLedger Receipts" folder shared with this ledger.',
  'still-no-access': 'Still no access. Ask the partner who shared the ledger to share the receipts folder with you too.',
};

/**
 * Asks a partner to connect the ledger's shared receipts folder once, when
 * their sign-in can't use it yet. Shows nothing otherwise.
 */
export const ConnectReceiptsFolder: React.FC<{ accessToken?: string | null }> = ({ accessToken }) => {
  const { t } = useLanguage();
  const [status, setStatus] = useState<ReceiptsFolderState>({ state: 'unknown' });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => onReceiptsFolderStatus(setStatus), []);

  if (status.state !== 'needs-connect') return null;
  const folderLink = `https://drive.google.com/drive/folders/${status.folderId}`;

  const connect = async () => {
    if (!accessToken) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await connectReceiptsFolder(accessToken, pickReceiptsFolder);
      const copy = RESULT_COPY[result];
      if (copy) setMessage(t(copy));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-2">
      <p className="font-bold flex items-center gap-1.5">
        <FolderOpen size={14} /> {t('Connect the shared receipts folder')}
      </p>
      <p className="leading-relaxed">
        {t('Receipts for this ledger are kept in a shared Google Drive folder. Connect it once on this account so your receipts can be uploaded. Until then they wait on this device.')}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {accessToken && isPickerAvailable() && (
          <button
            type="button"
            onClick={connect}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
          >
            {busy ? t('Opening...') : t('Connect folder')}
          </button>
        )}
        <a href={folderLink} target="_blank" rel="noopener noreferrer" className="font-bold text-amber-800 underline">
          {t('Open in Drive')}
        </a>
      </div>
      {message && <p className="font-semibold">{message}</p>}
    </div>
  );
};
