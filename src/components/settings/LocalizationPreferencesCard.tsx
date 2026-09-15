/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface LocalizationPreferencesCardProps {
  currency: string;
  areaUnit: string;
  onCurrencyChange: (value: string) => void;
  onAreaUnitChange: (value: string) => void;
  preferencesMessage: { text: string; isError: boolean } | null;
  onSubmit: (e: React.FormEvent) => void;
}

export const LocalizationPreferencesCard: React.FC<LocalizationPreferencesCardProps> = ({
  currency,
  areaUnit,
  onCurrencyChange,
  onAreaUnitChange,
  preferencesMessage,
  onSubmit
}) => {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="font-bold text-sm text-slate-800 mb-4">Localization Preferences</h3>
      {preferencesMessage && (
        <div className={`mb-4 p-3 rounded-xl text-[11px] font-bold border ${
          preferencesMessage.isError ? 'bg-red-50 text-red-800 border-red-100' : 'bg-emerald-50 text-emerald-800 border-emerald-100'
        }`}>
          {preferencesMessage.text}
        </div>
      )}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Currency Indicator</label>
            <select
              value={currency}
              onChange={e => onCurrencyChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-750 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="₹">₹ INR (Rupees)</option>
              <option value="$">$ USD (Dollars)</option>
              <option value="€">€ EUR (Euro)</option>
              <option value="£">£ GBP (Pence)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Plot Area unit</label>
            <select
              value={areaUnit}
              onChange={e => onAreaUnitChange(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-750 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
            >
              <option value="acres">Acres</option>
              <option value="hectares">Hectares</option>
              <option value="bighas">Bighas</option>
              <option value="cents">Cents</option>
            </select>
          </div>
        </div>

        <button
          type="submit"
          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer active:scale-95 transition-all"
        >
          Update Preferences
        </button>
      </form>
    </div>
  );
};
