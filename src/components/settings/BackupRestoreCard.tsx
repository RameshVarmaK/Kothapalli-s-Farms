/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Download, Upload } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface BackupRestoreCardProps {
  backupMessage: { text: string; isError: boolean } | null;
  onExport: () => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({ backupMessage, onExport, onImport }) => {
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
          className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-250 text-xs font-bold text-slate-600 hover:bg-slate-50 bg-white shadow-2xs cursor-pointer"
        >
          <Download size={14} className="text-slate-400" />
          <span>{t('Backup JSON')}</span>
        </button>

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
      </div>
    </div>
  );
};
