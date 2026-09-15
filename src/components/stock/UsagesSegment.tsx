/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StockItem, StockUsage, Field, Season } from '../../types';
import { Plus, Hammer } from 'lucide-react';

interface UsagesSegmentProps {
  usages: StockUsage[];
  purchases: { length: number };
  stockItems: StockItem[];
  computedStockList: StockItem[];
  seasons: Season[];
  fields: Field[];
  currency: string;
  onLogUsage: () => void;
}

export const UsagesSegment: React.FC<UsagesSegmentProps> = ({
  usages,
  purchases,
  stockItems,
  computedStockList,
  seasons,
  fields,
  currency,
  onLogUsage
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Field Usage Consumptions</h3>
        <span className="text-[10px] font-bold text-slate-550 block bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">Weighted Consumption</span>
      </div>

      <div className="divide-y divide-slate-100">
        {usages.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <span className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <Hammer size={22} />
            </span>
            <h4 className="font-bold text-slate-800 text-sm mb-1.5">
              {stockItems.length === 0 ? 'Register an input type first' : purchases.length === 0 ? 'Log a purchase first' : 'No field usage logged yet'}
            </h4>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">
              {stockItems.length === 0
                ? 'You need at least one input type before you can record it being used on a field.'
                : purchases.length === 0
                ? 'There’s nothing on hand to consume yet — log a purchase to bring stock in first.'
                : 'Record when seed, fertilizer, or pesticide is applied to a field — it charges the cost to that crop cycle automatically.'}
            </p>
            <button
              onClick={onLogUsage}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
            >
              <Plus size={14} />
              {stockItems.length === 0 ? 'Create First Input Type' : purchases.length === 0 ? 'Log First Purchase' : 'Log First Usage'}
            </button>
          </div>
        ) : (
          [...usages].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(u => {
            const item = stockItems.find(i => i.id === u.stockItemId);
            let destination = 'Common Split';
            if (u.targetType === 'single' && u.targetSeasonId) {
              const s = seasons.find(sea => sea.id === u.targetSeasonId);
              const f = fields.find(fd => fd.id === u.targetFieldId);
              destination = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';
            } else if (u.targetType === 'common' && u.allocations) {
              destination = 'Shared allocation rule across season';
            }

            // Cost calculation
            const costRate = item ? computedStockList.find(c => c.id === item.id)?.weightedAverageCost || 0 : 0;
            const valueCharged = u.quantityUsed * costRate;

            return (
              <div key={u.id} className="p-4.5 flex justify-between items-center text-xs hover:bg-slate-50/30">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm leading-snug">{item ? item.name : 'Unknown Material'}</h4>
                  <p className="text-[10px] text-emerald-800 font-bold mt-1.5 uppercase tracking-wider">{destination}</p>
                  <span className="text-[9px] text-slate-400 block font-mono font-bold uppercase mt-1">{u.date}</span>
                </div>
                <div className="text-right">
                  <span className="text-base font-bold font-mono block text-slate-850">
                    {currency}{Math.round(valueCharged).toLocaleString('en-IN')}
                  </span>
                  <span className="text-[10px] text-slate-450 mt-1 block font-bold text-right bg-slate-100 px-1.5 py-0.5 rounded">
                    Used {u.quantityUsed} {item?.unit}
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
