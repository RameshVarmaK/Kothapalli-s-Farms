/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Upload, ShieldCheck } from 'lucide-react';
import { SafetyCopyInfo } from '../../utils/safetyBackup';
import { useLanguage } from '../../hooks/useLanguage';

interface BackupRestoreCardProps {
  backupMessage: { text: string; isError: boolean } | null;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Restoring overwrites the live ledger; owner only. Defaults to allowed. */
  canRestore?: boolean;
  /** Copies of data an earlier action overwrote, newest first. */
  safetyCopies?: SafetyCopyInfo[];
  onDownloadSafetyCopy?: (id: string) => void;
}

export const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({ backupMessage, onExport, onImport, safetyCopies = [], onDownloadSafetyCopy, canRestore = true }) => {
  const { t } = useLanguage();
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="font-bold text-sm text-slate-800 mb-4">{t('Offline Data Maintenance')}</h3>
      <p className="text-[11px] text-slate-400 leading-relaxed mb-5 font-medium">
        {t('None of your financial records leave your device by default. Export local databases to save snapshots or import files to switch devices.')}
      </p>

      {backupMessage && (
        <div className={`mb-4 p-3 rounded-xl text-[11px] font-bold border ${
          backupMessage.isError ? 'bg-red-50 text-red-800 border-red-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'
        }`}>
          {backupMessage.text}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={onExport}
          className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 bg-white shadow-2xs cursor-pointer"
        >
          <Download size={14} className="text-slate-400" />
          <span>{t('Backup JSON')}</span>
        </button>

        {canRestore && (
        <label className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-dashed border-emerald-300 text-xs font-bold text-emerald-800 bg-emerald-50/20 hover:bg-emerald-50/40 cursor-pointer text-center">
          <Upload size={14} />
          <span>{t('Restore Backup')}</span>
          <input
            type="file"
            accept=".json"
            onChange={onImport}
            className="hidden"
          />
        </label>
        )}
      </div>

      {safetyCopies.length > 0 && onDownloadSafetyCopy && (
        <div className="mt-5 pt-5 border-t border-slate-100">
          <h4 className="flex items-center gap-1.5 text-xs font-bold text-slate-700 mb-1">
            <ShieldCheck size={14} className="text-emerald-600" />
            {t('Safety copies')}
          </h4>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-3 font-medium">
            {t('Saved on this device just before something was overwritten. Download one and use Restore Backup to go back.')}
          </p>
          <ul className="space-y-2">
            {safetyCopies.map(copy => (
              <li key={copy.id} className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 truncate">{t(copy.reason)}</p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {new Date(copy.savedAt).toLocaleString()} · {copy.records} {t('records')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onDownloadSafetyCopy(copy.id)}
                  aria-label={`${t('Download safety copy')}: ${t(copy.reason)}`}
                  className="shrink-0 p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                >
                  <Download size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
