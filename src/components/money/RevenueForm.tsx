/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Field, Member, Season } from '../../types';
import { PayersField } from './PayersField';
import { MoneyEntryForm } from './useMoneyEntryForm';
import { useLanguage } from '../../hooks/useLanguage';

interface RevenueFormProps {
  form: MoneyEntryForm;
  members: Member[];
  fields: Field[];
  seasons: Season[];
  currency: string;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

export const RevenueForm: React.FC<RevenueFormProps> = ({
  form,
  members,
  fields,
  seasons,
  currency,
  onSubmit: handleSaveRevenue,
  onClose: closeAndReset
}) => {
  const { t } = useLanguage();
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
    selectedSeasonId,
    setSelectedSeasonId,
    revenueCrop,
    setRevenueCrop,
    revenueQuantity,
    setRevenueQuantity,
    buyerName,
    setBuyerName
  } = form;

  return (
    <form onSubmit={handleSaveRevenue} className="p-6 space-y-4">
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

      <PayersField
        kind="received"
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Sold Commodity/Crop Name')}</label>
          <input
            type="text"
            placeholder="e.g. Paddy Sona Masuri"
            value={revenueCrop}
            onChange={e => setRevenueCrop(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Sold Quantity')}</label>
          <input
            type="number"
            placeholder="e.g. 150"
            value={revenueQuantity}
            onChange={e => setRevenueQuantity(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Total Sale Amount')} ({currency})</label>
          <input
            type="number"
            required
            placeholder="e.g. 150000"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
        <div>
          <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Buyer / Trader Agency Name')}</label>
          <input
            type="text"
            placeholder="e.g. Balaji Trading Corp"
            value={buyerName}
            onChange={e => setBuyerName(e.target.value)}
            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
          />
        </div>
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
          {editingRecordId ? t('Save Changes') : t('Add Crop Revenue')}
        </button>
      </div>
    </form>
  );
};
