/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  StockItem,
  StockPurchase,
  StockUsage,
  Field,
  Season,
  Member,
  Activity,
  CommonAllocationType
} from '../types';
import { Plus, Archive, History, Coins, Hammer, AlertTriangle } from 'lucide-react';
import { computeStockLevels, calculateAllocations } from '../utils/calculations';

interface StockTabProps {
  stockItems: StockItem[];
  purchases: StockPurchase[];
  usages: StockUsage[];
  fields: Field[];
  seasons: Season[];
  members: Member[];
  activities: Activity[];
  currency: string;
  onAddStockItem: (item: StockItem) => void;
  onAddPurchase: (purchase: StockPurchase) => void;
  onAddUsage: (usage: StockUsage) => void;
}

export const StockTab: React.FC<StockTabProps> = ({
  stockItems,
  purchases,
  usages,
  fields,
  seasons,
  members,
  activities,
  currency,
  onAddStockItem,
  onAddPurchase,
  onAddUsage
}) => {
  const [activeSegment, setActiveSegment] = useState<'levels' | 'purchases' | 'usages'>('levels');
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [modalType, setModalType] = useState<'item' | 'purchase' | 'usage'>('purchase');

  // Input Stock Item state
  const [itemName, setItemName] = useState('');
  const [itemType, setItemType] = useState<StockItem['type']>('Fertilizer');
  const [itemUnit, setItemUnit] = useState('');

  // Purchase state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [purchaseQty, setPurchaseQty] = useState('');
  const [purchaseCost, setPurchaseCost] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasePayer, setPurchasePayer] = useState(members[0]?.id || '');

  // Usage state
  const [usageQty, setUsageQty] = useState('');
  const [usageDate, setUsageDate] = useState(new Date().toISOString().split('T')[0]);
  const [usageTargetType, setUsageTargetType] = useState<'single' | 'common'>('single');
  const [usageSeasonId, setUsageSeasonId] = useState('');
  const [usageAllocationRule, setUsageAllocationRule] = useState<CommonAllocationType>('equal');
  const [usageParticipatingSeasons, setUsageParticipatingSeasons] = useState<string[]>([]);
  const [manualUsageAllocations, setManualUsageAllocations] = useState<{ [key: string]: string }>({});
  const [usageLinkedActivityId, setUsageLinkedActivityId] = useState('');

  const [errorMessage, setErrorMessage] = useState('');

  // Computed live stats
  const computedStockList = computeStockLevels(stockItems, purchases, usages);
  const activeSeasons = seasons.filter(s => !s.isClosed);

  const handleSaveStockItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName || !itemUnit) return;

    const newItem: StockItem = {
      id: `item_${Date.now()}`,
      name: itemName,
      type: itemType,
      unit: itemUnit,
      quantityOnHand: 0,
      weightedAverageCost: 0,
      totalCostSpent: 0,
      fundingByMember: {}
    };

    onAddStockItem(newItem);
    closeAndReset();
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(purchaseQty);
    const cost = parseFloat(purchaseCost);
    if (!selectedItemId || !qty || qty <= 0 || !cost || cost <= 0) return;

    const newPurchase: StockPurchase = {
      id: `purc_${Date.now()}`,
      stockItemId: selectedItemId,
      quantity: qty,
      totalCost: cost,
      date: purchaseDate,
      paidByMemberId: purchasePayer
    };

    onAddPurchase(newPurchase);
    closeAndReset();
  };

  const handleSaveUsage = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(usageQty);
    if (!selectedItemId || !qty || qty <= 0) return;

    const selectedStock = computedStockList.find(i => i.id === selectedItemId);
    if (!selectedStock || selectedStock.quantityOnHand < qty) {
      setErrorMessage(`Insufficient stock level on hand! Remaining stock available for ${selectedStock?.name || 'input'} is: ${selectedStock?.quantityOnHand || 0} ${selectedStock?.unit || ''}.`);
      return;
    }

    let newUsage: StockUsage;

    if (usageTargetType === 'single') {
      const s = seasons.find(sea => sea.id === usageSeasonId)!;
      newUsage = {
        id: `use_${Date.now()}`,
        stockItemId: selectedItemId,
        quantityUsed: qty,
        date: usageDate,
        targetType: 'single',
        targetFieldId: s.fieldId,
        targetSeasonId: s.id,
        linkedActivityId: usageLinkedActivityId || undefined
      };
    } else {
      // Common stock allocation
      const participatingDetailed = usageParticipatingSeasons.map(sid => {
        const s = seasons.find(sea => sea.id === sid)!;
        const f = fields.find(field => field.id === s.fieldId)!;
        return {
          fieldId: s.fieldId,
          seasonId: s.id,
          fieldArea: f?.area || 1
        };
      });

      const parsedManual: { [key: string]: number } = {};
      Object.keys(manualUsageAllocations).forEach(k => {
        parsedManual[k] = parseFloat(manualUsageAllocations[k]) || 0;
      });

      // Split base quantity
      const calculatedAlloc = calculateAllocations(qty, usageAllocationRule, participatingDetailed, parsedManual);

      const usageAllocWithRates = calculatedAlloc.map(al => ({
        fieldId: al.fieldId,
        seasonId: al.seasonId,
        quantity: al.amount, // Alloc splits quantity in this case
        amount: Number((al.amount * selectedStock.weightedAverageCost).toFixed(2))
      }));

      newUsage = {
        id: `use_${Date.now()}`,
        stockItemId: selectedItemId,
        quantityUsed: qty,
        date: usageDate,
        targetType: 'common',
        commonAllocationRule: usageAllocationRule,
        allocations: usageAllocWithRates,
        linkedActivityId: usageLinkedActivityId || undefined
      };
    }

    onAddUsage(newUsage);
    closeAndReset();
  };

  const closeAndReset = () => {
    setIsOpenAddModal(false);
    setItemName('');
    setItemUnit('');
    setPurchaseQty('');
    setPurchaseCost('');
    setSelectedItemId('');
    setUsageQty('');
    setErrorMessage('');
    setUsageParticipatingSeasons([]);
    setManualUsageAllocations({});
  };

  const totalInventoryValue = computedStockList.reduce((sum, item) => sum + (item.quantityOnHand * item.weightedAverageCost), 0);

  return (
    <div className="space-y-6">
      {/* Upper Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <span className="p-3.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
              <Archive size={20} />
            </span>
            <div>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Inventory Sown Value</span>
              <p className="text-xl font-bold font-mono text-slate-800 mt-0.5">
                {currency}{totalInventoryValue.toLocaleString('en-IN')}
              </p>
            </div>
          </div>
          <span className="text-[10px] bg-emerald-50 border border-emerald-150 font-bold px-2.5 py-1 rounded-lg text-emerald-800 uppercase tracking-wider">Asset Reserve</span>
        </div>

        <div className="bg-white px-5 py-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250">
            {(['levels', 'purchases', 'usages'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveSegment(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all cursor-pointer ${
                  activeSegment === tab ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-400 hover:text-slate-750'
                }`}
              >
                {tab === 'levels' ? 'Reserves' : tab === 'purchases' ? 'Intakes' : 'Usage'}
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setSelectedItemId(stockItems[0]?.id || '');
              setUsageSeasonId(activeSeasons[0]?.id || '');
              setModalType('purchase');
              setIsOpenAddModal(true);
            }}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs transition-all"
          >
            <Plus size={14} />
            <span>Record Ledger</span>
          </button>
        </div>
      </div>

      {/* CORE SEGMENTS */}
      {activeSegment === 'levels' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Stock Reserves Valuation</h3>
            <button
              onClick={() => {
                setModalType('item');
                setIsOpenAddModal(true);
              }}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
              {computedStockList.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center text-slate-400 font-semibold">
                    No farm inputs created yet. Record inventory stock elements to calculate averages.
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SEGMENT PURCHASES */}
      {activeSegment === 'purchases' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Stock Purchasing Ledger (Intakes)</h3>
            <span className="text-[10px] font-bold text-emerald-750 bg-emerald-50 border border-emerald-100 px-2.5 py-0.5 rounded-md uppercase tracking-wider">Capital Outlays</span>
          </div>

          <div className="divide-y divide-slate-100">
            {purchases.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-semibold text-xs">No stock purchases logged yet.</div>
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
      )}

      {/* SEGMENT USAGES */}
      {activeSegment === 'usages' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Field Usage Consumptions</h3>
            <span className="text-[10px] font-bold text-slate-550 block bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">Weighted Consumption</span>
          </div>

          <div className="divide-y divide-slate-100">
            {usages.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-bold text-xs">No inputs consumed on fields yet.</div>
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
      )}

      {/* INTAKE / CONSUMPTION ENTRY MODAL */}
      {isOpenAddModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header switcher */}
            <div className="border-b border-gray-150 bg-gray-50/50 p-2 flex">
              <button
                type="button"
                onClick={() => setModalType('purchase')}
                className={`flex-1 text-center py-2 px-1.5 rounded-xl text-xs font-bold transition-all ${
                  modalType === 'purchase' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-450 hover:text-gray-600'
                }`}
              >
                Log Input Purchase (Asset)
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalType('usage');
                  setUsageSeasonId(activeSeasons[0]?.id || '');
                }}
                className={`flex-1 text-center py-2 px-1.5 rounded-xl text-xs font-bold transition-all ${
                  modalType === 'usage' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-450 hover:text-gray-600'
                }`}
              >
                Log Field Usage (Expense)
              </button>
            </div>

            {/* ITEM CREATION FORM */}
            {modalType === 'item' && (
              <form onSubmit={handleSaveStockItem} className="p-6 space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Add Sown Material / Input Type</h3>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Item Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NPK Fertilizer / Hybrid Corn Seed"
                    value={itemName}
                    onChange={e => setItemName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category Type</label>
                    <select
                      value={itemType}
                      onChange={e => setItemType(e.target.value as StockItem['type'])}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-750"
                    >
                      <option value="Seed">Seed</option>
                      <option value="Fertilizer">Fertilizer</option>
                      <option value="Pesticide">Pesticide</option>
                      <option value="Fuel">Fuel</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Unit of Measure</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. bags, kg, litres"
                      value={itemUnit}
                      onChange={e => setItemUnit(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    Create Material
                  </button>
                </div>
              </form>
            )}

            {/* LOG PURCHASE FORM */}
            {modalType === 'purchase' && (
              <form onSubmit={handleSavePurchase} className="p-6 space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Record Input Intake Purchase (Asset)</h3>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sown Stock Item type</label>
                  <select
                    value={selectedItemId}
                    required
                    onChange={e => setSelectedItemId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  >
                    {stockItems.map(i => (
                      <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Quantity Purchased</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 20"
                      value={purchaseQty}
                      onChange={e => setPurchaseQty(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Total Bill Cost ({currency})</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 7000"
                      value={purchaseCost}
                      onChange={e => setPurchaseCost(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Purchase Date</label>
                    <input
                      type="date"
                      required
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Funder (Who Funded?)</label>
                    <select
                      value={purchasePayer}
                      onChange={e => setPurchasePayer(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
                  >
                    Save Purchase
                  </button>
                </div>
              </form>
            )}

            {/* LOG USAGE FORM */}
            {modalType === 'usage' && (
              <form onSubmit={handleSaveUsage} className="p-6 space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Log Crop Field Stock Usage (Expense)</h3>

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[10px] flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Select Material</label>
                    <select
                      value={selectedItemId}
                      required
                      onChange={e => {
                        setSelectedItemId(e.target.value);
                        setErrorMessage('');
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      {stockItems.map(i => {
                        const level = computedStockList.find(c => c.id === i.id);
                        return (
                          <option key={i.id} value={i.id}>
                            {i.name} ({level?.quantityOnHand} remaining)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Quantity Sown/Used</label>
                    <input
                      type="number"
                      required
                      placeholder="Input qty"
                      value={usageQty}
                      onChange={e => {
                        setUsageQty(e.target.value);
                        setErrorMessage('');
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date Sown/Used</label>
                    <input
                      type="date"
                      required
                      value={usageDate}
                      onChange={e => setUsageDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target Type</label>
                    <select
                      value={usageTargetType}
                      onChange={e => setUsageTargetType(e.target.value as 'single' | 'common')}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      <option value="single">Single Field Crop</option>
                      <option value="common">Commonly Consumed</option>
                    </select>
                  </div>
                </div>

                {usageTargetType === 'single' ? (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Crop Cycle Destination</label>
                    <select
                      value={usageSeasonId}
                      required
                      onChange={e => setUsageSeasonId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
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
                  <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-150">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Division Rule</span>
                      <select
                        value={usageAllocationRule}
                        onChange={e => setUsageAllocationRule(e.target.value as CommonAllocationType)}
                        className="bg-white border border-gray-100 rounded-lg text-[10px] px-2 py-1"
                      >
                        <option value="equal">Equal Split</option>
                        <option value="area">Area Proportional (Acres)</option>
                        <option value="manual">Manual Quantities</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Fields Participating</span>
                      {activeSeasons.map(s => {
                        const f = fields.find(field => field.id === s.fieldId)!;
                        const isChecked = usageParticipatingSeasons.includes(s.id);
                        return (
                          <div key={s.id} className="flex justify-between items-center text-xs">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setUsageParticipatingSeasons(prev => prev.filter(id => id !== s.id));
                                  } else {
                                    setUsageParticipatingSeasons(prev => [...prev, s.id]);
                                  }
                                }}
                                className="rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="font-semibold text-gray-700">{s.cropName} ({f?.name})</span>
                            </label>
                            {isChecked && (
                              <div className="flex items-center gap-1">
                                {usageAllocationRule === 'manual' ? (
                                  <input
                                    type="number"
                                    placeholder="Qty used"
                                    value={manualUsageAllocations[`${s.fieldId}_${s.id}`] || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setManualUsageAllocations(prev => ({
                                        ...prev,
                                        [`${s.fieldId}_${s.id}`]: val
                                      }));
                                    }}
                                    className="w-20 bg-white border border-gray-100 rounded-md px-1.5 py-0.5 text-right text-[10px]"
                                  />
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-semibold mono-num">
                                    {isChecked && usageQty ? (
                                      <>
                                        {Math.round(
                                          calculateAllocations(
                                            parseFloat(usageQty) || 0,
                                            usageAllocationRule,
                                            usageParticipatingSeasons.map(sid => {
                                              const targetS = seasons.find(sea => sea.id === sid)!;
                                              return {
                                                fieldId: targetS.fieldId,
                                                seasonId: targetS.id,
                                                fieldArea: fields.find(fd => fd.id === targetS.fieldId)?.area || 1
                                              };
                                            })
                                          ).find(al => al.seasonId === s.id)?.amount || 0
                                        )}{' '}
                                        {stockItems.find(i => i.id === selectedItemId)?.unit}
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
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Link to Diary Event (Optional)</label>
                  <select
                    value={usageLinkedActivityId}
                    onChange={e => setUsageLinkedActivityId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  >
                    <option value="">Do not link to activity</option>
                    {activities.filter(a => usageTargetType === 'single' ? a.seasonId === usageSeasonId : true).map(a => (
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
                    className="flex-1 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white shadow-sm"
                  >
                    Log Usage
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
