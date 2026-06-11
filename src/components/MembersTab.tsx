/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
  CreditAccount,
  CreditRepayment
} from '../types';
import { buildSettlementLedger, computeStockLevels } from '../utils/calculations';
import { Plus, Users, Grid, Sliders, Sprout, AlertTriangle, Trash2, CheckCircle, FileText, Copy, Check, X, Calendar, DollarSign, Package } from 'lucide-react';

interface MembersTabProps {
  fields: Field[];
  seasons: Season[];
  members: Member[];
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  usages: StockUsage[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  activities: Activity[];
  currency: string;
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  onAddMember: (item: Member) => void;
  onAddField: (item: Field) => void;
  onAddSeason: (item: Season) => void;
  onCloseSeason: (id: string, endDate: string) => void;
  onDeleteMember: (id: string) => void;
  onDeleteField: (id: string) => void;
  onDeleteSeason: (id: string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  fields = [],
  seasons = [],
  members = [],
  expenses = [],
  labours = [],
  revenues = [],
  usages = [],
  stockItems = [],
  purchases = [],
  activities = [],
  currency,
  creditAccounts = [],
  creditRepayments = [],
  onAddMember,
  onAddField,
  onAddSeason,
  onCloseSeason,
  onDeleteMember,
  onDeleteField,
  onDeleteSeason
}) => {
  const [activeTab, setActiveTab] = useState<'directory' | 'fields' | 'seasons'>('seasons');
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [selectedReportSeasonId, setSelectedReportSeasonId] = useState<string | null>(null);
  const [copiedReportText, setCopiedReportText] = useState(false);

  // Closing season pop-up instead of window.prompt
  const [closingSeasonId, setClosingSeasonId] = useState<string | null>(null);
  const [closingSeasonDate, setClosingSeasonDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states - Member
  const [memberName, setMemberName] = useState('');
  const [memberPhone, setMemberPhone] = useState('');

  // Form states - Field
  const [fieldName, setFieldName] = useState('');
  const [fieldArea, setFieldArea] = useState('');
  const [fieldLocation, setFieldLocation] = useState('');
  const [fieldShares, setFieldShares] = useState<{ [memberId: string]: string }>({});
  const [fieldSharesError, setFieldSharesError] = useState('');

  // Form states - Season
  const [seasonFieldId, setSeasonFieldId] = useState(fields[0]?.id || '');
  const [seasonCrop, setSeasonCrop] = useState('');
  const [seasonStartDate, setSeasonStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [seasonShares, setSeasonShares] = useState<{ [memberId: string]: string }>({});
  const [seasonSharesError, setSeasonSharesError] = useState('');

  // Pre-populate season-level shares default values from the selected field's shares
  React.useEffect(() => {
    if (!seasonFieldId) {
      setSeasonShares({});
      return;
    }
    const selectedField = fields.find(f => f.id === seasonFieldId);
    if (!selectedField) {
      setSeasonShares({});
      return;
    }
    const initialShares: { [memberId: string]: string } = {};
    members.forEach(m => {
      const mShare = selectedField.shares.find(sh => sh.memberId === m.id);
      initialShares[m.id] = mShare ? String(mShare.percentage) : '0';
    });
    setSeasonShares(initialShares);
    setSeasonSharesError('');
  }, [seasonFieldId, fields, members]);

  // Expand and view profile detail sub-record
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Roll up ledger statements targeting all seasons
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
    seasons.map(s => s.id),
    creditAccounts,
    creditRepayments
  );

  const checkSeasonSettled = (seasonId: string) => {
    const ledger = summary.ledgers.find(l => l.seasonId === seasonId);
    if (!ledger) return true;

    const seasonPositions = ledger.statements.map(stmt => ({
      memberId: stmt.memberId,
      name: stmt.memberName,
      balance: stmt.netPosition
    }));

    let sCreditors = seasonPositions.filter(p => p.balance > 0.01).map(p => ({ ...p })).sort((a, b) => b.balance - a.balance);
    let sDebtors = seasonPositions.filter(p => p.balance < -0.01).map(p => ({ ...p })).sort((a, b) => a.balance - b.balance);

    const seasonSimplifiedDebts: { seasonId: string; fromId: string; toId: string; amount: number }[] = [];

    while (sCreditors.length > 0 && sDebtors.length > 0) {
      const debtor = sDebtors[0];
      const creditor = sCreditors[0];

      const oweAmt = Math.abs(debtor.balance);
      const recAmt = creditor.balance;
      const settleAmt = Number(Math.min(oweAmt, recAmt).toFixed(2));

      seasonSimplifiedDebts.push({
        seasonId: ledger.seasonId,
        fromId: debtor.memberId,
        toId: creditor.memberId,
        amount: settleAmt
      });

      debtor.balance = Number((debtor.balance + settleAmt).toFixed(2));
      creditor.balance = Number((creditor.balance - settleAmt).toFixed(2));

      sCreditors = sCreditors.filter(p => p.balance > 0.01).sort((a, b) => b.balance - a.balance);
      sDebtors = sDebtors.filter(p => p.balance < -0.01).sort((a, b) => a.balance - b.balance);
    }

    if (seasonSimplifiedDebts.length === 0) return true;

    const saved = localStorage.getItem('farmledger_cleared_sub_entries');
    const clearedKeys: string[] = saved ? JSON.parse(saved) : [];

    return seasonSimplifiedDebts.every(sub => {
      const subKey = `${sub.seasonId}:${sub.fromId}:${sub.toId}:${Math.round(sub.amount)}`;
      return clearedKeys.includes(subKey);
    });
  };

  const sumOfShares = Object.keys(fieldShares).reduce((total: number, mId: string) => {
    return total + (parseFloat(fieldShares[mId]) || 0);
  }, 0);

  const handleSaveMember = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberName) return;

    const newMember: Member = {
      id: `m_${Date.now()}`,
      name: memberName,
      phone: memberPhone || undefined
    };

    onAddMember(newMember);
    closeAndReset();
  };

  const handleSaveField = (e: React.FormEvent) => {
    e.preventDefault();
    const areaVal = parseFloat(fieldArea);
    if (!fieldName || !areaVal || areaVal <= 0) return;

    // Validate shares sum to exactly 100%
    let sumShares = 0;
    const validatedShares = Object.keys(fieldShares).map(memberId => {
      const percentage = parseFloat(fieldShares[memberId]) || 0;
      sumShares += percentage;
      return { memberId, percentage };
    }).filter(s => s.percentage > 0);

    if (Math.abs(sumShares - 100) > 0.01) {
      setFieldSharesError(`Invalid configuration! The share ratios of all partners must sum to exactly 100%. Currently registered ratio sum is: ${sumShares}%.`);
      return;
    }

    const newField: Field = {
      id: `f_${Date.now()}`,
      name: fieldName,
      area: areaVal,
      locationNote: fieldLocation || undefined,
      shares: validatedShares
    };

    onAddField(newField);
    closeAndReset();
  };

  const handleSaveSeason = (e: React.FormEvent) => {
    e.preventDefault();
    if (!seasonCrop || !seasonFieldId) return;

    // Validate shares sum to exactly 100%
    let sumShares = 0;
    const validatedShares = Object.keys(seasonShares).map(memberId => {
      const percentage = parseFloat(seasonShares[memberId]) || 0;
      sumShares += percentage;
      return { memberId, percentage };
    }).filter(s => s.percentage > 0);

    if (Math.abs(sumShares - 100) > 0.01) {
      setSeasonSharesError(`Invalid configuration! Crop owner share ratios must sum to exactly 100%. Currently registered ratio sum is: ${sumShares}%.`);
      return;
    }

    const newSeason: Season = {
      id: `s_${Date.now()}`,
      fieldId: seasonFieldId,
      cropName: seasonCrop,
      startDate: seasonStartDate,
      isClosed: false,
      shares: validatedShares
    };

    onAddSeason(newSeason);
    closeAndReset();
  };

  const closeAndReset = () => {
    setIsOpenAddModal(false);
    setMemberName('');
    setMemberPhone('');
    setFieldName('');
    setFieldArea('');
    setFieldLocation('');
    setFieldShares({});
    setFieldSharesError('');
    setSeasonCrop('');
    setSeasonStartDate(new Date().toISOString().split('T')[0]);
    setSeasonShares({});
    setSeasonSharesError('');
  };

  const handleDeleteMember = (id: string, name: string) => {
    onDeleteMember(id);
  };

  const handleDeleteField = (id: string, name: string) => {
    onDeleteField(id);
  };

  const handleCloseCropSeason = (id: string) => {
    setClosingSeasonId(id);
    setClosingSeasonDate(new Date().toISOString().split('T')[0]);
  };

  return (
    <div className="space-y-6">
      {/* Sub-Tabs selector */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250">
          <button
            onClick={() => setActiveTab('seasons')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'seasons' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5"><Grid size={12}/> Sown Seasons</span>
          </button>
          <button
            onClick={() => setActiveTab('fields')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'fields' ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5"><Sprout size={12}/> Fields</span>
          </button>
          <button
            onClick={() => setActiveTab('directory')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'directory' ? 'bg-white text-emerald-850 shadow-xs font-bold' : 'text-slate-400 hover:text-slate-750'
            }`}
          >
            <span className="flex items-center gap-1.5"><Users size={12}/> Partners</span>
          </button>
        </div>

        <button
          onClick={() => {
            setSeasonFieldId(fields[0]?.id || '');
            setIsOpenAddModal(true);
          }}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
        >
          <Plus size={14} />
          {activeTab === 'directory' ? 'Add Partner' : activeTab === 'fields' ? 'New Field' : 'Sow Crop'}
        </button>
      </div>

      {/* SEGMENT DIRECTORY */}
      {activeTab === 'directory' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
              <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Collaborating Partners</h3>
              <span className="text-[10px] text-slate-450 bg-slate-100 font-bold px-2.5 py-1 rounded-full uppercase">{members.length} partners registered</span>
            </div>

            <div className="divide-y divide-slate-100">
              {members.map(member => {
                const totalStatement = summary.membersTotalStatements[member.id];
                const profitPos = totalStatement ? totalStatement.netPosition : 0;
                const isUnderDetail = expandedMemberId === member.id;

                return (
                  <div key={member.id} className="transition-all">
                    {/* Header profile banner */}
                    <div
                      onClick={() => setExpandedMemberId(isUnderDetail ? null : member.id)}
                      className="p-5 flex justify-between items-center hover:bg-slate-50/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-3.5">
                        <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm tracking-wide border border-emerald-100">
                          {member.name.substring(0, 2).toUpperCase()}
                        </span>
                        <div>
                          <h4 className="font-bold text-slate-800 text-sm leading-snug">{member.name}</h4>
                          <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{member.phone || 'No phone recorded'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[9px] uppercase tracking-widest text-slate-400 block font-bold">Net Standing</span>
                          <span className={`text-sm font-bold font-mono tracking-tight ${profitPos >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {profitPos >= 0 ? 'Receives' : 'Owes'} {currency}{Math.abs(Math.round(profitPos)).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteMember(member.id, member.name); }}
                          className="p-2 rounded-lg text-slate-350 hover:text-red-500 hover:bg-red-50 hover:border hover:border-red-100 transition-colors cursor-pointer"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Detailed sub-ledgers on click */}
                    {isUnderDetail && totalStatement && (
                      <div className="bg-slate-50/50 p-5 border-t border-slate-100 text-xs text-slate-600 grid grid-cols-3 gap-4 text-center animate-in slide-in-from-top-1">
                        <div className="p-3 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">Entitled Profit</span>
                          <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                            {currency}{Math.round(totalStatement.entitledAmount).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">Funded Outlay</span>
                          <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                            {currency}{Math.round(totalStatement.paidAmount).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="p-3 bg-white rounded-xl border border-slate-200">
                          <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">Harvest pocketed</span>
                          <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                            {currency}{Math.round(totalStatement.receivedAmount).toLocaleString('en-IN')}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SEGMENT FIELDS */}
      {activeTab === 'fields' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {fields.map(field => (
            <div key={field.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-slate-350 hover:shadow-md transition-all">
              <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-slate-850 text-sm leading-snug">{field.name}</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Area size: <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">{field.area} acres</span></p>
                </div>
                <button
                  onClick={() => handleDeleteField(field.id, field.name)}
                  className="p-2 rounded-lg text-slate-350 hover:text-red-500 hover:bg-red-50 hover:border hover:border-red-100 transition-colors cursor-pointer"
                >
                  <Trash2 size={14} />
                </button>
              </div>

              <div className="p-5 flex-1 space-y-4">
                {field.locationNote && (
                  <p className="text-[11px] text-slate-500 font-medium italic">📍 Location: {field.locationNote}</p>
                )}

                {/* Sown shares details */}
                <div>
                  <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">Ownership shares</h4>
                  <div className="space-y-2">
                    {field.shares.map(sh => {
                      const m = members.find(member => member.id === sh.memberId);
                      return (
                        <div key={sh.memberId} className="flex justify-between items-center text-xs">
                          <span className="text-slate-600 font-medium">{m ? m.name : 'Unknown'}</span>
                          <span className="font-bold font-mono text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md">{sh.percentage}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SEGMENT SEASONS */}
      {activeTab === 'seasons' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/50">
            <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Sown Cropping Cycles</h3>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 bg-slate-50/50 font-bold text-[10px] uppercase tracking-widest">
                <th className="px-6 py-4">Sown Field</th>
                <th className="px-6 py-4">Crop Name</th>
                <th className="px-6 py-4">Sown Date</th>
                <th className="px-6 py-4 text-right">Actions / Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {seasons.map(s => {
                const f = fields.find(field => field.id === s.fieldId)!;
                return (
                  <tr key={s.id} className="hover:bg-slate-50/50 font-medium pb-2">
                    <td className="px-6 py-4 font-bold text-slate-800">{f ? f.name : 'Unknown'}</td>
                    <td className="px-6 py-4 font-bold text-emerald-800">{s.cropName}</td>
                    <td className="px-6 py-4 mono-num text-slate-500 font-mono">{s.startDate}</td>
                    <td className="px-6 py-4 text-right flex items-center justify-end gap-2.5">
                      <button
                        onClick={() => {
                          setSelectedReportSeasonId(s.id);
                          setCopiedReportText(false);
                        }}
                        className="text-[10px] text-slate-700 hover:text-emerald-800 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-250 font-bold px-3 py-1.5 rounded-lg border-slate-200 hover:border-slate-350 cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                      >
                        <FileText size={12} className="text-emerald-600" />
                        <span>View Report</span>
                      </button>
                      {s.isClosed ? (
                        <div className="flex items-center gap-2 justify-end">
                          <span className="inline-flex items-center gap-1 text-[10px] text-slate-450 bg-slate-100 font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 uppercase tracking-wider">
                            Closed {s.endDate}
                          </span>
                          {checkSeasonSettled(s.id) ? (
                            <button
                              onClick={() => onDeleteSeason(s.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-250 hover:border-red-150 transition-colors cursor-pointer"
                              title="Delete Season (Fully Settled)"
                            >
                              <Trash2 size={13} />
                            </button>
                          ) : (
                            <span className="text-[9px] text-slate-400 max-w-[80px] leading-tight text-right italic font-medium">
                              Pending settlement
                            </span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handleCloseCropSeason(s.id)}
                          className="text-[10px] text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                        >
                          Mark Harvested
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* DETAILED ADHOC SETUP MODAL */}
      {isOpenAddModal && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {activeTab === 'directory' && (
              <form onSubmit={handleSaveMember} className="p-6 space-y-4">
                <h3 className="font-bold text-sm text-gray-800">Add Sown Partner Record</h3>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Partner Human Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Shyam Naik"
                    value={memberName}
                    onChange={e => setMemberName(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Phone Number (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. +91 98452 11002"
                    value={memberPhone}
                    onChange={e => setMemberPhone(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  />
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
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white"
                  >
                    Save Partner Profile
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'fields' && (
              <form onSubmit={handleSaveField} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                <h3 className="font-bold text-sm text-gray-800">Register Sown Plot Boundary</h3>

                {fieldSharesError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[10px] flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{fieldSharesError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Field Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. North Ridge Orchard"
                      value={fieldName}
                      onChange={e => setFieldName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Area size (Acres)</label>
                    <input
                      type="number"
                      required
                      step="0.1"
                      placeholder="e.g. 12"
                      value={fieldArea}
                      onChange={e => setFieldArea(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Location description</label>
                  <input
                    type="text"
                    placeholder="e.g. Behind electric sub-station road"
                    value={fieldLocation}
                    onChange={e => setFieldLocation(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  />
                </div>

                {/* Ownership configuration list */}
                <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase">
                    <span>Partner Name</span>
                    <span>Ratio Split (%)</span>
                  </div>

                  <div className="divide-y divide-gray-150 space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex justify-between items-center pt-2 text-xs text-gray-700">
                        <span>{m.name}</span>
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="0"
                            value={fieldShares[m.id] || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setFieldSharesError('');
                              setFieldShares(prev => ({
                                ...prev,
                                [m.id]: val
                              }));
                            }}
                            className="bg-white border border-gray-100 rounded-lg text-xs w-24 pr-6 py-1 text-right"
                          />
                          <span className="absolute right-2 top-1.5 text-[10px] text-gray-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Validate on board live counter */}
                  <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-gray-500 pt-2 border-t border-gray-150">
                    <span>Total share ratio allocation</span>
                    <span className={`font-bold text-xs ${Math.abs(sumOfShares - 100) < 0.1 ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {sumOfShares}% / 100%
                    </span>
                  </div>
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
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white"
                  >
                    Add Field Plot
                  </button>
                </div>
              </form>
            )}

            {activeTab === 'seasons' && (
              <form onSubmit={handleSaveSeason} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                <h3 className="font-bold text-sm text-gray-800">Sow New Crop Cycle Season</h3>

                {seasonSharesError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[10px] flex items-start gap-2">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                    <span>{seasonSharesError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target field Plot</label>
                  <select
                    value={seasonFieldId}
                    onChange={e => setSeasonFieldId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 font-medium"
                  >
                    {fields.map(f => (
                      <option key={f.id} value={f.id}>{f.name} ({f.area} acres)</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sown Crop Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sona Masuri Paddy"
                      value={seasonCrop}
                      onChange={e => setSeasonCrop(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sowing Date</label>
                    <input
                      type="date"
                      required
                      value={seasonStartDate}
                      onChange={e => setSeasonStartDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                {/* Season-level custom partner shares configuration */}
                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Season Partner Shares (%)</span>
                    <span className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-150 font-bold px-2 py-0.5 rounded-md">Customizable per Cycle</span>
                  </div>

                  <div className="divide-y divide-slate-150 space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex justify-between items-center pt-2 text-xs text-slate-700">
                        <span className="font-semibold">{m.name}</span>
                        <div className="relative">
                          <input
                            type="number"
                            placeholder="0"
                            value={seasonShares[m.id] || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setSeasonSharesError('');
                              setSeasonShares(prev => ({
                                ...prev,
                                [m.id]: val
                              }));
                            }}
                            className="bg-white border border-slate-205 rounded-lg text-xs w-24 pr-6 py-1 text-right font-semibold"
                          />
                          <span className="absolute right-2 top-1.5 text-[10px] text-slate-400">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Validate total share ratio */}
                  {(() => {
                    const totalSharesSum = Object.keys(seasonShares).reduce((acc, mId) => acc + (parseFloat(seasonShares[mId]) || 0), 0);
                    return (
                      <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 pt-2 border-t border-slate-200">
                        <span>Total shares sum</span>
                        <span className={`font-extrabold text-xs ${Math.abs(totalSharesSum - 100) < 0.1 ? 'text-emerald-600' : 'text-amber-500'}`}>
                          {totalSharesSum}% / 100%
                        </span>
                      </div>
                    );
                  })()}
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white cursor-pointer"
                  >
                    Sow Crop
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* DETAILED SEASON GENERAL REPORT MODAL */}
      {selectedReportSeasonId && (() => {
        const season = seasons.find(s => s.id === selectedReportSeasonId);
        if (!season) return null;
        const field = fields.find(f => f.id === season.fieldId)!;

        const sExpenses = expenses.filter(e => e.targetType === 'single' && e.targetSeasonId === season.id);
        const sAllocations = expenses.filter(e => e.targetType === 'common' && e.allocations?.some(al => al.seasonId === season.id));
        const sLabours = labours.filter(l => l.seasonId === season.id);
        const computedSt = computeStockLevels(stockItems, purchases, usages);
        
        const sUsagesDirect = usages.filter(u => u.targetType === 'single' && u.targetSeasonId === season.id);
        const sUsagesCommon = usages.filter(u => u.targetType === 'common' && u.allocations?.some(al => al.seasonId === season.id));
        
        const sumDir = sExpenses.reduce((sum, e) => sum + e.amount, 0);
        const sumAlloc = sAllocations.reduce((sum, e) => {
          const al = e.allocations?.find(a => a.seasonId === season.id);
          return sum + (al ? al.amount : 0);
        }, 0);
        const sumLab = sLabours.reduce((sum, l) => sum + l.totalCost, 0);
        
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
          if (sLabours.length === 0) {
            text  += `No hired labor shifts registered.\n`;
          } else {
            sLabours.forEach((l, i) => {
              const payer = members.find(m => m.id === l.paidByMemberId)?.name || 'Unknown';
              text += `${i + 1}. [${l.date}] ${l.workersCount} workers at ${currency}${l.wageRate}/worker. Total Cost: ${currency}${Math.round(l.totalCost).toLocaleString('en-IN')} (Paid by ${payer})\n`;
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
                  onClick={() => setSelectedReportSeasonId(null)}
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
                  {sLabours.length === 0 ? (
                    <p className="text-slate-400 text-xs italic">No hired daily wage worker logs associated.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {sLabours.map(l => {
                        const payer = members.find(m => m.id === l.paidByMemberId)?.name || 'Unknown';
                        return (
                          <div key={l.id} className="flex justify-between items-center text-xs">
                            <div className="flex gap-2">
                              <span className="font-mono text-slate-400">[{l.date}]</span>
                              <span className="font-bold text-slate-705">{l.workersCount} worker(s) at {currency}{l.wageRate}/worker</span>
                            </div>
                            <span className="font-mono font-bold text-slate-800">
                              {currency}{Math.round(l.totalCost).toLocaleString('en-IN')} <span className="text-[10px] text-slate-400 font-medium">paid by {payer}</span>
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
                  onClick={() => setSelectedReportSeasonId(null)}
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
      })()}

      {/* CROP HARVEST CLOSE DATE MODAL */}
      {closingSeasonId && (() => {
        const season = seasons.find(s => s.id === closingSeasonId);
        if (!season) return null;
        return (
          <div className="fixed inset-0 z-55 bg-slate-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
            <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-150 font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">
                    Conclude Cropping Cycle
                  </span>
                  <h3 className="text-sm font-extrabold text-slate-800 mt-2">Mark Crop Harvested</h3>
                  <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Conclude "{season.cropName}" cycle and freeze its ledger records.</p>
                </div>
                <button
                  onClick={() => setClosingSeasonId(null)}
                  className="p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Harvesting End Date</label>
                  <input
                    type="date"
                    required
                    value={closingSeasonDate}
                    onChange={e => setClosingSeasonDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-150 rounded-xl px-3 py-2 text-xs text-slate-750 font-medium"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setClosingSeasonId(null)}
                  className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-550 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onCloseSeason(closingSeasonId, closingSeasonDate);
                    setClosingSeasonId(null);
                  }}
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white cursor-pointer shadow-xs active:scale-95 transition-transform text-center"
                >
                  Confirm Harvest
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
