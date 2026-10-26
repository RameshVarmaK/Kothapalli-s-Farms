/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { Activity, CommonAllocationType, CreditAccount, Field, Member, Season } from '../../types';
import { calculateAllocations } from '../../utils/calculations';
import { allocationRuleHelp } from './allocationRuleHelp';
import { PayersField } from './PayersField';
import { MoneyEntryForm } from './useMoneyEntryForm';
import { useLanguage } from '../../hooks/useLanguage';

interface LabourFormProps {
  form: MoneyEntryForm;
  members: Member[];
  fields: Field[];
  seasons: Season[];
  activities: Activity[];
  creditAccounts: CreditAccount[];
  currency: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const LabourForm: React.FC<LabourFormProps> = ({
  form,
  members,
  fields,
  seasons,
  activities,
  creditAccounts,
  currency,
  onSubmit: handleSaveLabour,
  onClose: closeAndReset
}) => {
  const { t } = useLanguage();
  const activeSeasons = seasons.filter(s => !s.isClosed);
  const {
    editingRecordId,
    date,
    setDate,
    amount,
    paidBy,
    setPaidBy,
    splitPayers,
    setSplitPayers,
    payerRows,
    setPayerRows,
    linkedActivityId,
    setLinkedActivityId,
    selectedSeasonId,
    setSelectedSeasonId,
    workersCount,
    setWorkersCount,
    labourDescription,
    setLabourDescription,
    wageRate,
    setWageRate,
    labourTotalCost,
    setLabourTotalCost,
    labourTargetType,
    setLabourTargetType,
    labourAllocationRule,
    setLabourAllocationRule,
    labourParticipatingSeasons,
    setLabourParticipatingSeasons,
    manualLabourAllocations,
    setManualLabourAllocations,
    isCredit,
    setIsCredit,
    creditAccountId,
    setCreditAccountId
  } = form;

  const labourParticipatingDetailedPreview = labourParticipatingSeasons.map(sid => {
    const s = seasons.find(sea => sea.id === sid);
    if (!s) return null;
    return {
      fieldId: s.fieldId,
      seasonId: s.id,
      fieldArea: fields.find(fd => fd.id === s.fieldId)?.area || 1
    };
  }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

  const parsedManualLabourPreview: { [key: string]: number } = {};
  Object.keys(manualLabourAllocations).forEach(k => {
    parsedManualLabourPreview[k] = parseFloat(manualLabourAllocations[k]) || 0;
  });

  const previewLabourTotal = parseFloat(labourTotalCost) || 0;
  const labourAllocationPreview = labourTargetType === 'common' && labourParticipatingDetailedPreview.length > 0
    ? calculateAllocations(previewLabourTotal, labourAllocationRule, labourParticipatingDetailedPreview, parsedManualLabourPreview)
    : [];
  const labourAllocationTotal = labourAllocationPreview.reduce((sum, a) => sum + a.amount, 0);
  const labourAllocationDiff = Number((previewLabourTotal - labourAllocationTotal).toFixed(2));

  return (
    <form onSubmit={handleSaveLabour} className="p-6 space-y-4">
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

      <div>
        <label htmlFor="labour-description" className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Work done *')}</label>
        <textarea
          id="labour-description"
          required
          rows={2}
          maxLength={300}
          placeholder={t('e.g. Weeding in the north field, transplanting paddy, spraying pesticide')}
          value={labourDescription}
          onChange={e => setLabourDescription(e.target.value)}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
        />
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target field scope</label>
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
          <button
            type="button"
            onClick={() => setLabourTargetType('single')}
            className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
              labourTargetType === 'single' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
            }`}
          >
            {t('Single Crop Cycle')}
          </button>
          <button
            type="button"
            onClick={() => {
              setLabourTargetType('common');
              setLabourParticipatingSeasons(activeSeasons.map(s => s.id));
            }}
            className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
              labourTargetType === 'common' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
            }`}
          >
            {t('Shared Across Fields')}
          </button>
        </div>
      </div>

      {labourTargetType === 'single' ? (
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Target Crop Cycle')}</label>
          <select
            value={selectedSeasonId}
            required
            onChange={e => setSelectedSeasonId(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          >
            <option value="">{t('Select crop season...')}</option>
            {seasons.map(s => {
              const f = fields.find(field => field.id === s.fieldId);
              return (
                <option key={s.id} value={s.id}>
                  {s.cropName} ({f ? f.name : 'Unknown'})
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
              value={labourAllocationRule}
              onChange={e => setLabourAllocationRule(e.target.value as CommonAllocationType)}
              className="bg-white border border-gray-100 rounded-lg text-[10px] px-2 py-1"
            >
              <option value="equal">{t('Equal Split')}</option>
              <option value="area">{t('Area Proportional (Acres)')}</option>
              <option value="manual">{t('Manual Specification')}</option>
            </select>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed -mt-1">{allocationRuleHelp[labourAllocationRule]}</p>

          <div className="space-y-2">
            <span className="text-[10px] font-bold text-gray-400 uppercase block">{t('Fields Participating')}</span>
            {activeSeasons.map(s => {
              const f = fields.find(field => field.id === s.fieldId)!;
              const isChecked = labourParticipatingSeasons.includes(s.id);
              return (
                <div key={s.id} className="flex justify-between items-center text-xs">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {
                        if (isChecked) {
                          setLabourParticipatingSeasons(prev => prev.filter(id => id !== s.id));
                        } else {
                          setLabourParticipatingSeasons(prev => [...prev, s.id]);
                        }
                      }}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-semibold text-gray-700">{s.cropName} ({f?.name})</span>
                  </label>
                  {isChecked && (
                    <div className="flex items-center gap-1">
                      {labourAllocationRule === 'manual' ? (
                        <input
                          type="number"
                          placeholder={t('Rupees')}
                          value={manualLabourAllocations[`${s.fieldId}_${s.id}`] || ''}
                          onChange={e => {
                            const val = e.target.value;
                            setManualLabourAllocations(prev => ({
                              ...prev,
                              [`${s.fieldId}_${s.id}`]: val
                            }));
                          }}
                          className="w-20 bg-white border border-gray-100 rounded-md px-1.5 py-0.5 text-right text-[10px]"
                        />
                      ) : (
                        <span className="text-[10px] text-gray-500 font-semibold mono-num">
                          {isChecked && labourTotalCost ? (
                            <>
                              {currency}
                              {Math.round(labourAllocationPreview.find(al => al.seasonId === s.id)?.amount || 0)}
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

          {labourParticipatingSeasons.length > 0 && (
            <div
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                !labourTotalCost
                  ? 'bg-white border-gray-200 text-gray-400'
                  : Math.abs(labourAllocationDiff) <= 0.5
                  ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}
            >
              <span className="flex items-center gap-1.5">
                {labourTotalCost && (
                  Math.abs(labourAllocationDiff) <= 0.5
                    ? <Check size={12} />
                    : <AlertTriangle size={12} />
                )}
                {t('Allocated')} {currency}{Math.round(labourAllocationTotal)} {t('of')} {currency}{Math.round(previewLabourTotal)}
              </span>
              {labourTotalCost && Math.abs(labourAllocationDiff) > 0.5 && (
                <span className="mono-num">
                  {currency}{Math.abs(labourAllocationDiff).toFixed(2)} {t(labourAllocationDiff > 0 ? 'unallocated' : 'over')}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Worker Count')}</label>
          <input
            type="number"
            placeholder="e.g. 10"
            value={workersCount}
            onChange={e => {
              setWorkersCount(e.target.value);
              if(wageRate && e.target.value) {
                setLabourTotalCost(String(parseFloat(wageRate) * parseFloat(e.target.value)));
              }
            }}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Wage rate / worker')} ({currency})</label>
          <input
            type="number"
            placeholder="e.g. 400"
            value={wageRate}
            onChange={e => {
              setWageRate(e.target.value);
              if(workersCount && e.target.value) {
                setLabourTotalCost(String(parseFloat(workersCount) * parseFloat(e.target.value)));
              }
            }}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
      </div>

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Lump Total Cost')} ({currency})</label>
        <input
          type="number"
          required
          placeholder="Auto-calculated or override lump"
          value={labourTotalCost}
          onChange={e => setLabourTotalCost(e.target.value)}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
        />
        <p className="text-[9px] text-gray-400 mt-0.5">{t('Overrides standard calculations if different from workers × rate.')}</p>
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
          total={(labourTotalCost ? parseFloat(labourTotalCost) : (parseInt(workersCount) || 0) * (parseFloat(wageRate) || 0)) || 0}
          paidBy={paidBy}
          setPaidBy={setPaidBy}
          split={splitPayers}
          setSplit={setSplitPayers}
          rows={payerRows}
          setRows={setPayerRows}
        />
      )}

      <div>
        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Link to Diary Event (Optional)')}</label>
        <select
          value={linkedActivityId}
          onChange={e => setLinkedActivityId(e.target.value)}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
        >
          <option value="">{t('Do not link to activity')}</option>
          {activities.filter(a => labourTargetType === 'single' ? a.seasonId === selectedSeasonId : true).map(a => (
            <option key={a.id} value={a.id}>
              {a.date} - {a.type} ({a.notes.substring(0,30)}...)
            </option>
          ))}
        </select>
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
          {editingRecordId ? t('Save Changes') : t('Add Labour Cost')}
        </button>
      </div>
    </form>
  );
};
