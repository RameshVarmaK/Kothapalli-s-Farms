/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Activity, CommonAllocationType, CreditAccount, Field, Member, Season } from '../../types';
import { calculateAllocations } from '../../utils/calculations';
import { AttachmentUploader } from '../AttachmentUploader';
import { allocationRuleHelp } from './allocationRuleHelp';
import { PayersField } from './PayersField';
import { MoneyEntryForm } from './useMoneyEntryForm';
import { useLanguage } from '../../hooks/useLanguage';

interface ExpenseFormProps {
  form: MoneyEntryForm;
  members: Member[];
  fields: Field[];
  seasons: Season[];
  activities: Activity[];
  creditAccounts: CreditAccount[];
  currency: string;
  accessToken: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const ExpenseForm: React.FC<ExpenseFormProps> = ({
  form,
  members,
  fields,
  seasons,
  activities,
  creditAccounts,
  currency,
  accessToken,
  onSubmit: handleSaveExpense,
  onClose: closeAndReset
}) => {
  const { t } = useLanguage();
  const activeSeasons = seasons.filter(s => !s.isClosed);
  const {
    editingRecordId,
    date,
    setDate,
    amount,
    setAmount,
    paidBy,
    setPaidBy,
    splitPayers,
    setSplitPayers,
    payerRows,
    setPayerRows,
    category,
    setCategory,
    linkedActivityId,
    setLinkedActivityId,
    targetType,
    setTargetType,
    selectedSeasonId,
    setSelectedSeasonId,
    allocationRule,
    setAllocationRule,
    selectedParticipatingSeasons,
    setSelectedParticipatingSeasons,
    manualAllocations,
    setManualAllocations,
    isCredit,
    setIsCredit,
    creditAccountId,
    setCreditAccountId,
    attachments,
    setAttachments
  } = form;

  const participatingDetailedPreview = selectedParticipatingSeasons.map(sid => {
    const s = seasons.find(sea => sea.id === sid);
    if (!s) return null;
    return {
      fieldId: s.fieldId,
      seasonId: s.id,
      fieldArea: fields.find(fd => fd.id === s.fieldId)?.area || 1
    };
  }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

  const parsedManualPreview: { [key: string]: number } = {};
  Object.keys(manualAllocations).forEach(k => {
    parsedManualPreview[k] = parseFloat(manualAllocations[k]) || 0;
  });

  const previewAmount = parseFloat(amount) || 0;
  const allocationPreview = targetType === 'common' && participatingDetailedPreview.length > 0
    ? calculateAllocations(previewAmount, allocationRule, participatingDetailedPreview, parsedManualPreview)
    : [];
  const allocationTotal = allocationPreview.reduce((sum, a) => sum + a.amount, 0);
  const allocationDiff = Number((previewAmount - allocationTotal).toFixed(2));


  return (
    <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Date')}</label>
          <input
            type="date"
            required
            value={date}
            onChange={e => setDate(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Billing Type')}</label>
          <select
            value={isCredit ? 'credit' : 'direct'}
            onChange={e => {
              const creditMode = e.target.value === 'credit';
              setIsCredit(creditMode);
              if (creditMode && creditAccounts.length > 0 && !creditAccountId) {
                setCreditAccountId(creditAccounts[0].id);
              }
            }}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="direct">{t('Direct Paid by Partner')}</option>
            <option value="credit">{t('Hire or Buy on Credit')}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Amount')} ({currency})</label>
          <input
            type="number"
            required
            placeholder="e.g. 5000"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Expense category')}</label>
          <input
            type="text"
            required
            placeholder="e.g. Fertilizer batch / Engine repair"
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
      </div>

      {isCredit ? (
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center justify-between">
            <span>{t('Select Creditor Profile *')}</span>
            <span className="text-[9px] text-amber-600 font-extrabold uppercase">{t('Outstanding Debt')}</span>
          </label>
          <select
            value={creditAccountId}
            required
            onChange={e => setCreditAccountId(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">{t('-- Choose Creditor --')}</option>
            {creditAccounts.map(c => (
              <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
            ))}
          </select>
          {creditAccounts.length === 0 && (
            <p className="text-[10px] text-rose-500 font-extrabold mt-1">
              {t('⚠️ Please add a Creditor profile first in the "Credits & Payables" tab.')}
            </p>
          )}
        </div>
      ) : (
        <PayersField
          members={members}
          currency={currency}
          total={parseFloat(amount) || 0}
          paidBy={paidBy}
          setPaidBy={setPaidBy}
          split={splitPayers}
          setSplit={setSplitPayers}
          rows={payerRows}
          setRows={setPayerRows}
        />
      )}

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Target field scope')}</label>
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
          <button
            type="button"
            onClick={() => setTargetType('single')}
            className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
              targetType === 'single' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
            }`}
          >
            {t('Single Crop Cycle')}
          </button>
          <button
            type="button"
            onClick={() => {
              setTargetType('common');
              setSelectedParticipatingSeasons(activeSeasons.map(s => s.id));
            }}
            className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
              targetType === 'common' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
            }`}
          >
            {t('Common Shared Expense')}
          </button>
        </div>
      </div>

      {targetType === 'single' ? (
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Crop Cycle Target')}</label>
          <select
            value={selectedSeasonId}
            required
            onChange={e => setSelectedSeasonId(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          >
            {seasons.map(s => {
              const f = fields.find(field => field.id === s.fieldId);
              return (
                <option key={s.id} value={s.id}>
                  {s.cropName} ({f ? f.name : 'Unknown'}) {s.isClosed ? '• Closed' : ''}
                </option>
              );
            })}
          </select>
        </div>
      ) : (
        <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-gray-500 uppercase">{t('Division Rule')}</span>
            <select
              value={allocationRule}
              onChange={e => setAllocationRule(e.target.value as CommonAllocationType)}
              className="bg-white border border-gray-100 rounded-lg text-[10px] px-2 py-1"
            >
              <option value="equal">{t('Equal Split')}</option>
              <option value="area">{t('Area Proportional (Acres)')}</option>
              <option value="manual">{t('Manual Specification')}</option>
            </select>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed -mt-1">{allocationRuleHelp[allocationRule]}</p>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">{t('Fields Participating')}</span>
            {activeSeasons.map(s => {
              const f = fields.find(field => field.id === s.fieldId)!;
              const isChecked = selectedParticipatingSeasons.includes(s.id);
              return (
                <div key={s.id} className="flex justify-between items-center text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setSelectedParticipatingSeasons(prev => prev.filter(id => id !== s.id));
                        } else {
                          setSelectedParticipatingSeasons(prev => [...prev, s.id]);
                        }
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-gray-700">{s.cropName} ({f?.name})</span>
                  </label>
                  {isChecked && (
                    <div className="flex items-center gap-1">
                      {allocationRule === 'manual' ? (
                        <input
                          type="number"
                          placeholder={t('Rupees')}
                          value={manualAllocations[`${s.fieldId}_${s.id}`] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setManualAllocations(prev => ({
                              ...prev,
                              [`${s.fieldId}_${s.id}`]: val
                            }));
                          }}
                          className="w-20 bg-white border border-gray-100 rounded-md px-1.5 py-0.5 text-right text-[10px]"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-500 font-semibold mono-num">
                          {isChecked && amount ? (
                            <>
                              {currency}
                              {Math.round(allocationPreview.find(al => al.seasonId === s.id)?.amount || 0)}
                            </>
                          ) : '-'}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Running total — makes the split fully transparent before saving,
              instead of only failing the manual-rule check on submit. */}
          {selectedParticipatingSeasons.length > 0 && (
            <div
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                !amount
                  ? 'bg-white border-gray-200 text-gray-400'
                  : Math.abs(allocationDiff) <= 0.5
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {amount && (
                  Math.abs(allocationDiff) <= 0.5
                    ? <Check size={12} />
                    : <AlertTriangle size={12} />
                )}
                {t('Allocated')} {currency}{Math.round(allocationTotal)} {t('of')} {currency}{Math.round(previewAmount)}
              </span>
              {amount && Math.abs(allocationDiff) > 0.5 && (
                <span className="mono-num">
                  {currency}{Math.abs(allocationDiff).toFixed(2)} {t(allocationDiff > 0 ? 'unallocated' : 'over')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Link to Diary Event (Optional)')}</label>
        <select
          value={linkedActivityId}
          onChange={e => setLinkedActivityId(e.target.value)}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
        >
          <option value="">{t('Do not link to activity')}</option>
          {activities.filter(a => targetType === 'single' ? a.seasonId === selectedSeasonId : true).map(a => (
            <option key={a.id} value={a.id}>
              {a.date} - {a.type} ({a.notes.substring(0, 30)}...)
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Receipt / Photo (Optional)')}</label>
        <AttachmentUploader attachments={attachments} onAttachmentsChange={setAttachments} accessToken={accessToken} />
      </div>

      <div className="flex gap-3 pt-4 border-t border-gray-50">
        <button
          type="button"
          onClick={closeAndReset}
          className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
        >
          {t('Cancel')}
        </button>
        <button
          type="submit"
          className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
        >
          {editingRecordId ? t('Save Changes') : t('Add Expense')}
        </button>
      </div>
    </form>
  );
};
