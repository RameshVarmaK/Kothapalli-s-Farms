/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
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
  CreditAccount,
  CreditRepayment,
  Activity,
  FieldSeasonLedger,
} from '../../types';
import { computeStockLevels, splitStockCostByFunder } from '../../utils/calculations';
import { X, Copy, Check, Calendar, DollarSign, Package, Users, CheckCircle, Scale, Printer } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../hooks/useLanguage';
import { receiptCount } from '../../utils/attachments';

interface SeasonReportModalProps {
  seasonId: string | null;
  /** This season's settlement ledger, from the same engine the Settle tab
   * uses, so the report can't offer a second opinion on who owes what.
   * Optional — the section is simply omitted when it isn't supplied. */
  ledger?: FieldSeasonLedger | null;
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
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  currency: string;
  copiedReportText: boolean;
  setCopiedReportText: (v: boolean) => void;
}

export const SeasonReportModal: React.FC<SeasonReportModalProps> = ({
  seasonId,
  ledger,
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
  creditAccounts = [],
  creditRepayments = [],
  currency,
  copiedReportText,
  setCopiedReportText,
}) => {
  const { t } = useLanguage();

  // Off: the report (screen, PDF and copied text) drops shares, fair shares
  // and settlement, and shows only how much each partner spent — for handing
  // to someone who should see the costs but not the partnership terms.
  // Every report opens with it off; partnership terms are opt-in.
  const [showPartnership, setShowPartnership] = useState(false);
  useEffect(() => {
    setShowPartnership(false);
  }, [seasonId]);

  // Flags the document while a report is open so the print stylesheet can
  // hide everything else on the page. Declared above the early returns to
  // keep the hook order stable, and set explicitly rather than matched with
  // :has() so an unsupporting browser prints the page normally instead of a
  // blank sheet.
  const isOpen = Boolean(seasonId && seasons.some(s => s.id === seasonId));
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('report-print-open');
    return () => document.body.classList.remove('report-print-open');
  }, [isOpen]);

  if (!seasonId) return null;
  const season = seasons.find(s => s.id === seasonId);
  if (!season) return null;
  const field = fields.find(f => f.id === season.fieldId)!;

  const sExpenses = expenses.filter(e => e.targetType === 'single' && e.targetSeasonId === season.id);
  const sAllocations = expenses.filter(e => e.targetType === 'common' && e.allocations?.some(al => al.seasonId === season.id));
  const sLabours = labours.filter(l => l.targetType !== 'common' && l.seasonId === season.id);
  const sLabourAllocations = labours.filter(l => l.targetType === 'common' && l.allocations?.some(al => al.seasonId === season.id));
  const computedSt = computeStockLevels(stockItems, purchases, usages);

  // A credit bill is not funded by any partner: the creditor financed it, and
  // partners are credited only as they repay. So name the creditor rather than
  // leaving the blank paidByMemberId to resolve as "Unknown".
  //
  // Repayments are made against a creditor account, not against a particular
  // bill, so the status shown alongside a line is that ACCOUNT's balance — it
  // cannot say what proportion of this one bill has been settled.
  const creditorStatus = (creditAccountId: string | undefined) => {
    const account = creditAccounts.find(c => c.id === creditAccountId);
    if (!account) return { name: t('Creditor'), outstanding: 0, known: false };

    const incurred =
      expenses.filter(e => e.isCredit && e.creditAccountId === account.id).reduce((sum, e) => sum + e.amount, 0) +
      labours.filter(l => l.isCredit && l.creditAccountId === account.id).reduce((sum, l) => sum + l.totalCost, 0);
    const repaid = creditRepayments
      .filter(r => r.creditAccountId === account.id)
      .reduce((sum, r) => sum + r.amount, 0);

    return { name: account.name, outstanding: Number((incurred - repaid).toFixed(2)), known: true };
  };

  // Who a cost line should be attributed to, and how it stands.
  const describePayer = (record: { isCredit?: boolean; creditAccountId?: string; paidByMemberId?: string }) => {
    if (!record.isCredit) {
      return { label: members.find(m => m.id === record.paidByMemberId)?.name || t('Unknown'), note: '' };
    }

    const { name, outstanding } = creditorStatus(record.creditAccountId);
    const note =
      outstanding > 0.005
        ? `${t('account still owes')} ${currency}${Math.round(outstanding).toLocaleString('en-IN')}`
        : t('account fully repaid');

    return { label: `${t('Credit:')} ${name}`, note };
  };

  // Stock is drawn from a shared pool, so a usage has no single payer. Show
  // whose money paid for what was consumed, the way labour shows its payer.
  const describeFunders = (item: StockItem | undefined, consumedCost: number): string => {
    const { shares, onCredit } = splitStockCostByFunder(item, consumedCost);
    const parts = shares
      .filter(share => Math.round(share.amount) > 0)
      .sort((a, b) => b.amount - a.amount)
      .map(share => {
        const name = members.find(mem => mem.id === share.memberId)?.name || t('Unknown');
        return `${name} ${currency}${Math.round(share.amount).toLocaleString('en-IN')}`;
      });

    if (onCredit > 0) {
      parts.push(`${t('on credit')} ${currency}${Math.round(onCredit).toLocaleString('en-IN')}`);
    }

    return parts.join(' · ');
  };

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

  /**
   * Per-partner contribution rows.
   *
   * The settlement engine's own identity is what makes this safe to show:
   *   netPosition = (paid - share of cost) + (share of revenue - received)
   * so the two "difference" figures below are the halves of the very number
   * the Settle tab settles on, not a competing calculation.
   *
   * Partners with no stake and no activity in this cycle are dropped, so a
   * report doesn't list every partner on the farm.
   */
  const partnerRows = (ledger?.statements || [])
    .map(stmt => {
      const shareRatio = (stmt.sharePercentage || 0) / 100;
      const costShare = shareRatio * ledger!.totalExpense;
      const revenueShare = shareRatio * ledger!.totalRevenue;
      return {
        ...stmt,
        costShare,
        costDifference: stmt.paidAmount - costShare,
        revenueShare,
        revenueDifference: revenueShare - stmt.receivedAmount,
      };
    })
    .filter(r => (r.sharePercentage || 0) > 0 || r.paidAmount !== 0 || r.receivedAmount !== 0)
    .sort((a, b) => b.paidAmount - a.paidAmount);

  const totalPaidByPartners = partnerRows.reduce((sum, r) => sum + r.paidAmount, 0);
  const spenders = partnerRows.filter(r => Math.round(r.paidAmount) > 0);
  const totalCostShares = partnerRows.reduce((sum, r) => sum + r.costShare, 0);

  const money = (v: number) => `${currency}${Math.round(v).toLocaleString('en-IN')}`;
  const signedMoney = (v: number) =>
    `${v >= 0 ? '+' : '-'}${currency}${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;

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
        const { label, note } = describePayer(e);
        const isCommon = e.targetType === 'common';
        const actualAmt = isCommon ? (e.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : e.amount;
        const attribution = e.isCredit ? `${label}${note ? `, ${note}` : ''}` : `Paid by ${label}`;
        text += `${i + 1}. [${e.date}] ${e.category}: ${currency}${Math.round(actualAmt).toLocaleString('en-IN')} (${attribution})${isCommon ? ' [Allocated split]' : ''}${receiptCount(e) > 0 ? ` [📎 ${receiptCount(e)}]` : ''}\n`;
      });
    }

    text    += `\nSECTION 3: CONSTITUENT STOCK INVENTORY CONSUMED\n`;
    const combinedUsages = [...sUsagesDirect, ...sUsagesCommon];
    if (combinedUsages.length === 0) {
      text  += `No stock materials consumed.\n`;
    } else {
      combinedUsages.forEach((u, i) => {
        const item = computedSt.find(si => si.id === u.stockItemId);
        const stName = item ? item.name : 'Unknown Item';
        const stUnit = item ? item.unit : '';
        const isCommon = u.targetType === 'common';
        const qty = isCommon ? (u.allocations?.find(al => al.seasonId === season.id)?.quantity || 0) : u.quantityUsed;
        const rRate = item ? item.weightedAverageCost : 0;
        const funders = describeFunders(item, qty * rRate);
        text += `${i + 1}. [${u.date}] ${stName}: ${qty} ${stUnit} at ${currency}${Math.round(rRate)}/unit. Cost: ${currency}${Math.round(qty * rRate).toLocaleString('en-IN')}${isCommon ? ' [Allocated split]' : ''}${funders ? ` | Funded by: ${funders}` : ''}\n`;
      });
    }

    text    += `\nSECTION 4: HIRED LABOR MANPOWER UTILIZED\n`;
    const combinedLabours = [...sLabours, ...sLabourAllocations];
    if (combinedLabours.length === 0) {
      text  += `No hired labor shifts registered.\n`;
    } else {
      combinedLabours.forEach((l, i) => {
        const { label, note } = describePayer(l);
        const isCommon = l.targetType === 'common';
        const actualCost = isCommon ? (l.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : l.totalCost;
        const attribution = l.isCredit ? `${label}${note ? `, ${note}` : ''}` : `Paid by ${label}`;
        text += `${i + 1}. [${l.date}] ${l.description ? `${l.description} - ` : ''}${l.workersCount} workers at ${currency}${l.wageRate}/worker. Total Cost: ${currency}${Math.round(actualCost).toLocaleString('en-IN')} (${attribution})${isCommon ? ' [Allocated split]' : ''}\n`;
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

    if (!showPartnership && spenders.length > 0) {
      text  += `\nSECTION 6: SPENDING BY PARTNER\n`;
      spenders.forEach((r, i) => {
        text += `${i + 1}. ${r.memberName}: ${money(r.paidAmount)}\n`;
      });
      text  += `   ----------------------------------------------\n`;
      text  += `   TOTAL SPENT BY PARTNERS : ${money(totalPaidByPartners)}\n`;
    }

    if (showPartnership && partnerRows.length > 0) {
      text  += `\nSECTION 6: PARTNER CONTRIBUTIONS & SETTLEMENT\n`;
      partnerRows.forEach((r, i) => {
        const b = r.paidBreakdown;
        text += `${i + 1}. ${r.memberName} (${r.sharePercentage || 0}% share)\n`;
        text += `     Paid in            : ${money(r.paidAmount)}\n`;
        if (b) {
          text += `       General expenses : ${money(b.expenses)}\n`;
          text += `       Labour           : ${money(b.labour)}\n`;
          text += `       Stock purchases  : ${money(b.stock)}\n`;
          text += `       Credit repaid    : ${money(b.creditRepayments)}\n`;
        }
        text += `     Share of cost      : ${money(r.costShare)}\n`;
        text += `     Cost difference    : ${signedMoney(r.costDifference)}\n`;
        text += `     Revenue taken      : ${money(r.receivedAmount)}\n`;
        text += `     Share of revenue   : ${money(r.revenueShare)}\n`;
        text += `     Revenue difference : ${signedMoney(r.revenueDifference)}\n`;
        text += `     NET POSITION       : ${signedMoney(r.netPosition)} (${r.netPosition >= 0 ? 'Receives' : 'Pays'})\n`;
      });
      text  += `   ----------------------------------------------\n`;
      text  += `   ALL PARTNERS PAID IN : ${money(totalPaidByPartners)}\n`;
      text  += `   TOTAL SHARE OF COST  : ${money(totalCostShares)}\n`;
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

  // Portalled to <body> so the print stylesheet can hide every sibling in
  // one rule, instead of unwinding the overlay's ancestors one by one.
  return createPortal(
    <div data-print-root className="fixed inset-0 z-55 bg-slate-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
      <div data-print-card className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] animate-in fade-in zoom-in-95 duration-150 border border-slate-100">
        {/* Modal Header */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">
                {t('Crop General Report')}
              </span>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500 font-bold font-mono uppercase tracking-wider bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-md">ID: {season.id}</span>
            </div>
            <h3 className="text-base font-extrabold text-slate-800 mt-1.5">{season.cropName} {t('Cycle on')} {field ? field.name : t('Unknown Plot')}</h3>
          </div>
          <button
            onClick={onClose}
            data-print-hide
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body - Scrollable content */}
        <div data-print-scroll className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Financial Reconciliation Summary Dashboard */}
          <div>
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3">
              {t('Financial Reconciliation Summary')}
            </h4>
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
              <div className="p-4 rounded-2xl bg-amber-50/30 border border-amber-100 flex flex-col justify-between">
                <span className="text-[9px] text-amber-700 font-bold uppercase block tracking-wider">{t('Direct Outlays')}</span>
                <span className="text-md font-extrabold text-amber-900 font-mono mt-1.5 block">
                  {currency}{Math.round(sumDir).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-orange-50/30 border border-orange-100 flex flex-col justify-between">
                <span className="text-[9px] text-orange-700 font-bold uppercase block tracking-wider">{t('Common Allocated')}</span>
                <span className="text-md font-extrabold text-orange-900 font-mono mt-1.5 block">
                  {currency}{Math.round(sumAlloc).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-sky-50/30 border border-sky-100 flex flex-col justify-between">
                <span className="text-[9px] text-sky-700 font-bold uppercase block tracking-wider">{t('Labor Hired')}</span>
                <span className="text-md font-extrabold text-sky-900 font-mono mt-1.5 block">
                  {currency}{Math.round(sumLab).toLocaleString('en-IN')}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-purple-50/30 border border-purple-100 flex flex-col justify-between">
                <span className="text-[9px] text-purple-700 font-bold uppercase block tracking-wider">{t('Stock Consumed')}</span>
                <span className="text-md font-extrabold text-purple-900 font-mono mt-1.5 block">
                  {currency}{Math.round(sumStock).toLocaleString('en-IN')}
                </span>
              </div>

              <div className={`p-4 rounded-2xl col-span-2 lg:col-span-1 border flex flex-col justify-between ${netPayback >= 0 ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'}`}>
                <span className={`text-[9px] font-bold uppercase block tracking-wider ${netPayback >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{t('Net Operating Profits')}</span>
                <span className={`text-md font-extrabold font-mono mt-1.5 block ${netPayback >= 0 ? 'text-emerald-800' : 'text-rose-900'}`}>
                  {currency}{Math.round(netPayback).toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            <div className="mt-3.5 p-4.5 rounded-2xl bg-emerald-600 text-white flex flex-wrap justify-between items-center gap-3 shadow-2xs">
              <div>
                <span className="text-[9px] text-emerald-200 font-bold uppercase tracking-widest">{t('Total Sales Revenues Got')}</span>
                <span className="text-lg font-extrabold font-mono block mt-0.5">
                  {currency}{Math.round(sumRev).toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[9px] text-emerald-200 font-bold uppercase tracking-widest">{t('Total Operating Expenses Outlay')}</span>
                <span className="text-lg font-extrabold font-mono block mt-0.5">
                  {currency}{Math.round(totCost).toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: Timelines Activity Logs */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <Calendar size={13} className="text-slate-500" />
              <span>{t('Section 1: Timelines Activity Logs')}</span>
            </h4>
            {sAct.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('No crop activity timeline logs registered for this season cycle.')}</p>
            ) : (
              <div className="space-y-3">
                {sAct.map((a) => (
                  <div key={a.id} className="text-xs flex items-start gap-2.5">
                    <span className="text-slate-400 font-bold font-mono">[{a.date}]</span>
                    <div>
                      <span className="font-bold text-slate-700 bg-slate-200/60 px-1.5 py-0.5 rounded-md text-[9px] mr-1.5 uppercase tracking-wider">{a.type}</span>
                      <span className="text-slate-600 font-medium">{a.notes}</span>
                      {a.weatherNote && (
                        <span className="text-[10px] text-slate-500 italic mt-0.5 block">Weather report context: {a.weatherNote}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 2: Cash Outlays & Direct Expenses */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <DollarSign size={13} className="text-slate-500" />
              <span>{t('Section 2: Cash Outlays & Direct Expenses')}</span>
            </h4>
            {combinedExps.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('No cash expenses associated with this cycle.')}</p>
            ) : (
              <div className="space-y-2.5">
                {combinedExps.map(e => {
                  const { label, note } = describePayer(e);
                  const isCommon = e.targetType === 'common';
                  const actualAmt = isCommon ? (e.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : e.amount;
                  return (
                    <div key={e.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 text-xs">
                      <div className="flex gap-2 flex-wrap">
                        <span className="font-mono text-slate-400">[{e.date}]</span>
                        <span className="font-bold text-slate-700">{e.category}</span>
                        {isCommon && <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-1.5 rounded-md uppercase">{t('Common Allocated split')}</span>}
                        {receiptCount(e) > 0 && (
                          <span className="text-[10px] text-slate-500 font-semibold" title={t('Receipts attached')}>📎 {receiptCount(e)}</span>
                        )}
                      </div>
                      <div className="sm:text-right">
                        <span className="font-bold font-mono text-slate-800 block">
                          {currency}{Math.round(actualAmt).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400 font-medium">{e.isCredit ? '' : 'by '}{label}</span>
                        </span>
                        {note && <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{note}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Constituent Stock Inventory Consumed */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <Package size={13} className="text-slate-500" />
              <span>{t('Section 3: Stock Materials Consumed')}</span>
            </h4>
            {combinedUsages.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('No material seed/input inventory usage recorded.')}</p>
            ) : (
              <div className="space-y-2.5">
                {combinedUsages.map(u => {
                  const item = computedSt.find(si => si.id === u.stockItemId);
                  const rate = item ? item.weightedAverageCost : 0;
                  const isCommon = u.targetType === 'common';
                  const qty = isCommon ? (u.allocations?.find(al => al.seasonId === season.id)?.quantity || 0) : u.quantityUsed;
                  const funders = describeFunders(item, qty * rate);
                  return (
                    <div key={u.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 text-xs">
                      <div className="flex gap-2 flex-wrap">
                        <span className="font-mono text-slate-400">[{u.date}]</span>
                        <span className="font-bold text-slate-700">{item ? item.name : t('Unknown Item')}</span>
                        {isCommon && <span className="text-[9px] bg-purple-50 text-purple-800 border border-purple-200 font-bold px-1.5 rounded uppercase">{t('Split')}</span>}
                      </div>
                      <div className="sm:text-right">
                        <span className="font-mono font-bold text-slate-800 block">
                          {qty} {item ? item.unit : ''} @ {currency}{Math.round(rate)} = {currency}{Math.round(qty * rate).toLocaleString('en-IN')}
                        </span>
                        {funders && (
                          <span className="text-[10px] text-slate-400 font-medium block mt-0.5">
                            {t('Funded by:')} {funders}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 4: Hired Labor Manpower Utilized */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <Users size={13} className="text-slate-500" />
              <span>{t('Section 4: Hired Labor Manpower Utilized')}</span>
            </h4>
            {combinedLabours.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('No hired daily wage worker logs associated.')}</p>
            ) : (
              <div className="space-y-2.5">
                {combinedLabours.map(l => {
                  const { label, note } = describePayer(l);
                  const isCommon = l.targetType === 'common';
                  const actualCost = isCommon ? (l.allocations?.find(a => a.seasonId === season.id)?.amount || 0) : l.totalCost;
                  return (
                    <div key={l.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 text-xs">
                      <div className="flex gap-2 flex-wrap">
                        <span className="font-mono text-slate-400">[{l.date}]</span>
                        {l.description && <span className="font-bold text-slate-700">{l.description}</span>}
                        <span className={l.description ? 'text-slate-500' : 'font-bold text-slate-700'}>{l.workersCount} {t('worker(s) at')} {currency}{l.wageRate}/{t('worker')}</span>
                        {isCommon && <span className="text-[9px] bg-amber-50 text-amber-700 border border-amber-200 font-bold px-1.5 rounded-md uppercase">{t('Common Allocated split')}</span>}
                      </div>
                      <div className="sm:text-right">
                        <span className="font-mono font-bold text-slate-800 block">
                          {currency}{Math.round(actualCost).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400 font-medium">{l.isCredit ? '' : 'paid by '}{label}</span>
                        </span>
                        {note && <span className="text-[10px] text-slate-400 font-medium block mt-0.5">{note}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 5: Harvest Yield Earnings */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <CheckCircle size={13} className="text-slate-500" />
              <span>{t('Section 5: Harvest Yield Earnings')}</span>
            </h4>
            {sRevenues.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('No crops sales transactions registered for this cycle.')}</p>
            ) : (
              <div className="space-y-2.5">
                {sRevenues.map(r => {
                  const rcvr = members.find(m => m.id === r.receivedByMemberId)?.name || t('Unknown');
                  return (
                    <div key={r.id} className="flex justify-between items-center text-xs">
                      <div className="flex gap-2">
                        <span className="font-mono text-slate-400">[{r.date}]</span>
                        <span className="font-bold text-slate-700">{r.crop} (Yield: {r.quantity} sold{r.buyerName ? ` to ${r.buyerName}` : ''})</span>
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


          {/* Section 6, without partnership terms: just who spent how much. */}
          {!showPartnership && spenders.length > 0 && (
            <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
              <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
                <Users size={13} className="text-slate-500" />
                <span>{t('Section 6: Spending by Partner')}</span>
              </h4>
              <div className="space-y-2">
                {spenders.map(r => (
                  <div key={r.memberId} className="flex justify-between text-xs">
                    <span className="font-bold text-slate-700">{r.memberName}</span>
                    <span className="font-mono font-bold text-slate-800">{money(r.paidAmount)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-2.5 border-t border-slate-300 flex justify-between text-xs">
                <span className="font-bold text-slate-600 uppercase text-[10px] tracking-widest">{t('Total')}</span>
                <span className="font-mono font-extrabold text-slate-800">{money(totalPaidByPartners)}</span>
              </div>
              <p className="mt-2 text-[10px] text-slate-400 font-medium leading-normal">
                {t('Includes expenses, labour and stock each partner paid for, and credit they repaid.')}
              </p>
            </div>
          )}

          {/* Section 6: Partner Contributions & Settlement */}
          {showPartnership && partnerRows.length > 0 && (
            <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
              <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
                <Scale size={13} className="text-slate-500" />
                <span>{t('Section 6: Partner Contributions & Settlement')}</span>
              </h4>

              <div className="space-y-3">
                {partnerRows.map(r => {
                  const isCreditor = r.netPosition >= 0;
                  const b = r.paidBreakdown;
                  return (
                    <div key={r.memberId} data-print-keep className="p-4 rounded-2xl bg-white border border-slate-200">
                      {/* Partner name + the one number that matters */}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 pb-3 border-b border-slate-200">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-800 text-xs">{r.memberName}</span>
                          <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 font-bold px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                            {r.sharePercentage || 0}% {t('share')}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`font-mono font-extrabold text-sm ${isCreditor ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {signedMoney(r.netPosition)}
                          </span>
                          <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase border ${isCreditor ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-rose-50 text-rose-700 border-rose-100'}`}>
                            {isCreditor ? t('Receives') : t('Pays')}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 pt-3 text-xs">
                        {/* Cost side */}
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-700">{t('Paid in')}</span>
                            <span className="font-mono font-bold text-slate-800">{money(r.paidAmount)}</span>
                          </div>
                          {b && (
                            <>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span className="pl-2">{t('General expenses')}</span>
                                <span className="font-mono">{money(b.expenses)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span className="pl-2">{t('Labour')}</span>
                                <span className="font-mono">{money(b.labour)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span className="pl-2">{t('Stock purchases')}</span>
                                <span className="font-mono">{money(b.stock)}</span>
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-500">
                                <span className="pl-2">{t('Credit repaid')}</span>
                                <span className="font-mono">{money(b.creditRepayments)}</span>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Fair share, and the two gaps that make up the net */}
                        <div className="space-y-1 sm:border-l sm:border-slate-200 sm:pl-6 pt-2 sm:pt-0">
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('Share of cost')}</span>
                            <span className="font-mono text-slate-700">{money(r.costShare)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-700">{t('Cost difference')}</span>
                            <span className={`font-mono font-bold ${r.costDifference >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {signedMoney(r.costDifference)}
                            </span>
                          </div>
                          <div className="flex justify-between pt-1.5 mt-1.5 border-t border-slate-100">
                            <span className="text-slate-500">{t('Revenue taken')}</span>
                            <span className="font-mono text-slate-700">{money(r.receivedAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">{t('Share of revenue')}</span>
                            <span className="font-mono text-slate-700">{money(r.revenueShare)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-bold text-slate-700">{t('Revenue difference')}</span>
                            <span className={`font-mono font-bold ${r.revenueDifference >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                              {signedMoney(r.revenueDifference)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Proof the table balances: what partners put in equals what the cycle cost. */}
              <div className="mt-3 p-3.5 rounded-2xl bg-slate-100/70 border border-slate-200 flex flex-col sm:flex-row sm:justify-between gap-1 text-xs">
                <span className="font-bold text-slate-600 uppercase text-[10px] tracking-widest self-center">{t('All partners')}</span>
                <div className="flex gap-5">
                  <span className="text-slate-500">
                    {t('Paid in')} <span className="font-mono font-bold text-slate-800">{money(totalPaidByPartners)}</span>
                  </span>
                  <span className="text-slate-500">
                    {t('Share of cost')} <span className="font-mono font-bold text-slate-800">{money(totalCostShares)}</span>
                  </span>
                </div>
              </div>

              <p className="mt-2 text-[10px] text-slate-400 font-medium leading-normal">
                {t('A partner is owed when they funded more than their share, or collected less revenue than their share. These two gaps add up to the net figure above, which is the same balance shown on the Settle screen.')}
              </p>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div data-print-hide className="p-6 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-end gap-3.5">
          {partnerRows.length > 0 && (
            <label className="mr-auto flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPartnership}
                onChange={e => setShowPartnership(e.target.checked)}
                className="w-4 h-4 accent-emerald-600 cursor-pointer"
              />
              {t('Include partner shares & settlement')}
            </label>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-xl cursor-pointer"
          >
            {t('Close View')}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-xl cursor-pointer flex items-center gap-2 active:scale-95 transition-all"
          >
            <Printer size={14} />
            <span>{t('Save as PDF')}</span>
          </button>
          <button
            type="button"
            onClick={handleCopyTextReport}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs hover:shadow-md transition-all flex items-center gap-2 active:scale-95"
          >
            {copiedReportText ? <Check size={14} className="animate-bounce" /> : <Copy size={14} />}
            <span>{copiedReportText ? t('Copied Full Report!') : t('Export & Copy Report')}</span>
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};
