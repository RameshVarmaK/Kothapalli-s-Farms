/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Plus, Trash2, ArrowUpRight, ArrowDownLeft, Receipt, Pencil, Paperclip } from 'lucide-react';
import { receiptCount } from '../../utils/attachments';
import { LedgerItem, LedgerItemType } from '../../utils/moneyLedger';
import { useLanguage } from '../../hooks/useLanguage';

interface TransactionFeedProps {
  /** The rows to show, already filtered and sorted. */
  entries: LedgerItem[];
  /** Whether the ledger holds anything at all, to tell "empty" from "filtered out". */
  hasEntries: boolean;
  currency: string;
  onNewEntry: () => void;
  onClearFilters: () => void;
  onViewReceipts: (expenseId: string) => void;
  onEdit: (item: LedgerItem) => void;
  onDelete: (id: string, type: LedgerItemType) => void;
}

export const TransactionFeed: React.FC<TransactionFeedProps> = ({
  entries,
  hasEntries,
  currency,
  onNewEntry,
  onClearFilters,
  onViewReceipts,
  onEdit,
  onDelete
}) => {
  const { t } = useLanguage();

  return (
  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
    <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
      <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">{t('Transactional Ledger')}</h2>
      <span className="text-xs text-slate-500 font-bold bg-slate-100 px-2.5 py-1 rounded-full">{entries.length} {t('entries matching')}</span>
    </div>

    <div className="divide-y divide-slate-100">
      {entries.length === 0 ? (
        !hasEntries ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <span className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <Receipt size={22} />
            </span>
            <h4 className="font-bold text-slate-800 text-sm mb-1.5">{t('No transactions logged yet')}</h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">
              {t('Every expense, labour shift, and harvest sale you record shows up here — one running ledger for the whole partnership.')}
            </p>
            <button
              onClick={onNewEntry}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
            >
              <Plus size={14} />
              {t('Log First Transaction')}
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-center py-12 px-6">
            <p className="text-slate-500 text-xs font-semibold mb-3">{t('No transactions match the current filters.')}</p>
            <button
              onClick={onClearFilters}
              className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
            >
              {t('Clear filters')}
            </button>
          </div>
        )
      ) : (
        entries.map(item => {
          const isRevenue = item.type === 'revenue';
          return (
            <div key={item.id} className="p-4.5 flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-center hover:bg-slate-50/70 transition-colors">
              <div className="flex gap-4 items-start sm:items-center min-w-0">
                <span className={`shrink-0 p-3 rounded-xl border ${isRevenue ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                  {isRevenue ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 break-words sm:truncate leading-snug">{item.description}</p>
                  <p className="text-[11px] text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                    <span className="font-mono">{item.date}</span>
                    <span>•</span>
                    <span className="font-bold text-slate-600 break-words sm:truncate bg-slate-100 px-1.5 py-0.5 rounded">{item.fieldSeasonName}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 pl-[3.75rem] sm:pl-0 sm:justify-end sm:gap-4 sm:ml-4 sm:shrink-0">
                {item.type === 'expense' && receiptCount(item.rawRecord) > 0 && (
                  <button
                    type="button"
                    onClick={() => onViewReceipts(item.id)}
                    className="inline-flex items-center gap-0.5 px-1.5 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                    title={t('View receipts')}
                    aria-label={`${t('View receipts')} (${receiptCount(item.rawRecord)})`}
                  >
                    <Paperclip size={14} />
                    {receiptCount(item.rawRecord)}
                  </button>
                )}
                <div className="min-w-0 text-left sm:text-right">
                  <p className={`text-base font-bold font-mono tracking-tight ${isRevenue ? 'text-emerald-600' : 'text-slate-800'}`}>
                    {isRevenue ? '+' : '-'}{currency}{item.amount.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 break-words">{item.subtext}</p>
                </div>
                <div className="flex items-center gap-1 sm:gap-4">
                  <button
                    onClick={() => onEdit(item)}
                    className="p-2 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 hover:border hover:border-emerald-100 transition-colors cursor-pointer"
                    title={t('Edit Record')} aria-label={t('Edit Record')}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onDelete(item.id, item.type)}
                    className="p-2 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 hover:border hover:border-red-100 transition-colors cursor-pointer"
                    title={t('Delete Record')} aria-label={t('Delete Record')}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  </div>
  );
};
