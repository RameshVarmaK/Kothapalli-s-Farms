/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * What a partner with the viewer role sees: their own spend and the fields
 * they are part of, and nothing else of the ledger. The figures come from
 * the same settlement engine and partner ledger the owner's screens use, so
 * what a viewer sees here is exactly their line on the Settle screen.
 */
import React, { useMemo, useState } from 'react';
import { Sprout, Receipt, Package, LogOut, Eye } from 'lucide-react';
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
} from '../types';
import { buildSettlementLedger } from '../utils/calculations';
import { buildPartnerLedger, PartnerCycleRow, PartnerLineKind } from '../utils/partnerLedger';
import { effectiveShares, fieldsOfPartner } from '../utils/partnerScope';
import { formatMoney, formatSignedMoney } from '../utils/format';
import { useLanguage } from '../hooks/useLanguage';

interface PartnerHomeTabProps {
  member: Member;
  email?: string | null;
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
  areaUnit: string;
  onLogout?: () => void;
}

const KIND_LABEL: Record<PartnerLineKind, string> = {
  expense: 'Expense',
  labour: 'Labour',
  stock: 'Stock used',
  'credit-repayment': 'Credit repaid',
  advance: 'Advance',
  revenue: 'Sale received',
};

const KIND_STYLE: Record<PartnerLineKind, string> = {
  expense: 'bg-amber-50 text-amber-800 border-amber-200',
  labour: 'bg-sky-50 text-sky-800 border-sky-200',
  stock: 'bg-purple-50 text-purple-800 border-purple-200',
  'credit-repayment': 'bg-slate-100 text-slate-700 border-slate-200',
  advance: 'bg-amber-50 text-amber-800 border-amber-300',
  revenue: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};

type StatusFilter = 'active' | 'closed' | 'all';

export const PartnerHomeTab: React.FC<PartnerHomeTabProps> = ({
  member,
  email,
  members = [],
  fields = [],
  seasons = [],
  expenses = [],
  labours = [],
  revenues = [],
  usages = [],
  stockItems = [],
  purchases = [],
  creditAccounts = [],
  creditRepayments = [],
  settlementClearances = [],
  currency,
  areaUnit,
  onLogout,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');

  const allSeasonIds = useMemo(() => seasons.map(s => s.id), [seasons]);
  const summary = useMemo(
    () => buildSettlementLedger(fields, seasons, members, expenses, labours, revenues, usages, stockItems, purchases, allSeasonIds, creditAccounts, creditRepayments),
    [fields, seasons, members, expenses, labours, revenues, usages, stockItems, purchases, allSeasonIds, creditAccounts, creditRepayments]
  );
  const ledger = useMemo(
    () => buildPartnerLedger({
      memberId: member.id,
      seasonIds: allSeasonIds,
      summary, members, fields, seasons, expenses, labours, revenues, usages, stockItems, purchases,
      creditAccounts, creditRepayments, settlementClearances,
    }),
    [member.id, allSeasonIds, summary, members, fields, seasons, expenses, labours, revenues, usages, stockItems, purchases, creditAccounts, creditRepayments, settlementClearances]
  );

  // The fields this partner holds a share in, plus any where their money
  // went without a share (the ledger still charges it to them).
  const myFields = useMemo(() => {
    const byShare = fieldsOfPartner(member.id, fields, seasons);
    const byMoney = new Set(ledger.cycles.map(c => seasons.find(s => s.id === c.seasonId)?.fieldId));
    return fields.filter(f => byShare.includes(f) || byMoney.has(f.id));
  }, [member.id, fields, seasons, ledger.cycles]);

  const cycleBySeason = useMemo(() => new Map(ledger.cycles.map(c => [c.seasonId, c])), [ledger.cycles]);

  const seasonsOf = (field: Field) =>
    seasons
      .filter(s => s.fieldId === field.id)
      .filter(s => statusFilter === 'all' || (statusFilter === 'active' ? !s.isClosed : s.isClosed))
      .filter(s => cycleBySeason.has(s.id) || effectiveShares(s, field).some(sh => sh.memberId === member.id && Number(sh.percentage) > 0))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));

  const myShareOfField = (field: Field) => field.shares?.find(sh => sh.memberId === member.id)?.percentage || 0;

  const { totals } = ledger;
  const advancesTotal = ledger.advances.total > 0.5 ? ledger.advances.total : 0;
  const paidIn = totals.paidIn + advancesTotal;
  const receives = totals.netPosition >= 0;
  const money = (v: number) => formatMoney(v, currency);

  const CycleRow = ({ season, cycle }: { season: Season; cycle: PartnerCycleRow | undefined }) => (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="font-bold text-slate-800 text-sm">{season.cropName}</span>
          <span className="text-[11px] text-slate-400 ml-2">
            {season.startDate}{season.isClosed ? ` → ${season.endDate || ''}` : ''}
          </span>
          <span className={`ml-2 inline-block px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase border ${season.isClosed ? 'bg-slate-100 text-slate-600 border-slate-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
            {season.isClosed ? t('Closed') : t('Active')}
          </span>
        </div>
        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          {t('My share')}: {cycle && cycle.sharePercentage > 0 ? `${cycle.sharePercentage}%` : t('No share')}
        </span>
      </div>
      {cycle ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[11px]">
          <div className="bg-amber-50/40 border border-amber-100 rounded-lg px-2.5 py-1.5">
            <span className="block text-[9px] uppercase font-bold text-amber-700 tracking-wider">{t('Paid in')}</span>
            <span className="font-mono font-bold text-slate-800">{money(cycle.paidAmount)}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
            <span className="block text-[9px] uppercase font-bold text-slate-500 tracking-wider">{t('Share of cost')}</span>
            <span className="font-mono font-bold text-slate-800">{money(cycle.costShare)}</span>
          </div>
          <div className="bg-sky-50/40 border border-sky-100 rounded-lg px-2.5 py-1.5">
            <span className="block text-[9px] uppercase font-bold text-sky-700 tracking-wider">{t('Revenue taken')}</span>
            <span className="font-mono font-bold text-slate-800">{money(cycle.receivedAmount)}</span>
          </div>
          <div className={`border rounded-lg px-2.5 py-1.5 ${cycle.netPosition >= 0 ? 'bg-emerald-50/40 border-emerald-100' : 'bg-rose-50/40 border-rose-100'}`}>
            <span className={`block text-[9px] uppercase font-bold tracking-wider ${cycle.netPosition >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{t('Net')}</span>
            <span className={`font-mono font-bold ${cycle.netPosition >= 0 ? 'text-emerald-800' : 'text-rose-700'}`}>{formatSignedMoney(cycle.netPosition, currency)}</span>
          </div>
        </div>
      ) : (
        <p className="text-[11px] text-slate-400 mt-1">{t('No payments or receipts recorded for you yet.')}</p>
      )}
      {cycle && cycle.settlements.length > 0 && (
        <div className="mt-2 space-y-1">
          {cycle.settlements.map(s => (
            <div key={s.counterpartyId} className="flex justify-between items-center gap-2 text-[11px]">
              <span className="text-slate-600">
                {s.direction === 'pays' ? t('Pays to') : t('Receives from')} <strong>{s.counterpartyName}</strong>
              </span>
              <span className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-800">{money(s.amount)}</span>
                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase border ${s.cleared ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                  {s.cleared ? t('Transferred') : t('Pending')}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6" data-testid="partner-home">
      {/* Who this is */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">{t('My Farm')}</p>
          <h2 className="text-2xl font-bold text-slate-800 truncate">{member.name}</h2>
          <p className="text-xs text-slate-500 mt-1">
            {t('Your spend, and the fields you are part of.')}
            {email && <span className="block text-[11px] text-slate-400 mt-0.5">{t('Signed in as')} {email}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex md:hidden bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            {(['en', 'te'] as const).map(lng => (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase cursor-pointer transition-all ${language === lng ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {lng}
              </button>
            ))}
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={() => onLogout()}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-xl cursor-pointer"
            >
              <LogOut size={14} />
              {t('Sign out')}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2 text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <Eye size={14} className="text-amber-600 mt-0.5 shrink-0" />
        <span>{t('You can see your own payments, receipts and fields here. Ask the ledger owner for editor access if you need to record entries.')}</span>
      </div>

      {/* My money */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">{t('Paid in')}</p>
          <p className="text-2xl font-bold text-slate-800 font-mono mt-1" data-testid="paid-in">{money(paidIn)}</p>
          {advancesTotal > 0 && (
            <p className="text-[10px] text-amber-700 font-semibold mt-1">{t('incl.')} {money(advancesTotal)} {t('advances, not on any bill yet')}</p>
          )}
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-sky-700 uppercase tracking-wider">{t('Revenue taken')}</p>
          <p className="text-2xl font-bold text-slate-800 font-mono mt-1">{money(totals.received)}</p>
          <p className="text-[10px] text-slate-500 mt-1">{t('Share of revenue')} {money(totals.revenueShare)}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{t('Paid in, by kind')}</p>
          <div className="text-[11px] text-slate-600 mt-1.5 space-y-0.5">
            <div className="flex justify-between"><span>{t('General expenses')}</span><span className="font-mono">{money(totals.breakdown.expenses)}</span></div>
            <div className="flex justify-between"><span>{t('Labour')}</span><span className="font-mono">{money(totals.breakdown.labour)}</span></div>
            <div className="flex justify-between"><span>{t('Stock purchases')}</span><span className="font-mono">{money(totals.breakdown.stock)}</span></div>
            <div className="flex justify-between"><span>{t('Credit repaid')}</span><span className="font-mono">{money(totals.breakdown.creditRepayments)}</span></div>
            {advancesTotal > 0 && (
              <div className="flex justify-between text-amber-800"><span>{t('Advances to creditors')}</span><span className="font-mono">{money(advancesTotal)}</span></div>
            )}
          </div>
        </div>
        <div className={`p-5 rounded-2xl border shadow-sm ${receives ? 'bg-emerald-950 border-emerald-900 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-wider ${receives ? 'text-emerald-300' : 'text-slate-300'}`}>{t('Net Standing')}</p>
          <p className="text-2xl font-bold font-mono mt-1">{formatSignedMoney(totals.netPosition, currency)}</p>
          <p className={`text-[10px] font-bold uppercase mt-1 ${receives ? 'text-emerald-400' : 'text-slate-400'}`}>{receives ? t('Receives') : t('Pays')}</p>
        </div>
      </div>

      {/* My fields */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <Sprout className="text-emerald-600" size={16} />
            {t('My fields')}
          </h3>
          <div className="flex gap-1.5">
            {(['active', 'closed', 'all'] as const).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-bold cursor-pointer transition-all ${statusFilter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'}`}
              >
                {t(f === 'active' ? 'Active' : f === 'closed' ? 'Closed' : 'All')}
              </button>
            ))}
          </div>
        </div>
        {myFields.length === 0 ? (
          <p className="text-slate-400 text-xs italic">{t('You are not part of any field yet.')}</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {myFields.map(field => {
              const rows = seasonsOf(field);
              const share = myShareOfField(field);
              return (
                <div key={field.id} data-testid="partner-field" className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex items-baseline justify-between gap-2 mb-3 border-b border-slate-200 pb-2">
                    <div className="min-w-0">
                      <h4 className="font-extrabold text-slate-800 truncate">{field.name}</h4>
                      <p className="text-[11px] text-slate-500">
                        {field.area} {t(areaUnit)}{field.locationNote ? ` · ${field.locationNote}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg shrink-0">
                      {t('My share')} {share > 0 ? `${share}%` : t('No share')}
                    </span>
                  </div>
                  {rows.length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">{t('No crop seasons on this field yet.')}</p>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {rows.map(s => <CycleRow key={s.id} season={s} cycle={cycleBySeason.get(s.id)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-[10px] text-slate-400 leading-normal">
          {t('Net = what you paid in minus your share of the cost, plus your share of the revenue minus the revenue you took. Positive means you receive, negative means you pay.')}
        </p>
      </div>

      {/* My transactions */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
          <Receipt className="text-amber-500" size={16} />
          {t('My transactions')}
        </h3>
        {ledger.lines.length === 0 ? (
          <p className="text-slate-400 text-xs italic">{t('No payments or receipts recorded for you yet.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] min-w-[520px]">
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
                {[...ledger.lines].reverse().map(l => (
                  <tr key={`${l.kind}-${l.id}`} className="align-top">
                    <td className="py-1.5 pr-2 font-mono text-slate-500 whitespace-nowrap">{l.date}</td>
                    <td className="py-1.5 pr-2">
                      <span className={`inline-block px-1.5 rounded-md text-[9px] font-bold uppercase border mr-1.5 ${KIND_STYLE[l.kind]}`}>
                        {t(KIND_LABEL[l.kind])}
                      </span>
                      <span className="text-slate-700 font-semibold">{l.detail}</span>
                      {l.note && <span className="block text-[10px] text-slate-400">{l.note}</span>}
                      {l.workers && (
                        <span className="text-slate-500">{l.detail ? ' · ' : ''}{l.workers.count} {t('workers')} × {currency}{l.workers.wageRate}</span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-slate-500">
                      {l.kind === 'advance' ? <span className="text-amber-700 font-semibold">{t('Not on a bill yet')}</span> : l.cycles.join(', ')}
                      {l.isSplit && <span className="text-[9px] text-slate-400"> ({t('share of split')})</span>}
                    </td>
                    <td className="py-1.5 text-right font-mono text-slate-800">{l.paidIn ? money(l.paidIn) : ''}</td>
                    <td className="py-1.5 text-right font-mono text-slate-800">{l.received ? money(l.received) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ledger.stockPurchases.length > 0 && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-4">
            <Package className="text-purple-500" size={16} />
            {t('Stock I bought')}
          </h3>
          <div className="space-y-1.5">
            {[...ledger.stockPurchases].reverse().map(p => (
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
        </div>
      )}
    </div>
  );
};
