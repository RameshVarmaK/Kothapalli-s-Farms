/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Scale, Receipt, Sprout, Package } from 'lucide-react';
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
  SettlementClearance,
  SettlementSummary,
} from '../../types';
import { buildPartnerLedger, PartnerLineKind } from '../../utils/partnerLedger';
import { useLanguage } from '../../hooks/useLanguage';

interface PartnerReportModalProps {
  memberId: string | null;
  onClose: () => void;
  /** The memoised settlement summary over every cycle — the same one the
   * Settle tab settles on, so this report cannot offer a second opinion. */
  summary: SettlementSummary;
  members: Member[];
  fields: Field[];
  seasons: Season[];
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  usages: StockUsage[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  settlementClearances?: SettlementClearance[];
  currency: string;
}

const ALL = '__all__';

const KIND_LABEL: Record<PartnerLineKind, string> = {
  expense: 'Expense',
  labour: 'Labour',
  stock: 'Stock used',
  'credit-repayment': 'Credit repaid',
  revenue: 'Sale received',
};

const KIND_STYLE: Record<PartnerLineKind, string> = {
  expense: 'bg-amber-50 text-amber-800 border-amber-200',
  labour: 'bg-sky-50 text-sky-800 border-sky-200',
  stock: 'bg-purple-50 text-purple-800 border-purple-200',
  'credit-repayment': 'bg-slate-100 text-slate-700 border-slate-200',
  revenue: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

export const PartnerReportModal: React.FC<PartnerReportModalProps> = ({
  memberId,
  onClose,
  summary,
  members,
  fields,
  seasons,
  expenses,
  labours,
  revenues,
  usages,
  stockItems,
  purchases,
  creditAccounts = [],
  creditRepayments = [],
  settlementClearances = [],
  currency,
}) => {
  const { t } = useLanguage();
  const [scope, setScope] = useState<string>(ALL);

  const member = members.find(m => m.id === memberId) || null;
  const isOpen = Boolean(member);

  // Start every newly opened report on "all cycles".
  useEffect(() => {
    setScope(ALL);
  }, [memberId]);

  const scopeSeasonIds = useMemo(
    () => (scope === ALL ? seasons.map(s => s.id) : [scope]),
    [scope, seasons]
  );

  const ledger = useMemo(
    () =>
      member
        ? buildPartnerLedger({
            memberId: member.id,
            seasonIds: scopeSeasonIds,
            summary,
            members,
            fields,
            seasons,
            expenses,
            labours,
            revenues,
            usages,
            stockItems,
            purchases,
            creditAccounts,
            creditRepayments,
            settlementClearances,
          })
        : null,
    [member, scopeSeasonIds, summary, members, fields, seasons, expenses, labours, revenues, usages, stockItems, purchases, creditAccounts, creditRepayments, settlementClearances]
  );

  const seasonLabel = (s: Season) =>
    `${s.cropName} · ${fields.find(f => f.id === s.fieldId)?.name || t('Unknown Plot')}`;
  const scopeLabel =
    scope === ALL
      ? `${t('All crop cycles')} (${seasons.length})`
      : (() => {
          const s = seasons.find(x => x.id === scope);
          return s ? seasonLabel(s) : '';
        })();

  // Same print contract as the season report: flag the body so the print
  // stylesheet hides everything but this portal. Also name the document, so
  // the saved PDF is called after the partner instead of the app.
  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add('report-print-open');
    const originalTitle = document.title;
    document.title = `${member!.name} - ${t('Partner Ledger')} - ${new Date().toISOString().slice(0, 10)}`;
    return () => {
      document.body.classList.remove('report-print-open');
      document.title = originalTitle;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, member?.name]);

  if (!member || !ledger) return null;

  const money = (v: number) => `${currency}${Math.round(v).toLocaleString('en-IN')}`;
  const signedMoney = (v: number) =>
    `${v >= 0 ? '+' : '-'}${currency}${Math.round(Math.abs(v)).toLocaleString('en-IN')}`;

  const { totals } = ledger;
  const isCreditor = totals.netPosition >= 0;
  const linesPaid = ledger.lines.reduce((sum, l) => sum + l.paidIn, 0);
  const linesReceived = ledger.lines.reduce((sum, l) => sum + l.received, 0);
  const settlementsInScope = ledger.cycles.filter(c => c.settlements.length > 0);
  const generatedOn = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return createPortal(
    <div data-print-root className="fixed inset-0 z-55 bg-slate-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
      <div data-print-card className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl overflow-hidden flex flex-col h-[90vh] animate-in fade-in zoom-in-95 duration-150 border border-slate-100">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 flex justify-between items-start gap-4 bg-slate-50/50">
          <div className="min-w-0">
            <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">
              {t('Partner Ledger')}
            </span>
            <h3 className="text-base font-extrabold text-slate-800 mt-1.5">{member.name}</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {member.phone ? `${member.phone} · ` : ''}
              {t('Covers')}: <strong>{scopeLabel}</strong> · {t('Generated on')} {generatedOn}
            </p>
          </div>
          <button
            onClick={onClose}
            data-print-hide
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-colors shrink-0"
            aria-label={t('Close View')}
          >
            <X size={20} />
          </button>
        </div>

        <div data-print-scroll className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Scope picker — on screen only; the header above prints the choice. */}
          <label data-print-hide className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
            <span className="font-bold text-slate-500 uppercase tracking-widest text-[10px]">{t('Report covers')}</span>
            <select
              value={scope}
              onChange={e => setScope(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 bg-white"
            >
              <option value={ALL}>{t('All crop cycles')} ({seasons.length})</option>
              {[...seasons]
                .sort((a, b) => b.startDate.localeCompare(a.startDate))
                .map(s => (
                  <option key={s.id} value={s.id}>
                    {seasonLabel(s)} — {s.isClosed ? t('Closed') : t('Active')}
                  </option>
                ))}
            </select>
          </label>

          {/* Summary */}
          <div data-print-keep>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-amber-50/30 border border-amber-100">
                <span className="text-[9px] text-amber-700 font-bold uppercase block tracking-wider">{t('Paid in')}</span>
                <span className="text-md font-extrabold text-slate-800 font-mono mt-1.5 block">{money(totals.paidIn)}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{t('Share of cost')} {money(totals.costShare)}</span>
              </div>
              <div className="p-4 rounded-2xl bg-sky-50/30 border border-sky-100">
                <span className="text-[9px] text-sky-700 font-bold uppercase block tracking-wider">{t('Revenue taken')}</span>
                <span className="text-md font-extrabold text-slate-800 font-mono mt-1.5 block">{money(totals.received)}</span>
                <span className="text-[10px] text-slate-500 block mt-0.5">{t('Share of revenue')} {money(totals.revenueShare)}</span>
              </div>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 col-span-2 lg:col-span-1">
                <span className="text-[9px] text-slate-500 font-bold uppercase block tracking-wider">{t('Paid in, by kind')}</span>
                <div className="text-[10px] text-slate-600 mt-1.5 space-y-0.5">
                  <div className="flex justify-between"><span>{t('General expenses')}</span><span className="font-mono">{money(totals.breakdown.expenses)}</span></div>
                  <div className="flex justify-between"><span>{t('Labour')}</span><span className="font-mono">{money(totals.breakdown.labour)}</span></div>
                  <div className="flex justify-between"><span>{t('Stock purchases')}</span><span className="font-mono">{money(totals.breakdown.stock)}</span></div>
                  <div className="flex justify-between"><span>{t('Credit repaid')}</span><span className="font-mono">{money(totals.breakdown.creditRepayments)}</span></div>
                </div>
              </div>
              <div className={`p-4 rounded-2xl border col-span-2 lg:col-span-1 ${isCreditor ? 'bg-emerald-50/40 border-emerald-200' : 'bg-rose-50/40 border-rose-200'}`}>
                <span className={`text-[9px] font-bold uppercase block tracking-wider ${isCreditor ? 'text-emerald-700' : 'text-rose-700'}`}>{t('Net Standing')}</span>
                <span className={`text-lg font-extrabold font-mono mt-1 block ${isCreditor ? 'text-emerald-800' : 'text-rose-700'}`}>
                  {signedMoney(totals.netPosition)}
                </span>
                <span className={`text-[10px] font-bold uppercase ${isCreditor ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {isCreditor ? t('Receives') : t('Pays')}
                </span>
              </div>
            </div>
          </div>

          {/* Section 1: crop cycles */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <Sprout size={13} className="text-slate-500" />
              <span>{t('Section 1: Crop Cycles')}</span>
            </h4>
            {ledger.cycles.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('This partner has no share and no money in the selected cycles.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-slate-400 text-right">
                      <th className="text-left font-bold pb-2">{t('Crop cycle')}</th>
                      <th className="font-bold pb-2">{t('Share')}</th>
                      <th className="font-bold pb-2">{t('Paid in')}</th>
                      <th className="font-bold pb-2">{t('Share of cost')}</th>
                      <th className="font-bold pb-2">{t('Revenue taken')}</th>
                      <th className="font-bold pb-2">{t('Share of revenue')}</th>
                      <th className="font-bold pb-2">{t('Net')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 font-mono text-right text-slate-700">
                    {ledger.cycles.map(c => (
                      <tr key={c.seasonId}>
                        <td className="text-left py-2 font-sans">
                          <span className="font-bold text-slate-800">{c.cropName}</span>
                          <span className="text-slate-500"> · {c.fieldName}</span>
                          <span className="block text-[10px] text-slate-400">
                            {c.startDate}{c.isClosed ? ` → ${c.endDate || ''}` : ` · ${t('Active')}`}
                          </span>
                        </td>
                        <td>{c.sharePercentage}%</td>
                        <td>{money(c.paidAmount)}</td>
                        <td>{money(c.costShare)}</td>
                        <td>{money(c.receivedAmount)}</td>
                        <td>{money(c.revenueShare)}</td>
                        <td className={`font-bold ${c.netPosition >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{signedMoney(c.netPosition)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="font-mono text-right font-bold text-slate-800 border-t-2 border-slate-300">
                    <tr>
                      <td className="text-left py-2 font-sans text-[10px] uppercase tracking-widest text-slate-500">{t('Total')}</td>
                      <td></td>
                      <td>{money(totals.paidIn)}</td>
                      <td>{money(totals.costShare)}</td>
                      <td>{money(totals.received)}</td>
                      <td>{money(totals.revenueShare)}</td>
                      <td className={totals.netPosition >= 0 ? 'text-emerald-700' : 'text-rose-600'}>{signedMoney(totals.netPosition)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-400 leading-normal">
              {t('Net = (paid in − share of cost) + (share of revenue − revenue taken). It is the same balance shown on the Settle screen.')}
            </p>
          </div>

          {/* Section 2: settlement */}
          <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <Scale size={13} className="text-slate-500" />
              <span>{t('Section 2: Settlement')}</span>
            </h4>
            {settlementsInScope.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('Nothing to settle for this partner in the selected cycles.')}</p>
            ) : (
              <div className="space-y-2.5">
                {settlementsInScope.map(c => (
                  <div key={c.seasonId} className="text-xs">
                    <span className="font-bold text-slate-700">{c.cropName} · {c.fieldName}</span>
                    {c.settlements.map(s => (
                      <div key={s.counterpartyId} className="flex justify-between items-center gap-2 pl-3 mt-1">
                        <span className="text-slate-600">
                          {s.direction === 'pays' ? t('Pays to') : t('Receives from')} <strong>{s.counterpartyName}</strong>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="font-mono font-bold text-slate-800">{money(s.amount)}</span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase border ${
                              s.cleared ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                            }`}
                          >
                            {s.cleared ? t('Transferred') : t('Pending')}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: transactions */}
          <div className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
            <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
              <Receipt size={13} className="text-slate-500" />
              <span>{t('Section 3: Transactions')}</span>
            </h4>
            {ledger.lines.length === 0 ? (
              <p className="text-slate-400 text-xs italic">{t('No payments or receipts by this partner in the selected cycles.')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] min-w-[560px]">
                  <thead>
                    <tr className="text-[9px] uppercase tracking-wider text-slate-400">
                      <th className="text-left font-bold pb-2">{t('Date')}</th>
                      <th className="text-left font-bold pb-2">{t('Details')}</th>
                      <th className="text-left font-bold pb-2">{t('Crop cycle')}</th>
                      <th className="text-right font-bold pb-2">{t('Paid in')}</th>
                      <th className="text-right font-bold pb-2">{t('Received')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {ledger.lines.map(l => (
                      <tr key={`${l.kind}-${l.id}`} data-print-keep className="align-top">
                        <td className="py-1.5 pr-2 font-mono text-slate-500 whitespace-nowrap">{l.date}</td>
                        <td className="py-1.5 pr-2">
                          <span className={`inline-block px-1.5 rounded-md text-[9px] font-bold uppercase border mr-1.5 ${KIND_STYLE[l.kind]}`}>
                            {t(KIND_LABEL[l.kind])}
                          </span>
                          <span className="text-slate-700 font-semibold">{l.detail}</span>
                          {l.workers && (
                            <span className="text-slate-500">
                              {l.detail ? ' · ' : ''}{l.workers.count} {t('workers')} × {currency}{l.workers.wageRate}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 text-slate-500">
                          {l.cycles.join(', ')}
                          {l.isSplit && <span className="text-[9px] text-slate-400"> ({t('share of split')})</span>}
                        </td>
                        <td className="py-1.5 text-right font-mono text-slate-800">{l.paidIn ? money(l.paidIn) : ''}</td>
                        <td className="py-1.5 text-right font-mono text-slate-800">{l.received ? money(l.received) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 font-bold text-slate-800">
                    <tr>
                      <td colSpan={3} className="py-2 text-[10px] uppercase tracking-widest text-slate-500">{t('Total')}</td>
                      <td className="text-right font-mono">{money(linesPaid)}</td>
                      <td className="text-right font-mono">{money(linesReceived)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-400 leading-normal">
              {t('Bills taken on credit are not listed: no partner paid them. They count when a partner repays the creditor. Stock counts when it is used, at this partner’s share of the money that bought it.')}
            </p>
          </div>

          {/* Section 4: stock bought */}
          {ledger.stockPurchases.length > 0 && (
            <div data-print-keep className="p-5 rounded-2xl bg-slate-50/60 border border-slate-200">
              <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest mb-3.5 flex items-center gap-1.5 border-b border-slate-300 pb-2">
                <Package size={13} className="text-slate-500" />
                <span>{t('Section 4: Stock Bought')}</span>
              </h4>
              <div className="space-y-1.5">
                {ledger.stockPurchases.map(p => (
                  <div key={p.id} className="flex justify-between text-xs gap-2">
                    <span>
                      <span className="font-mono text-slate-400">[{p.date}]</span>{' '}
                      <span className="font-bold text-slate-700">{p.itemName}</span>{' '}
                      <span className="text-slate-500">{p.quantity} {p.unit}</span>
                    </span>
                    <span className="font-mono font-bold text-slate-800">{money(p.totalCost)}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-slate-400 leading-normal">
                {t('For reference. Purchases go into the shared store; they count toward a crop cycle only when the stock is used there (see “Stock used” above).')}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div data-print-hide className="p-6 border-t border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-end gap-3.5">
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
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl cursor-pointer shadow-xs flex items-center gap-2 active:scale-95 transition-all"
          >
            <Printer size={14} />
            <span>{t('Save as PDF')}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
