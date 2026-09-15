/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface PullConfirmModalProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export const PullConfirmModal: React.FC<PullConfirmModalProps> = ({ onCancel, onConfirm }) => {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-100">
      <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-center gap-3 text-amber-605 mb-3">
            <AlertTriangle size={24} className="stroke-[2.5] text-amber-500" />
            <h3 className="font-extrabold text-slate-900 text-sm">{t('Force Overwrite Local Database?')}</h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed font-semibold mt-2">
            {t('We analyzed Google Sheets and found no differences, but you can still run a manual refresh. This will')} <span className="text-red-600 font-bold">{t('OVERWRITE')}</span> {t('your local database.')}
          </p>
        </div>
        <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-5 py-2 text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            {t('Force Overwrite')}
          </button>
        </div>
      </div>
    </div>
  );
};
