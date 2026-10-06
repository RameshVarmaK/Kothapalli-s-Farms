/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import type { ConfirmDialogState } from '../../app/ledgerActions';

interface ConfirmDialogProps {
  confirmDialog: ConfirmDialogState;
  onCancel: () => void;
}

export function ConfirmDialog({ confirmDialog, onCancel }: ConfirmDialogProps) {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="p-6">
          <div className="flex items-center gap-3 text-red-600 mb-3">
            <AlertTriangle size={24} className="stroke-[2.5]" />
            <h3 className="font-extrabold text-slate-900 text-base">{confirmDialog.title}</h3>
          </div>
          <p className="text-slate-600 text-xs leading-relaxed font-medium">{confirmDialog.message}</p>
        </div>
        <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
          <button
            type="button"
            onClick={() => onCancel()}
            className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={() => {
              confirmDialog.onConfirm();
            }}
            className="px-5 py-2 text-xs font-extrabold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            {confirmDialog.confirmText ? t(confirmDialog.confirmText) : t('Confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
