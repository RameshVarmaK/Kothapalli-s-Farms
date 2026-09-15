/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StockItem, StockPurchase, Member } from '../../types';
import { Plus, Coins } from 'lucide-react';

interface PurchasesSegmentProps {
  purchases: StockPurchase[];
  stockItems: StockItem[];
  members: Member[];
  currency: string;
  onLogPurchase: () => void;
}

export const PurchasesSegment: React.FC<PurchasesSegmentProps> = ({
  purchases,
  stockItems,
  members,
  currency,
  onLogPurchase
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Stock Purchasing Ledger (Intakes)</h3>
        <span className="text-[10px] font-bold text-emerald-750 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-md uppercase tracking-wider">Capital Outlays</span>
      </div>

      <div className="divide-y divide-slate-100">
        {purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <span className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <Coins size={22} />
            </span>
            <h4 className="font-bold text-slate-800 text-sm mb-1.5">
              {stockItems.length === 0 ? 'Register an input type first' : 'No purchases logged yet'}
            </h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">
              {stockItems.length === 0
                ? 'You need at least one input type (seed, fertilizer, etc.) before you can log a purchase against it.'
                : 'Log every bag of fertilizer, seed, or fuel bought — it builds the weighted-average cost used across field usage.'}
            </p>
            <button
              onClick={onLogPurchase}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
            >
              <Plus size={14} />
              {stockItems.length === 0 ? 'Create First Input Type' : 'Log First Purchase'}
            </button>
          </div>
        ) : (
          [...purchases].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(p => {
            const item = stockItems.find(i => i.id === p.stockItemId);
            const payer = members.find(m => m.id === p.paidByMemberId)?.name || 'Unknown';
            const calculatedRate = p.quantity > 0 ? p.totalCost / p.quantity : 0;
            return (
              <div key={p.id} className="p-4.5 flex justify-between items-center text-xs hover:bg-slate-50/30">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm leading-snug">{item ? item.name : 'Unknown Material'}</h4>
                  <div className="flex items-center gap-2 mt-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    <span className="font-mono">{p.date}</span>
                    <span>•</span>
                    <span>Paid by {payer}</span>
                    <span>•</span>
                    <span className="font-mono text-slate-500">Unit Cost: {currency}{Math.round(calculatedRate).toLocaleString('en-IN')}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono block text-slate-800">
                    {currency}{p.totalCost.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded font-bold block mt-1">
                    Added {p.quantity} {item?.unit}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
