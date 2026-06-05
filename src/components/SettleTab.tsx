/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Field,
  Season,
  Member,
  Expense,
  Labour,
  HarvestRevenue,
  StockUsage,
  StockItem,
  StockPurchase
} from '../types';
import { buildSettlementLedger, computeStockLevels } from '../utils/calculations';
import { CheckCircle2, AlertOctagon, Download, Share2, Printer, ClipboardCheck } from 'lucide-react';
import { convertToCSV, downloadFile } from '../utils/database';

interface SettleTabProps {
  fields: Field[];
  seasons: Season[];
  members: Member[];
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  usages: StockUsage[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  currency: string;
}

export const SettleTab: React.FC<SettleTabProps> = ({
  fields,
  seasons,
  members,
  expenses,
  labours,
  revenues,
  usages,
  stockItems,
  purchases,
  currency
}) => {
  const [selectedSeasonIds, setSelectedSeasonIds] = useState<string[]>(
    seasons.map(s => s.id)
  );

  const [clearedDebts, setClearedDebts] = useState<string[]>(() => {
    const saved = localStorage.getItem('farmledger_cleared_debts');
    return saved ? JSON.parse(saved) : [];
  });

  const [clearedSubEntries, setClearedSubEntries] = useState<string[]>(() => {
    const saved = localStorage.getItem('farmledger_cleared_sub_entries');
    return saved ? JSON.parse(saved) : [];
  });

  const toggleClearedDebt = (key: string) => {
    setClearedDebts(prev => {
      const next = prev.includes(key)
        ? prev.filter(k => k !== key)
        : [...prev, key];
      localStorage.setItem('farmledger_cleared_debts', JSON.stringify(next));
      return next;
    });
  };

  const toggleSeasonSelection = (seasonId: string) => {
    if (selectedSeasonIds.includes(seasonId)) {
      setSelectedSeasonIds(prev => prev.filter(id => id !== seasonId));
    } else {
      setSelectedSeasonIds(prev => [...prev, seasonId]);
    }
  };

  const selectAll = () => {
    setSelectedSeasonIds(seasons.map(s => s.id));
  };

  const selectOnlyOpen = () => {
    setSelectedSeasonIds(seasons.filter(s => !s.isClosed).map(s => s.id));
  };

  const [copiedCSV, setCopiedCSV] = useState(false);

  const summary = buildSettlementLedger(
    fields,
    seasons,
    members,
    expenses,
    labours,
    revenues,
    usages,
    stockItems,
    purchases,
    selectedSeasonIds
  );

  // Run per-season matching to get sub-entries (individual season simplified debts)
  const allSeasonDebts = summary.ledgers.flatMap(ledger => {
    const seasonPositions = ledger.statements.map(stmt => ({
      memberId: stmt.memberId,
      name: stmt.memberName,
      balance: stmt.netPosition
    }));

    let sCreditors = seasonPositions.filter(p => p.balance > 0.01).sort((a, b) => b.balance - a.balance);
    let sDebtors = seasonPositions.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance);

    const seasonSimplifiedDebts: { seasonId: string; seasonCrop: string; fromId: string; fromName: string; toId: string; toName: string; amount: number }[] = [];

    while (sCreditors.length > 0 && sDebtors.length > 0) {
      const debtor = sDebtors[0];
      const creditor = sCreditors[0];

      const oweAmt = Math.abs(debtor.balance);
      const recAmt = creditor.balance;
      const settleAmt = Number(Math.min(oweAmt, recAmt).toFixed(2));

      seasonSimplifiedDebts.push({
        seasonId: ledger.seasonId,
        seasonCrop: ledger.cropName,
        fromId: debtor.memberId,
        fromName: debtor.name,
        toId: creditor.memberId,
        toName: creditor.name,
        amount: settleAmt
      });

      debtor.balance = Number((debtor.balance + settleAmt).toFixed(2));
      creditor.balance = Number((creditor.balance - settleAmt).toFixed(2));

      sCreditors = sCreditors.filter(p => p.balance > 0.01).sort((a, b) => b.balance - a.balance);
      sDebtors = sDebtors.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance);
    }

    return seasonSimplifiedDebts;
  });

  const toggleClearedSubEntry = (sub: typeof allSeasonDebts[0], parentDebtKey: string) => {
    const subKey = `${sub.seasonId}:${sub.fromId}:${sub.toId}:${Math.round(sub.amount)}`;

    setClearedSubEntries(prev => {
      const next = prev.includes(subKey)
        ? prev.filter(k => k !== subKey)
        : [...prev, subKey];
      localStorage.setItem('farmledger_cleared_sub_entries', JSON.stringify(next));
      return next;
    });

    // Unchecking any sub-entry immediately voids main explicit clearing
    setClearedDebts(prev => {
      const next = prev.filter(k => k !== parentDebtKey);
      localStorage.setItem('farmledger_cleared_debts', JSON.stringify(next));
      return next;
    });
  };

  const handleClearMainDebt = (debt: typeof summary.debts[0], subEntries: typeof allSeasonDebts) => {
    const debtKey = `${selectedSeasonIds.slice().sort().join(',')}:${debt.fromId}:${debt.toId}:${Math.round(debt.amount)}`;

    setClearedDebts(prev => {
      const next = prev.includes(debtKey) ? prev : [...prev, debtKey];
      localStorage.setItem('farmledger_cleared_debts', JSON.stringify(next));
      return next;
    });

    const subKeysToAdd = subEntries.map(s => `${s.seasonId}:${s.fromId}:${s.toId}:${Math.round(s.amount)}`);
    setClearedSubEntries(prev => {
      const next = [...new Set([...prev, ...subKeysToAdd])];
      localStorage.setItem('farmledger_cleared_sub_entries', JSON.stringify(next));
      return next;
    });
  };

  const handleUnclearMainDebt = (debt: typeof summary.debts[0], subEntries: typeof allSeasonDebts) => {
    const debtKey = `${selectedSeasonIds.slice().sort().join(',')}:${debt.fromId}:${debt.toId}:${Math.round(debt.amount)}`;

    setClearedDebts(prev => {
      const next = prev.filter(k => k !== debtKey);
      localStorage.setItem('farmledger_cleared_debts', JSON.stringify(next));
      return next;
    });

    const subKeysToRemove = new Set(subEntries.map(s => `${s.seasonId}:${s.fromId}:${s.toId}:${Math.round(s.amount)}`));
    setClearedSubEntries(prev => {
      const next = prev.filter(key => !subKeysToRemove.has(key));
      localStorage.setItem('farmledger_cleared_sub_entries', JSON.stringify(next));
      return next;
    });
  };

  // CSV Export
  const handleExportCSV = () => {
    const csvData = Object.values(summary.membersTotalStatements).map(stmt => ({
      'Partner Name': stmt.memberName,
      'Entitled Crop Profit': mtFormat(stmt.entitledAmount),
      'Spent Funding Outlay': mtFormat(stmt.paidAmount),
      'Revenue Collected': mtFormat(stmt.receivedAmount),
      'Net Settle Balance': mtFormat(stmt.netPosition),
      'Action Requirement': stmt.netPosition >= 0 ? 'Receives' : 'Pays'
    }));

    const csvContent = convertToCSV(csvData);
    downloadFile(csvContent, `farmledger_settlement_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv');
  };

  const handleShareCSV = () => {
    const csvData = Object.values(summary.membersTotalStatements).map(stmt => ({
      'Partner Name': stmt.memberName,
      'Entitled Crop Profit': mtFormat(stmt.entitledAmount),
      'Spent Funding Outlay': mtFormat(stmt.paidAmount),
      'Revenue Collected': mtFormat(stmt.receivedAmount),
      'Net Settle Balance': mtFormat(stmt.netPosition),
      'Action Requirement': stmt.netPosition >= 0 ? 'Receives' : 'Pays'
    }));

    const csvContent = convertToCSV(csvData);
    navigator.clipboard.writeText(csvContent)
      .then(() => {
        setCopiedCSV(true);
        setTimeout(() => setCopiedCSV(false), 2000);
      })
      .catch(err => {
        console.error('Failed to copy CSV: ', err);
      });
  };

  const mtFormat = (val: number) => {
    return Math.round(val);
  };

  return (
    <div className="space-y-6 print:landscape-print" id="settlement-invoice">
      {/* Selector and Settings Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 print:hidden">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="font-bold text-xs uppercase tracking-wider text-slate-400">Select Cropping seasons for Settlement</h3>
          <div className="flex gap-2 text-[10px]">
            <button onClick={selectAll} className="text-emerald-700 font-bold px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 rounded-lg cursor-pointer">
              Include All
            </button>
            <button onClick={selectOnlyOpen} className="text-slate-600 font-bold px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg cursor-pointer">
              Include Active Only
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {seasons.map(s => {
            const f = fields.find(field => field.id === s.fieldId)!;
            const isSelected = selectedSeasonIds.includes(s.id);
            return (
              <button
                key={s.id}
                onClick={() => toggleSeasonSelection(s.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200 shadow-2xs'
                    : 'bg-white text-slate-400 border-slate-200 hover:border-slate-350'
                }`}
              >
                <span>{s.cropName}</span>
                <span className="text-[9px] text-slate-400 mt-1 font-medium">{f?.name || 'Unknown Field'}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* INVARIANT AND LEDGER VERIFIER ROW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Verification Check */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          {summary.isBalanced ? (
            <span className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 shrink-0 border border-emerald-100 shadow-2xs">
              <CheckCircle2 size={22} />
            </span>
          ) : (
            <span className="p-2.5 rounded-xl bg-amber-50 text-amber-500 shrink-0 border border-amber-100 shadow-2xs">
              <AlertOctagon size={22} />
            </span>
          )}
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Ledger Balances Check</span>
            <p className="text-sm font-bold text-slate-800 mt-0.5">
              {summary.isBalanced ? '✓ Settlement engine balances exactly to zero' : '⚠ Balancing Discrepancy'}
            </p>
            <span className="text-[10px] text-slate-400 font-bold block mt-0.5 mono-num uppercase">
              Difference: {currency}{summary.totalSettlementDiscrepancy}
            </span>
          </div>
        </div>

        {/* Total Expense Attributed */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-3.5">
          <span className="p-2.5 rounded-xl bg-slate-50 text-slate-600 shrink-0 border border-slate-150">
            <ClipboardCheck size={20} />
          </span>
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Total Funds Disbursed</span>
            <p className="text-sm font-bold text-slate-800 mt-0.5 font-mono">
              {currency}{Math.round(summary.ledgers.reduce((sum, l) => sum + l.totalExpense, 0)).toLocaleString('en-IN')}
            </p>
            <span className="text-[10px] text-slate-450 font-bold block mt-0.5 uppercase">100% purchases tracked</span>
          </div>
        </div>

        {/* Actions panel */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-around print:hidden gap-1">
          <button
            onClick={handleExportCSV}
            className="flex flex-col items-center gap-1.5 text-xs text-slate-600 font-bold hover:text-emerald-700 hover:bg-slate-50 px-2.5 py-2.5 border border-slate-150 hover:border-slate-350 rounded-xl transition-all cursor-pointer flex-1 text-center"
          >
            <Download size={16} />
            <span>Export CSV</span>
          </button>
          <button
            onClick={handleShareCSV}
            className="flex flex-col items-center gap-1.5 text-xs text-slate-600 font-bold hover:text-emerald-700 hover:bg-slate-50 px-2.5 py-2.5 border border-slate-150 hover:border-slate-350 rounded-xl transition-all cursor-pointer flex-1 text-center"
          >
            <Share2 size={16} className={copiedCSV ? "text-emerald-600 animate-bounce" : ""} />
            <span>{copiedCSV ? 'Copied CSV!' : 'Share CSV'}</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex flex-col items-center gap-1.5 text-xs text-slate-600 font-bold hover:text-emerald-700 hover:bg-slate-50 px-2.5 py-2.5 border border-slate-150 hover:border-slate-350 rounded-xl transition-all cursor-pointer flex-1 text-center"
          >
            <Printer size={16} />
            <span>Print PDF</span>
          </button>
        </div>
      </div>

      {/* MAIN SETTLEMENT MATRIX TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Settlement Matrix Table</h3>
          <span className="text-[10px] font-bold text-emerald-700 tracking-widest bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-lg">
            TRANSPARENT AUDIT SECURE
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold bg-slate-50/50 text-[10px] uppercase tracking-widest">
                <th className="px-6 py-4">Partner Name</th>
                <th className="px-6 py-4 text-right">Entitled Profit</th>
                <th className="px-6 py-4 text-right">Spent Funding</th>
                <th className="px-6 py-4 text-right">Revenue Got</th>
                <th className="px-6 py-4 text-right">Settle Position</th>
                <th className="px-6 py-4 text-right">Recommendation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {Object.values(summary.membersTotalStatements).map(stmt => {
                const isCreditor = stmt.netPosition >= 0;
                return (
                  <tr key={stmt.memberId} className="hover:bg-slate-50/50 transition-all font-medium">
                    <td className="px-6 py-4.5 font-bold text-slate-800">{stmt.memberName}</td>
                    <td className={`px-6 py-4.5 text-right font-mono ${stmt.entitledAmount >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                      {currency}{mtFormat(stmt.entitledAmount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4.5 text-right font-mono text-slate-800">
                      {currency}{mtFormat(stmt.paidAmount).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4.5 text-right font-mono text-slate-800">
                      {currency}{mtFormat(stmt.receivedAmount).toLocaleString('en-IN')}
                    </td>
                    <td className={`px-6 py-4.5 text-right font-bold font-mono ${isCreditor ? 'text-emerald-700 bg-emerald-50/30' : 'text-red-500 bg-red-50/30'}`}>
                      {isCreditor ? '+' : ''}{currency}{mtFormat(stmt.netPosition).toLocaleString('en-IN')}
                    </td>
                    <td className="px-6 py-4.5 text-right">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase border ${isCreditor ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                        {isCreditor ? 'Receives' : 'Pays'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* MINIMIZED WHO-PAYS-WHOM DEBT CLEARING RECOMMENDATIONS */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-sm text-slate-800 uppercase tracking-wider">Minimized Clearing Transfers</h3>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">DEBT SIMPLIFICATION</span>
        </div>

        <div className="p-6 space-y-4">
          {summary.debts.length === 0 ? (
            <div className="text-center py-8 text-emerald-700 font-bold bg-emerald-50/30 rounded-xl border border-emerald-100 flex flex-col items-center justify-center gap-1.5">
              <span className="text-2xl">🏆</span>
              <span className="uppercase text-[11px] tracking-wider text-emerald-800">All partner accounts are perfectly balanced. No clearing transfers needed!</span>
            </div>
          ) : (
            summary.debts.map((debt, idx) => {
              const debtKey = `${selectedSeasonIds.slice().sort().join(',')}:${debt.fromId}:${debt.toId}:${Math.round(debt.amount)}`;
              
              // Find matching individual sub-entries (debts at season level)
              const subEntries = allSeasonDebts.filter(item =>
                (item.fromId === debt.fromId && item.toId === debt.toId) ||
                (item.fromId === debt.toId && item.toId === debt.fromId)
              );

              const isSubEntryCleared = (sub: typeof allSeasonDebts[0]) => {
                const key = `${sub.seasonId}:${sub.fromId}:${sub.toId}:${Math.round(sub.amount)}`;
                return clearedSubEntries.includes(key);
              };

              // Bi-directional rule: If there are sub-entries and ALL are cleared, the main debt is cleared
              const allSubsCleared = subEntries.length > 0 && subEntries.every(isSubEntryCleared);
              const isCleared = clearedDebts.includes(debtKey) || allSubsCleared;

              return (
                <div
                  key={idx}
                  className={`flex flex-col p-5 rounded-2xl border transition-all gap-4 ${
                    isCleared
                      ? 'bg-emerald-55/30 border-emerald-250 bg-emerald-50/20'
                      : 'bg-slate-50 border-slate-200 hover:border-slate-350'
                  }`}
                >
                  {/* Main Entry row */}
                  <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <span className={`font-bold text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-lg border ${
                        isCleared ? 'bg-emerald-100 text-emerald-850 border-emerald-200' : 'bg-red-50 text-red-650 border-red-100'
                      }`}>
                        Pay Out
                      </span>
                      <div>
                        <span className={`font-bold text-sm ${isCleared ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {debt.fromName}
                        </span>
                        <span className="text-slate-400 text-[10px] font-bold uppercase block mt-1">Transfer directly</span>
                      </div>
                    </div>

                    <div className="text-center px-5 py-3 bg-white rounded-2xl border border-slate-200 border-dashed min-w-[140px] flex flex-col justify-center items-center shrink-0">
                      <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider mb-1">Clears Balance</span>
                      <span className={`text-lg font-extrabold font-mono ${isCleared ? 'text-emerald-700/60 line-through' : 'text-emerald-600'}`}>
                        {currency}{mtFormat(debt.amount).toLocaleString('en-IN')}
                      </span>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 text-right w-full md:w-auto">
                      <div className="text-left md:text-right">
                        <span className={`font-bold text-sm ${isCleared ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                          {debt.toName}
                        </span>
                        <span className="text-slate-400 text-[10px] font-bold uppercase block mt-1">Recovers outlay</span>
                      </div>
                      <span className={`font-bold text-[10px] tracking-wider uppercase px-2.5 py-1 rounded-lg border ${
                        isCleared ? 'bg-emerald-100 text-emerald-850 border-emerald-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                      }`}>
                        Receive
                      </span>
                    </div>

                    <div className="flex items-center justify-center pt-3 md:pt-0 md:pl-4 md:border-l md:border-slate-200 shrink-0">
                      {isCleared ? (
                        <div className="flex flex-col items-center gap-1">
                          <span className="text-[10px] font-extrabold tracking-wider text-emerald-700 uppercase bg-emerald-100 border border-emerald-205 px-3 py-1.5 rounded-lg flex items-center gap-1.5 shadow-3xs">
                            ✓ Cleared
                          </span>
                          <button
                            onClick={() => handleUnclearMainDebt(debt, subEntries)}
                            className="text-[9px] text-slate-450 hover:text-red-500 hover:underline font-bold cursor-pointer transition-colors"
                          >
                            Mark Uncleared
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleClearMainDebt(debt, subEntries)}
                          className="w-full md:w-auto px-4 py-2.5 bg-emerald-600 hover:bg-emerald-750 font-bold text-white rounded-xl text-[10px] shadow-xs active:scale-95 cursor-pointer transition-all uppercase tracking-wider"
                        >
                          Mark Transferred
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sub-entries Breakdown */}
                  {subEntries.length > 0 && (
                    <div className="mt-2 pt-3.5 border-t border-slate-200/80">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          Constituent Season Sub-Debts ({subEntries.length})
                        </span>
                        <span className="text-[9px] text-slate-400 font-medium">
                          Checking all items clears the parent transfer
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {subEntries.map((sub, sIdx) => {
                          const subKey = `${sub.seasonId}:${sub.fromId}:${sub.toId}:${Math.round(sub.amount)}`;
                          const isSubCleared = clearedSubEntries.includes(subKey);
                          const isOppositeFlow = sub.fromId === debt.toId;

                          return (
                            <div
                              key={sIdx}
                              className={`flex items-center justify-between p-3 rounded-xl border text-[11px] transition-all ${
                                isSubCleared
                                  ? 'bg-emerald-50/15 border-emerald-200 text-emerald-800'
                                  : 'bg-white border-slate-200 text-slate-700'
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <input
                                  type="checkbox"
                                  checked={isSubCleared}
                                  onChange={() => toggleClearedSubEntry(sub, debtKey)}
                                  className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-350 cursor-pointer"
                                />
                                <div className="leading-tight">
                                  <span className={`font-bold ${isSubCleared ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                                    {sub.seasonCrop}
                                  </span>
                                  {isOppositeFlow && (
                                    <span className="ml-1.5 text-[8px] font-bold uppercase tracking-wider text-amber-600 px-1 py-0.25 bg-amber-50 rounded border border-amber-100">
                                      Offset / Deduction
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className={`font-mono font-bold text-xs ${isSubCleared ? 'text-slate-400 line-through' : isOppositeFlow ? 'text-amber-600 font-bold' : 'text-slate-800'}`}>
                                {isOppositeFlow ? '-' : ''}{currency}{Math.round(sub.amount).toLocaleString('en-IN')}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
