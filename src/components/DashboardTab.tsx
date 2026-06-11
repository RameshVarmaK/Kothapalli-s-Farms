/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Field,
  Season,
  Expense,
  Labour,
  HarvestRevenue,
  StockItem,
  StockPurchase,
  StockUsage,
  Member,
  CreditAccount,
  CreditRepayment
} from '../types';
import { buildSettlementLedger } from '../utils/calculations';
import { TrendingUp, TrendingDown, IndianRupee, Layers, Sprout, Coins } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

interface DashboardTabProps {
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
  areaUnit: string;
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  onSelectTab: (tab: string) => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  fields = [],
  seasons = [],
  members = [],
  expenses = [],
  labours = [],
  revenues = [],
  usages = [],
  stockItems = [],
  purchases = [],
  currency,
  areaUnit,
  creditAccounts = [],
  creditRepayments = [],
  onSelectTab
}) => {
  const [statusFilter, setStatusFilter] = useState<'active' | 'closed' | 'all'>('active');

  // Get all season IDs to compute overall totals
  const openSeasonIds = seasons.filter(s => !s.isClosed).map(s => s.id);
  const allSeasonIds = seasons.map(s => s.id);

  // Compute stats for all seasons
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
    allSeasonIds,
    creditAccounts,
    creditRepayments
  );

  const totalExpense = summary.ledgers.reduce((sum, l) => sum + l.totalExpense, 0);
  const totalRevenue = summary.ledgers.reduce((sum, l) => sum + l.totalRevenue, 0);
  const totalProfit = totalRevenue - totalExpense;

  // Calculate member investment contribution data
  const memberContributions = members.map(m => {
    const expenseTotal = expenses
      .filter(e => e.paidByMemberId === m.id)
      .reduce((sum, e) => sum + e.amount, 0);

    const stockTotal = purchases
      .filter(p => p.paidByMemberId === m.id)
      .reduce((sum, p) => sum + p.totalCost, 0);

    const labourTotal = labours
      .filter(l => l.paidByMemberId === m.id)
      .reduce((sum, l) => sum + l.totalCost, 0);

    const total = expenseTotal + stockTotal + labourTotal;

    return {
      name: m.name,
      Expenses: Number(expenseTotal.toFixed(2)),
      'Stock Purchase': Number(stockTotal.toFixed(2)),
      'Labour/Wages': Number(labourTotal.toFixed(2)),
      total: Number(total.toFixed(2))
    };
  });

  const totalCombinedInvested = memberContributions.reduce((sum, mc) => sum + mc.total, 0);

  // Custom responsive tooltip for the bar chart
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-4 rounded-2xl border border-slate-800 shadow-xl text-xs font-sans">
          <p className="font-bold border-b border-slate-800 pb-1.5 mb-1.5 text-slate-200">{label}</p>
          <div className="space-y-1.5">
            {payload.map((entry: any) => (
              <div key={entry.name} className="flex justify-between items-center gap-6">
                <span className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span className="text-slate-400">{entry.name}:</span>
                </span>
                <span className="font-bold font-mono text-slate-100">
                  {currency}{entry.value.toLocaleString('en-IN')}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center gap-6 pt-1.5 border-t border-slate-800 mt-1.5 font-bold text-emerald-400">
              <span>Total Contribution:</span>
              <span className="font-mono">
                {currency}{(payload.reduce((sum: number, entry: any) => sum + entry.value, 0)).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // Filter ledgers to display
  const filteredLedgers = summary.ledgers.filter(ledger => {
    const season = seasons.find(s => s.id === ledger.seasonId);
    if (!season) return false;
    if (statusFilter === 'active') return !season.isClosed;
    if (statusFilter === 'closed') return season.isClosed;
    return true;
  });

  // Compute total area of active seasons
  const activeFieldsWithActiveSeasons = seasons
    .filter(s => !s.isClosed)
    .map(s => fields.find(f => f.id === s.fieldId))
    .filter((f): f is Field => !!f);
  
  const totalActiveArea = activeFieldsWithActiveSeasons.reduce((sum, f) => sum + f.area, 0);
  const averageCostPerAcre = totalActiveArea > 0 ? totalExpense / totalActiveArea : 0;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Active Crop Seasons */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Active Crop Seasons</p>
            <h2 className="text-3xl font-bold text-slate-800">
              {seasons.filter(s => !s.isClosed).length.toString().padStart(2, '0')}
            </h2>
          </div>
          <p className="text-xs text-emerald-600 mt-2 font-medium truncate">
            ● {seasons.filter(s => !s.isClosed).map(s => s.cropName).slice(0, 3).join(', ') || 'No active crop seasons'}
          </p>
        </div>

        {/* Total Sales Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Total Sales Revenue</p>
            <h2 className="text-3xl font-bold text-slate-800 font-mono">
              {currency}{totalRevenue.toLocaleString('en-IN')}
            </h2>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-4 overflow-hidden">
            <div 
              className="bg-emerald-500 h-1.5 rounded-full transition-all" 
              style={{ width: totalRevenue > 0 ? `${Math.min(100, Math.max(10, (totalRevenue / (totalExpense + totalRevenue || 1)) * 100))}%` : '0%' }}
            ></div>
          </div>
        </div>

        {/* Operational Costs */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Operational Costs</p>
            <h2 className="text-3xl font-bold text-slate-800 font-mono">
              {currency}{totalExpense.toLocaleString('en-IN')}
            </h2>
          </div>
          <p className="text-xs text-amber-600 mt-2 font-medium">
            Avg cost per {areaUnit || 'acre'}: {currency}{Math.round(averageCostPerAcre).toLocaleString('en-IN')}
          </p>
        </div>

        {/* Accumulated Net Profit Highlight Card */}
        <div className={`${totalProfit >= 0 ? 'bg-emerald-950 border-emerald-900 text-white shadow-md' : 'bg-slate-900 border-slate-800 text-white shadow-md'} p-5 rounded-2xl border flex flex-col justify-between min-h-[140px]`}>
          <div>
            <p className={`text-xs font-semibold ${totalProfit >= 0 ? 'text-emerald-300' : 'text-slate-300'} uppercase tracking-wider mb-1`}>Net Profit / Loss</p>
            <h2 className="text-3xl font-bold font-mono">
              {totalProfit < 0 ? '-' : ''}{currency}{Math.abs(totalProfit).toLocaleString('en-IN')}
            </h2>
          </div>
          <div className={`flex items-center gap-1.5 text-[11px] ${totalProfit >= 0 ? 'text-emerald-400' : 'text-slate-400'} mt-2`}>
            {totalProfit >= 0 ? (
              <svg width="12" height="12" fill="currentColor" viewBox="0 0 20 20" className="text-emerald-400 animate-pulse">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-400" />
            )}
            <span>Ledgers balanced to zero</span>
          </div>
        </div>
      </div>

      {/* Member Contribution Chart Section */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Coins className="text-amber-500" size={16} />
              Partner Investment Standing
            </h3>
            <p className="text-xs text-slate-400 mt-1">Total operational cash and materials funded by each agricultural partner</p>
          </div>
          <div className="bg-slate-50 border border-slate-100 px-3.5 py-1.5 rounded-xl font-medium text-xs text-slate-600 flex items-center gap-1.5">
            <span>Overall Capital Spent:</span>
            <span className="font-bold font-mono text-slate-800">{currency}{totalCombinedInvested.toLocaleString('en-IN')}</span>
          </div>
        </div>

        {totalCombinedInvested === 0 ? (
          <div className="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
            <p className="text-slate-400 text-xs">No investments recorded yet. Register expenses, stock purchases, or labour services to see standings.</p>
          </div>
        ) : (
          <div className="w-full" style={{ minHeight: '320px' }}>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart
                data={memberContributions}
                margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  stroke="#94a3b8" 
                  fontSize={11} 
                  tickLine={false} 
                  axisLine={false} 
                  dy={8}
                />
                <YAxis 
                  stroke="#94a3b8" 
                  fontSize={10} 
                  tickLine={false} 
                  axisLine={false} 
                  dx={-8}
                  tickFormatter={(v) => `${currency}${v.toLocaleString('en-IN')}`} 
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc', opacity: 0.4 }} />
                <Legend 
                  verticalAlign="top" 
                  height={36} 
                  iconType="circle" 
                  iconSize={8}
                  wrapperStyle={{ fontSize: '11px', fontWeight: 600 }}
                />
                <Bar dataKey="Expenses" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} barSize={36} />
                <Bar dataKey="Stock Purchase" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} barSize={36} />
                <Bar dataKey="Labour/Wages" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Main Sections */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 border-b border-slate-105 pb-4 print:hidden">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <Sprout className="text-emerald-600" size={16} />
              Crop Seasons Ledger Cards
            </h2>
            <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">
              {filteredLedgers.length} shown
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shadow-3xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'all'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                All ({summary.ledgers.length})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'active'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Active ({summary.ledgers.filter(l => {
                  const s = seasons.find(x => x.id === l.seasonId);
                  return s && !s.isClosed;
                }).length})
              </button>
              <button
                onClick={() => setStatusFilter('closed')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  statusFilter === 'closed'
                    ? 'bg-white text-emerald-800 shadow-xs'
                    : 'text-slate-400 hover:text-slate-700'
                }`}
              >
                Closed ({summary.ledgers.filter(l => {
                  const s = seasons.find(x => x.id === l.seasonId);
                  return s && s.isClosed;
                }).length})
              </button>
            </div>

            <button
              onClick={() => onSelectTab('settle')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-xl transition-all hover:bg-emerald-100 cursor-pointer shadow-3xs"
            >
              Finalize Settle
            </button>
          </div>
        </div>

        {filteredLedgers.length === 0 ? (
          <div className="text-center py-16 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3">
            <span className="text-3xl text-slate-350">🌾</span>
            <div>
              <p className="text-slate-800 font-bold text-sm">No cropping cycles found</p>
              <p className="text-slate-400 text-xs mt-1">There are no seasons with status "{statusFilter}" currently registered.</p>
            </div>
            <button
              onClick={() => setStatusFilter('all')}
              className="mt-2 text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Clear filters and view all cycles
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredLedgers.map(ledger => {
              const season = seasons.find(s => s.id === ledger.seasonId)!;
              const field = fields.find(f => f.id === ledger.fieldId)!;
              const area = field ? field.area : 1;
              const costPerAcre = ledger.totalExpense / area;
              const profitPerAcre = ledger.netProfit / area;

              return (
                <div key={ledger.seasonId} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full hover:shadow-md hover:border-slate-300 transition-all">
                  {/* Header */}
                  <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-slate-800 text-base leading-snug">{ledger.cropName}</h3>
                      <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5 font-medium">
                        <span className="font-bold text-slate-600">{ledger.fieldName}</span>
                        <span>•</span>
                        <span>{area} {areaUnit}</span>
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase border ${season.isClosed ? 'bg-slate-105 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                      {season.isClosed ? 'Closed' : 'Active'}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex-1 space-y-5">
                    {/* Financial Metrics */}
                    <div className="grid grid-cols-3 gap-3 bg-slate-50/50 p-4 rounded-xl text-center border border-slate-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Expenses</span>
                        <p className="text-sm font-bold font-mono text-slate-800 mt-1">
                          {currency}{ledger.totalExpense.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Revenues</span>
                        <p className="text-sm font-bold font-mono text-slate-800 mt-1">
                          {currency}{ledger.totalRevenue.toLocaleString('en-IN')}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block">Net Profit</span>
                        <p className={`text-sm font-extrabold font-mono mt-1 ${ledger.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                          {ledger.netProfit >= 0 ? '+' : ''}{ledger.netProfit.toLocaleString('en-IN')}
                        </p>
                      </div>
                    </div>

                    {/* Operational Metrics */}
                    <div className="grid grid-cols-2 gap-4 text-xs border-b border-slate-100 pb-4 font-medium text-slate-500">
                      <div className="flex justify-between items-center">
                        <span>Expense / {areaUnit}</span>
                        <span className="font-bold text-slate-800 font-mono">
                          {currency}{Math.round(costPerAcre).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span>Profit / {areaUnit}</span>
                        <span className={`font-bold font-mono ${profitPerAcre >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                          {currency}{Math.round(profitPerAcre).toLocaleString('en-IN')}
                        </span>
                      </div>
                    </div>

                    {/* Partner Net Position / Standing */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Partner Share Standings (This Cycle)</h4>
                      <div className="space-y-2.5">
                        {ledger.statements.map(stmt => {
                          const isOwed = stmt.netPosition >= 0;
                          return (
                            <div key={stmt.memberId} className="flex justify-between items-center text-xs">
                              <span className="text-slate-700 font-bold">{stmt.memberName} <span className="text-[10px] text-slate-400 font-medium font-mono">({stmt.sharePercentage || 0}%)</span></span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400 font-medium font-mono">
                                  paid {currency}{Math.round(stmt.paidAmount).toLocaleString('en-IN')}
                                </span>
                                <span className={`px-2.5 py-1 rounded-lg font-bold font-mono ${isOwed ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                                  {isOwed ? 'Owed' : 'Owes'} {currency}{Math.abs(Math.round(stmt.netPosition)).toLocaleString('en-IN')}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Footer Link */}
                  <div className="p-3.5 bg-slate-50/50 border-t border-slate-100 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Sowing Date: {season.startDate} {season.endDate ? `• Closed: ${season.endDate}` : ''}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
