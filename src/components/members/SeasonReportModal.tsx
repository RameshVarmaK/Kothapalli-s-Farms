/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Member,
  Field,
  Season,
  Expense,
  Labour,
  HarvestRevenue,
  StockUsage,
  StockItem,
  StockPurchase,
  Activity,
} from '../../types';
import { computeStockLevels } from '../../utils/calculations';
import { X, Copy, Check, Calendar, DollarSign, Package, Users, CheckCircle } from 'lucide-react';

interface SeasonReportModalProps {
  seasonId: string | null;
  onClose: () => void;
  seasons: Season[];
  fields: Field[];
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  usages: StockUsage[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  activities: Activity[];
  members: Member[];
  currency: string;
  copiedReportText: boolean;
  setCopiedReportText: (v: boolean) => void;
}

export const SeasonReportModal: React.FC<SeasonReportModalProps> = ({
  seasonId,
  onClose,
  seasons,
  fields,
  expenses,
  labours,
  revenues,
  usages,
  stockItems,
  purchases,
  activities,
  members,
  currency,
  copiedReportText,
  setCopiedReportText,
}) => {
  if (!seasonId) return null;
  const season = seasons.find(s => s.id === seasonId);
  if (!season) return null;
  const field = fields.find(f => f.id === season.fieldId)!;

  const sExpenses = expenses.filter(e => e.targetType === 'single' && e.targetSeasonId === season.id);
  const sAllocations = expenses.filter(e => e.targetType === 'common' && e.allocations?.some(al => al.seasonId === season.id));
  const sLabours = labours.filter(l => l.targetType !== 'common' && l.seasonId === season.id);
  const sLabourAllocations = labours.filter(l => l.targetType === 'common' && l.allocations?.some(al => al.seasonId === season.id));
  const computedSt = computeStockLevels(stockItems, purchases, usages);

  const sUsagesDirect = usages.filter(u => u.targetType === 'single' && u.targetSeasonId === season.id);
  const sUsagesCommon = usages.filter(u => u.targetType === 'common' && u.allocations?.some(al => al.seasonId === season.id));

  const sumDir = sExpenses.reduce((sum, e) => sum + e.amount, 0);
  const sumAlloc = sAllocations.reduce((sum, e) => {
    const al = e.allocations?.find(a => a.seasonId === season.id);
    return sum + (al ? al.amount : 0);
  }, 0);
  const sumLabDirect = sLabours.reduce((sum, l) => sum + l.totalCost, 0);
  const sumLabAlloc = sLabourAllocations.reduce((sum, l) => {
    const al = l.allocations?.find(a => a.seasonId === season.id);
    return sum + (al ? al.amount : 0);
  }, 0);
  const sumLab = sumLabDirect + sumLabAlloc;

  const sumStDirect = sUsagesDirect.reduce((sum, u) => {
    const item = computedSt.find(si => si.id === u.stockItemId);
    return sum + (u.quantityUsed * (item ? item.weightedAverageCost : 0));
  }, 0);
  const sumStCommon = sUsagesCommon.reduce((sum, u) => {
    const item = computedSt.find(si => si.id === u.stockItemId);
    const al = u.allocations?.find(a => a.seasonId === season.id);
    return sum + ((al ? al.quantity : 0) * (item ? item.weightedAverageCost : 0));
  }, 0);
  const sumStock = sumStDirect + sumStCommon;

  const sRevenues = revenues.filter(r => r.seasonId === season.id);
  const sumRev = sRevenues.reduce((sum, r) => sum + r.saleAmount, 0);

  const totCost = sumDir + sumAlloc + sumLab + sumStock;
  const netPayback = sumRev - totCost;

  const sAct = activities.filter(a => a.seasonId === season.id).sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Dynamic Text layout report builder
  const generateTextReport = () => {
    let text = `==================================================\n`;
    text    += `KOTHAPALLI FARMS - CROP CYCLE GENERAL REPORT\n`;
    text    += `==================================================\n`;
    text    += `Crop Cycle Name : ${season.cropName}\n`;
    text    += `Sown Field Plot : ${field ? field.name : 'Unknown'} (${field ? field.area : 0} acres)\n`;
    text    += `Started Date    : ${season.startDate}\n`;
    text    += `Status          : ${season.isClosed ? `Closed Harvested on ${season.endDate}` : 'Active Cycle'}\n`;
    text    += `--------------------------------------------------\n`;
    text    += `FINANCIAL RECONCILIATION SUMMARY\n`;
    text    += `--------------------------------------------------\n`;
    text    += `Total Direct Cash Outlays:    ${currency}${Math.round(sumDir).toLocaleString('en-IN')}\n`;
    text    += `Total Allocated Common Outlays:${currency}${Math.round(sumAlloc).toLocaleString('en-IN')}\n`;
    text    += `Total Hired Labor Outlays:    ${currency}${Math.round(sumLab).toLocaleString('en-IN')}\n`;
    text    += `Consumed Stock Room Outlays:  ${currency}${Math.round(sumStock).toLocaleString('en-IN')}\n`;
    text    += `--------------------------------------------------\n`;
    text    += `TOTAL CROP CYCLE EXPENSES:    ${currency}${Math.round(totCost).toLocaleString('en-IN')}\n`;
    text    += `TOTAL CROP SALES REVENUE:     ${currency}${Math.round(sumRev).toLocaleString('en-IN')}\n`;
    text    += `NET PAYBACK (EARNINGS):       ${currency}${Math.round(netPayback).toLocaleString('en-IN')}\n\n`;

    text    += `SECTION 1: TIMELINE ACTIVITY LOGS\n`;
    if (sAct.length === 0) {
      text  += `No activity logs registered.\n`;
    } else {
      sAct.forEach((a, i) => {
        text += `${i + 1}. [${a.date}] (${a.type}): ${a.notes}${a.weatherNote ? ` (Weather: ${a.weatherNote})` : ''}\n`;
      });
    }
    text    += `\nSECTION 2: CASH OUTLAYS & DIRECT EXPENSES\n`;
    const combinedExps = [...sExpenses, ...sAllocations];
    if (combinedExps.length === 0) {
      text  += `No cash outlays registered.\n`;
    } else {
      combinedExps.forEach((e, i) => {
        const payer = members.find(m => m.id === e.paidByMemberId)?.name || 'Unknown';
        const isCommon = e.targetType === 'common';
        const actualAmt = isCommon ? (e.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : e.amount;
        text += `${i + 1}. [${e.date}] ${e.category}: ${currency}${Math.round(actualAmt).toLocaleString('en-IN')} (Paid by ${payer})${isCommon ? ' [Allocated split]' : ''}\n`;
      });
    }

    text    += `\nSECTION 3: CONSTITUENT STOCK INVENTORY CONSUMED\n`;
    const combinedUsages = [...sUsagesDirect, ...sUsagesCommon];
    if (combinedUsages.length === 0) {
      text  += `No stock materials consumed.\n`;
    } else {
      combinedUsages.forEach((u, i) => {
        const item = stockItems.find(si => si.id === u.stockItemId);
        const stName = item ? item.name : 'Unknown Item';
        const stUnit = item ? item.unit : '';
        const isCommon = u.targetType === 'common';
        const qty = isCommon ? (u.allocations?.find(al => al.seasonId === season.id)?.quantity || 0) : u.quantityUsed;
        const rRate = item ? item.weightedAverageCost : 0;
        text += `${i + 1}. [${u.date}] ${stName}: ${qty} ${stUnit} at ${currency}${Math.round(rRate)}/unit. Cost: ${currency}${Math.round(qty * rRate).toLocaleString('en-IN')}${isCommon ? ' [Allocated split]' : ''}\n`;
      });
    }

    text    += `\nSECTION 4: HIRED LABOR MANPOWER UTILIZED\n`;
    const combinedLabours = [...sLabours, ...sLabourAllocations];
    if (combinedLabours.length === 0) {
      text  += `No hired labor shifts registered.\n`;
    } else {
      combinedLabours.forEach((l, i) => {
        const payer = members.find(m => m.id === l.paidByMemberId)?.name || 'Unknown';
        const isCommon = l.targetType === 'common';
        const actualCost = isCommon ? (l.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : l.totalCost;
        text += `${i + 1}. [${l.date}] ${l.workersCount} workers at ${currency}${l.wageRate}/worker. Total Cost: ${currency}${Math.round(actualCost).toLocaleString('en-IN')} (Paid by ${payer})${isCommon ? ' [Allocated split]' : ''}\n`;
      });
    }

    text    += `\nSECTION 5: HARVEST YIELD EARNINGS\n`;
    if (sRevenues.length === 0) {
      text  += `No harvest yield sales registered.\n`;
    } else {
      sRevenues.forEach((r, i) => {
        const rcvr = members.find(m => m.id === r.receivedByMemberId)?.name || 'Unknown';
        text += `${i + 1}. [${r.date}] Sown crop ${r.crop}: sold ${r.quantity} to ${r.buyerName || 'Local Buyer'} for ${currency}${Math.round(r.saleAmount).toLocaleString('en-IN')} (Received holding by ${rcvr})\n`;
      });
    }

    text    += `\n==================================================\n`;
    text    += `REPORT PREPARED SECURELY ON FARMLEDGER PORTAL`;
    return text;
  };

  const handleCopyTextReport = () => {
    const reportText = generateTextReport();
    navigator.clipboard.writeText(reportText)
      .then(() => {
        setCopiedReportText(true);
        setTimeout(() => setCopiedReportText(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy report: ', err);
      });
  };

  const combinedExps = [...sExpenses, ...sAllocations];
  const combinedUsages = [...sUsagesDirect, ...sUsagesCommon];
  const combinedLabours = [...sLabours, ...sLabourAllocations];

  return (
    <div className="fixed inset-0 z-55 bg-slate-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] animate-in fade-in zoom-in-95 duration-150 border border-slate-100">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-150 flex justify-between items-center bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-150 font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">
                Crop General Report
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-450 font-bold font-mono uppercase tracking-wider bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">ID: {season.id}</span>
            </div>
            <h3 className="text-base font-extrabold text-slate-800 mt-1.5">{season.cropName} Cycle on {field ? field.name : 'Unknown Plot'}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body - Scrollable content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Financial Reconciliation Summary Dashboard */}
          <div>
            <h4 className="text-[10px] font-extrabold text-slate-455 uppercase tracking-widest mb-3">
              Financial Reconciliation Summary
            </h4>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="p-4 rounded-2xl bg-amber-50/30 border border-amber-100 flex flex-col justify-between">
                <span className="text-[9px] text-amber-700 font-bold uppercase block tracking-wider">Direct Outlays</span>
                <span className="text-md font-extrabold text-amber-850 font-mono mt-1.5 block">
                  {currency}{Math.round(sumDir).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-orange-50/30 border border-orange-100 flex flex-col justify-between">
                <span className="text-[9px] text-orange-700 font-bold uppercase block tracking-wider">Common Allocated</span>
                <span className="text-md font-extrabold text-orange-850 font-mono mt-1.5 block">
                  {currency}{Math.round(sumAlloc).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-sky-50/30 border border-sky-100 flex flex-col justify-between">
                <span className="text-[9px] text-sky-700 font-bold uppercase block tracking-wider">Labor Hired</span>
                <span className="text-md font-extrabold text-sky-850 font-mono mt-1.5 block">
                  {currency}{Math.round(sumLab).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-purple-50/30 border border-purple-100 flex flex-col justify-between">
                <span className="text-[9px] text-purple-700 font-bold uppercase block tracking-wider">Stock Consumed</span>
                <span className="text-md font-extrabold text-purple-855 font-mono mt-1.5 block">
                  {currency}{Math.round(sumStock).toLocaleString('en-IN')}
                </span>
              </div>

              <div className={`p-4 rounded-2xl col-span-2 lg:col-span-1 border flex flex-col justify-between ${netPayback >= 0 ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'}`}>
                <span className={`text-[9px] font-bold uppercase block tracking-wider ${netPayback >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>Net Operating Profits</span>
                <span className={`text-md font-extrabold font-mono mt-1.5 block ${netPayback >= 0 ? 'text-emerald-800' : 'text-rose-850'}`}>
                  {currency}{Math.round(netPayback).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="mt-3.5 p-4.5 rounded-2xl bg-emerald-600 text-white flex flex-wrap justify-between items-center gap-3 shadow-2xs">
              <div>
                <span className="text-[9px] text-emerald-150 font-bold uppercase tracking-widest">Total Sales Revenues Got</span>
                <span className="text-lg font-extrabold font-mono block mt-0.5">
                  {currency}{Math.round(sumRev).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-emerald-150 font-bold uppercase tracking-widest">Total Operating Expenses Outlay</span>
                <span className="text-lg font-extrabold font-mono block mt-0.5">
                  {currency}{Math.round(totCost).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Timelines Activity Logs */}
          <div className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-455 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-250 pb-2">
              <Calendar size={13} className="text-slate-500" />
              <span>Section 1: Timelines Activity Logs</span>
            </h4>
            {sAct.length === 0 ? (
              <p className="text-slate-400 text-xs italic">No crop activity timeline logs registered for this season cycle.</p>
            ) : (
              <div className="space-y-3">
                {sAct.map((a, i) => (
                  <div key={a.id} className="text-xs flex items-start gap-2.5">
                    <span className="text-slate-400 font-bold font-mono">[{a.date}]</span>
                    <div>
                      <span className="font-bold text-slate-700 bg-slate-200/60 px-1.5 py-0.5 rounded-md text-[9px] mr-1.5 uppercase tracking-wider">{a.type}</span>
                      <span className="text-slate-600 font-medium">{a.notes}</span>
                      {a.weatherNote && (
                        <span className="text-[10px] text-slate-450 italic mt-0.5 block">Weather report context: {a.weatherNote}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Cash Outlays & Direct Expenses */}
          <div className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-455 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-250 pb-2">
              <DollarSign size={13} className="text-slate-500" />
              <span>Section 2: Cash Outlays & Direct Expenses</span>
            </h4>
            {combinedExps.length === 0 ? (
              <p className="text-slate-400 text-xs italic">No cash expenses associated with this cycle.</p>
            ) : (
              <div className="space-y-2.5">
                {combinedExps.map(e => {
                  const payer = members.find(m => m.id === e.paidByMemberId)?.name || 'Unknown';
                  const isCommon = e.targetType === 'common';
                  const actualAmt = isCommon ? (e.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : e.amount;
                  return (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-400">[{e.date}]</span>
                        <span className="font-bold text-slate-705">{e.category}</span>
                        {isCommon && <span className="text-[9px] bg-amber-50 text-amber-705 border border-amber-150 font-bold px-1.5 rounded-md uppercase">Common Allocated split</span>}
                      </div>
                      <span className="font-bold font-mono text-slate-800">
                        {currency}{Math.round(actualAmt).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400 font-medium">by {payer}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Constituent Stock Inventory Consumed */}
          <div className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-455 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-250 pb-2">
              <Package size={13} className="text-slate-500" />
              <span>Section 3: Stock Materials Consumed</span>
            </h4>
            {combinedUsages.length === 0 ? (
              <p className="text-slate-400 text-xs italic">No material seed/input inventory usage recorded.</p>
            ) : (
              <div className="space-y-2.5">
                {combinedUsages.map(u => {
                  const item = stockItems.find(si => si.id === u.stockItemId);
                  const rate = item ? item.weightedAverageCost : 0;
                  const isCommon = u.targetType === 'common';
                  const qty = isCommon ? (u.allocations?.find(al => al.seasonId === season.id)?.quantity || 0) : u.quantityUsed;
                  return (
                    <div key={u.id} className="flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-400">[{u.date}]</span>
                        <span className="font-bold text-slate-705">{item ? item.name : 'Unknown Item'}</span>
                        {isCommon && <span className="text-[9px] bg-purple-50 text-purple-750 border border-purple-150 font-bold px-1.5 rounded uppercase">Split</span>}
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {qty} {item ? item.unit : ''} @ {currency}{Math.round(rate)} = {currency}{Math.round(qty * rate).toLocaleString('en-IN')}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Hired Labor Manpower Utilized */}
          <div className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-455 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-250 pb-2">
              <Users size={13} className="text-slate-500" />
              <span>Section 4: Hired Labor Manpower Utilized</span>
            </h4>
            {combinedLabours.length === 0 ? (
              <p className="text-slate-400 text-xs italic">No hired daily wage worker logs associated.</p>
            ) : (
              <div className="space-y-2.5">
                {combinedLabours.map(l => {
                  const payer = members.find(m => m.id === l.paidByMemberId)?.name || 'Unknown';
                  const isCommon = l.targetType === 'common';
                  const actualCost = isCommon ? (l.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : l.totalCost;
                  return (
                    <div key={l.id} className="flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-400">[{l.date}]</span>
                        <span className="font-bold text-slate-705">{l.workersCount} worker(s) at {currency}{l.wageRate}/worker</span>
                        {isCommon && <span className="text-[9px] bg-amber-50 text-amber-705 border border-amber-150 font-bold px-1.5 rounded-md uppercase">Common Allocated split</span>}
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {currency}{Math.round(actualCost).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400 font-medium">paid by {payer}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 5: Harvest Yield Earnings */}
          <div className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-455 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-250 pb-2">
              <CheckCircle size={13} className="text-slate-500" />
              <span>Section 5: Harvest Yield Earnings</span>
            </h4>
            {sRevenues.length === 0 ? (
              <p className="text-slate-400 text-xs italic">No crops sales transactions registered for this cycle.</p>
            ) : (
              <div className="space-y-2.5">
                {sRevenues.map(r => {
                  const rcvr = members.find(m => m.id === r.receivedByMemberId)?.name || 'Unknown';
                  return (
                    <div key={r.id} className="flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-400">[{r.date}]</span>
                        <span className="font-bold text-slate-705">{r.crop} (Yield: {r.quantity} sold{r.buyerName ? ` to ${r.buyerName}` : ''})</span>
                      </div>
                      <span className="font-mono font-bold text-slate-800">
                        {currency}{Math.round(r.saleAmount).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400 font-medium">held by {rcvr}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Modal Footer */}
        <div className="p-6 border-t border-slate-150 bg-slate-50/60 flex items-center justify-end gap-3.5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-650 rounded-xl cursor-pointer"
          >
            Close View
          </button>
          <button
            type="button"
            onClick={handleCopyTextReport}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs hover:shadow-md transition-all flex items-center gap-2 active:scale-95"
          >
            {copiedReportText ? <Check size={14} className="animate-bounce" /> : <Copy size={14} />}
            <span>{copiedReportText ? 'Copied Full Report!' : 'Export & Copy Report'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
