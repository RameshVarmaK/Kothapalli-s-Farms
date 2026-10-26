/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { Member } from '../../types';
import { PayerRow } from '../../utils/payers';
import { useLanguage } from '../../hooks/useLanguage';

/** Which question the field is asking, which sets its wording. */
export type PayersKind = 'paid' | 'funded' | 'received';

interface PayersFieldProps {
  /** Defaults to 'paid'. */
  kind?: PayersKind;
  members: Member[];
  currency: string;
  /** What the entry comes to, which the payments have to add up to. */
  total: number;
  paidBy: string;
  setPaidBy: (memberId: string) => void;
  split: boolean;
  setSplit: (split: boolean) => void;
  rows: PayerRow[];
  setRows: (rows: PayerRow[]) => void;
}

/** Evenly divides `total` in whole paise, leaving any odd paisa on the last. */
export function splitEvenly(total: number, count: number): string[] {
  if (count === 0) return [];
  const paise = Math.round(total * 100);
  const base = Math.floor(paise / count);
  return Array.from({ length: count }, (_, i) => String((i === count - 1 ? paise - base * (count - 1) : base) / 100));
}

/**
 * "Who paid?" for an entry paid directly by partners: one partner by default,
 * or several, each with the amount they paid.
 */
export const PayersField: React.FC<PayersFieldProps> = ({
  kind = 'paid',
  members, currency, total, paidBy, setPaidBy, split, setSplit, rows, setRows
}) => {
  const { t } = useLanguage();
  // With one partner ticked, their amount is simply the total, so it follows
  // the total as it is typed (until they have set something of their own).
  const previousTotal = useRef(total);
  useEffect(() => {
    const ticked = rows.filter(r => r.paid);
    if (split && ticked.length === 1 && total > 0) {
      const current = parseFloat(ticked[0].amount) || 0;
      const untouched = current === 0 || Math.abs(current - previousTotal.current) < 0.005;
      if (untouched && Math.abs(current - total) > 0.005) {
        setRows(rows.map(r => (r.memberId === ticked[0].memberId ? { ...r, amount: String(total) } : r)));
      }
    }
    previousTotal.current = total;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, split]);

  const wording = {
    paid: { single: 'Payer (Who Paid?)', several: 'Paid by more than one partner', legend: 'Who paid, and how much each', amount: 'Amount paid by' },
    funded: { single: 'Funder (Who Funded?)', several: 'Paid by more than one partner', legend: 'Who paid, and how much each', amount: 'Amount paid by' },
    received: { single: 'Recipient (Who Got Cash?)', several: 'Received by more than one partner', legend: 'Who received, and how much each', amount: 'Amount received by' },
  }[kind];
  const money = (n: number) => `${currency}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

  const startSplit = () => {
    // Begin with the partner already chosen paying the lot, so only the moving
    // of an amount to the other partner is left to do.
    setRows(members.map(m => ({ memberId: m.id, paid: m.id === paidBy, amount: m.id === paidBy && total > 0 ? String(total) : '' })));
    setSplit(true);
  };

  const stopSplit = () => {
    const first = rows.find(r => r.paid);
    if (first) setPaidBy(first.memberId);
    setSplit(false);
  };

  const update = (memberId: string, change: Partial<PayerRow>) =>
    setRows(rows.map(r => (r.memberId === memberId ? { ...r, ...change } : r)));

  const splitAmongTicked = () => {
    const ticked = rows.some(r => r.paid) ? rows : rows.map(r => ({ ...r, paid: true }));
    const shares = splitEvenly(total, ticked.filter(r => r.paid).length);
    let next = 0;
    setRows(ticked.map(r => (r.paid ? { ...r, amount: shares[next++] } : { ...r, amount: '' })));
  };

  if (!split) {
    return (
      <div>
        <label htmlFor="payer-single" className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t(wording.single)}</label>
        <select
          id="payer-single"
          value={paidBy}
          onChange={e => setPaidBy(e.target.value)}
          className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
        >
          {members.map(m => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
        {members.length > 1 && (
          <button type="button" onClick={startSplit} className="mt-1.5 text-[10px] font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer">
            {t(wording.several)}
          </button>
        )}
      </div>
    );
  }

  const assigned = rows.filter(r => r.paid).reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const gap = Number((total - assigned).toFixed(2));
  const balanced = total > 0 && Math.abs(gap) < 0.01;

  return (
    <fieldset>
      <legend className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t(wording.legend)}</legend>
      <div className="space-y-1.5">
        {rows.map(r => {
          const name = members.find(m => m.id === r.memberId)?.name || '';
          return (
            <div key={r.memberId} className={`flex items-center gap-2.5 p-2 rounded-xl border text-xs ${r.paid ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-gray-100'}`}>
              <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={r.paid}
                  onChange={e => update(r.memberId, { paid: e.target.checked, amount: e.target.checked ? r.amount : '' })}
                  className="accent-emerald-600"
                />
                <span className="font-bold text-gray-800 truncate">{name}</span>
              </label>
              <input
                type="number"
                step="any"
                min="0"
                disabled={!r.paid}
                aria-label={`${t(wording.amount)} ${name}`}
                placeholder="0"
                value={r.amount}
                onChange={e => update(r.memberId, { amount: e.target.value })}
                className="w-28 bg-white border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right disabled:bg-gray-50 disabled:text-gray-300"
              />
            </div>
          );
        })}
      </div>

      <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px]">
        <span className={`font-bold ${balanced ? 'text-emerald-700' : 'text-amber-700'}`} aria-live="polite">
          {money(assigned)} {t('of')} {money(total)}
          {!balanced && total > 0 && ` · ${gap > 0 ? t('still to assign') : t('over by')} ${money(Math.abs(gap))}`}
        </span>
        <span className="flex gap-3">
          <button type="button" onClick={splitAmongTicked} disabled={total <= 0} className="font-bold text-emerald-700 underline disabled:opacity-40 cursor-pointer">
            {t('Split equally')}
          </button>
          <button type="button" onClick={stopSplit} className="font-bold text-gray-500 underline cursor-pointer">
            {t('Back to one payer')}
          </button>
        </span>
      </div>
    </fieldset>
  );
};
