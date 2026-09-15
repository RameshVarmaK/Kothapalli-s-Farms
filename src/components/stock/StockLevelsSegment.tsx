/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { StockItem } from '../../types';
import { Plus, Archive, Pencil } from 'lucide-react';

interface StockLevelsSegmentProps {
  computedStockList: StockItem[];
  currency: string;
  onCreateItemType: () => void;
  onEditItem: (item: StockItem) => void;
}

export const StockLevelsSegment: React.FC<StockLevelsSegmentProps> = ({
  computedStockList,
  currency,
  onCreateItemType,
  onEditItem
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
        <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Stock Reserves Valuation</h3>
        <button
          onClick={onCreateItemType}
          className="text-xs text-emerald-700 hover:text-emerald-900 font-bold uppercase tracking-wider cursor-pointer"
        >
          + Create Input Type
        </button>
      </div>

      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-slate-400 bg-slate-50/50 text-[10px] uppercase tracking-widest font-bold">
            <th className="px-6 py-4">Material Identifier</th>
            <th className="px-6 py-4">Category</th>
            <th className="px-6 py-4 text-right">Available Qty</th>
            <th className="px-6 py-4 text-right">Weighted Avg Cost</th>
            <th className="px-6 py-4 text-right">Reserve Value</th>
            <th className="px-6 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
          {computedStockList.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-6 py-0">
                <div className="flex flex-col items-center justify-center text-center py-12">
                  <span className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                    <Archive size={22} />
                  </span>
                  <h4 className="font-bold text-slate-800 text-sm mb-1.5">No farm inputs registered</h4>
                  <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">
                    Register seed, fertilizer, pesticide, or fuel types here first — then log purchases and field usage against them.
                  </p>
                  <button
                    onClick={onCreateItemType}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
                  >
                    <Plus size={14} />
                    Create First Input Type
                  </button>
                </div>
              </td>
            </tr>
          ) : (
            computedStockList.map(item => {
              const val = item.quantityOnHand * item.weightedAverageCost;
              return (
                <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">{item.name}</td>
                  <td className="px-6 py-4">
                    <span className="px-2.5 py-1 rounded-md bg-slate-100 text-[9px] text-slate-600 font-bold tracking-wider uppercase border border-slate-200">
                      {item.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-mono font-bold text-slate-800">
                    {item.quantityOnHand} {item.unit}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-slate-500">
                    {currency}{item.weightedAverageCost.toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4 text-right font-bold font-mono text-emerald-600">
                    {currency}{Math.round(val).toLocaleString('en-IN')}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => onEditItem(item)}
                      className="p-1.5 rounded-lg text-slate-350 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-250 hover:border-emerald-150 transition-colors cursor-pointer"
                      title="Edit Input Type"
                    >
                      <Pencil size={13} />
                    </button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
};
