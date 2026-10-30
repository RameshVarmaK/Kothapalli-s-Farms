/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Activity, CreditAccount, Field, Member, Season } from '../../types';
import { ExpenseForm } from './ExpenseForm';
import { LabourForm } from './LabourForm';
import { RevenueForm } from './RevenueForm';
import { MoneyEntryForm } from './useMoneyEntryForm';
import { useLanguage } from '../../hooks/useLanguage';
import { Dialog } from '../shell/Dialog';

interface EntryModalProps {
  form: MoneyEntryForm;
  members: Member[];
  fields: Field[];
  seasons: Season[];
  activities: Activity[];
  creditAccounts: CreditAccount[];
  categories?: string[];
  currency: string;
  accessToken: string | null;
  onSaveExpense: (e: React.FormEvent) => void;
  onSaveLabour: (e: React.FormEvent) => void;
  onSaveRevenue: (e: React.FormEvent) => void;
  onClose: () => void;
}

/** The quick-entry dialog: log or edit an expense, a labour cost or a harvest sale. */
export const EntryModal: React.FC<EntryModalProps> = ({
  form,
  members,
  fields,
  seasons,
  activities,
  creditAccounts,
  categories,
  currency,
  accessToken,
  onSaveExpense: handleSaveExpense,
  onSaveLabour: handleSaveLabour,
  onSaveRevenue: handleSaveRevenue,
  onClose: closeAndReset
}) => {
  const { t } = useLanguage();
  const { addTab, setAddTab, editingRecordId, formError } = form;
  // Each tab asks about different partners (who paid, who received), so a
  // half-made split from one tab must not carry into another.
  const chooseTab = (tab: 'expense' | 'labour' | 'revenue') => {
    setAddTab(tab);
    form.setSplitPayers(false);
    form.setPayerRows([]);
  };

  // Live allocation preview for the common-expense split — computed here so
  // both the per-season row preview and the running-total summary below stay
  // in sync with what handleSaveExpense will actually write.
  return (
      <Dialog label={t('New Entry')} onClose={closeAndReset} className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-155">
          {/* Nav Tabs */}
          <div className="flex border-b border-gray-100 bg-gray-50/50 p-2">
            <button
              type="button"
              disabled={!!editingRecordId}
              onClick={() => chooseTab('expense')}
              className={`flex-1 text-center py-2.5 rounded-2xl text-xs font-bold transition-all ${
                addTab === 'expense' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-600'
              } ${editingRecordId ? 'cursor-not-allowed opacity-50 font-bold' : ''}`}
            >
              {editingRecordId ? t('Edit Cost Expense') : t('Log Cost Expense')}
            </button>
            <button
              type="button"
              disabled={!!editingRecordId}
              onClick={() => chooseTab('labour')}
              className={`flex-1 text-center py-2.5 rounded-2xl text-xs font-bold transition-all ${
                addTab === 'labour' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-600'
              } ${editingRecordId ? 'cursor-not-allowed opacity-50 font-bold' : ''}`}
            >
              {editingRecordId ? t('Edit Farm Labour') : t('Log Farm Labour')}
            </button>
            <button
              type="button"
              disabled={!!editingRecordId}
              onClick={() => chooseTab('revenue')}
              className={`flex-1 text-center py-2.5 rounded-2xl text-xs font-bold transition-all ${
                addTab === 'revenue' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-600'
              } ${editingRecordId ? 'cursor-not-allowed opacity-50 font-bold' : ''}`}
            >
              {editingRecordId ? t('Edit Harvest Revenue') : t('Log Harvest Revenue')}
            </button>
          </div>

          {formError && (
            <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[10px] flex items-start gap-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{t(formError)}</span>
            </div>
          )}

          {/* EXPENSE FORM */}
          {addTab === 'expense' && (
            <ExpenseForm
              form={form}
              members={members}
              fields={fields}
              seasons={seasons}
              activities={activities}
              creditAccounts={creditAccounts}
              categories={categories}
              currency={currency}
              accessToken={accessToken}
              onSubmit={handleSaveExpense}
              onClose={closeAndReset}
            />
          )}

          {/* LABOUR FORM */}
          {addTab === 'labour' && (
            <LabourForm
              form={form}
              members={members}
              fields={fields}
              seasons={seasons}
              activities={activities}
              creditAccounts={creditAccounts}
              currency={currency}
              onSubmit={handleSaveLabour}
              onClose={closeAndReset}
            />
          )}

          {/* REVENUE FORM */}
          {addTab === 'revenue' && (
            <RevenueForm
              form={form}
              members={members}
              fields={fields}
              seasons={seasons}
              currency={currency}
              onSubmit={handleSaveRevenue}
              onClose={closeAndReset}
            />
          )}
        </div>
      </Dialog>
  );
};
