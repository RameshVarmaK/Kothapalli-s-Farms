/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { CreditAccount, CreditRepayment, Expense, Labour, Member, Season, Field } from '../types';
import { Plus, Trash2, CreditCard, ChevronRight, Calculator, Calendar, User, Search, RefreshCw, AlertCircle, Coins, ArrowUpRight } from 'lucide-react';

interface CreditsTabProps {
  creditAccounts: CreditAccount[];
  creditRepayments: CreditRepayment[];
  expenses: Expense[];
  labours: Labour[];
  members: Member[];
  seasons: Season[];
  fields: Field[];
  currency: string;
  onAddCreditAccount: (account: CreditAccount) => void;
  onAddCreditRepayment: (repayment: CreditRepayment) => void;
  onDeleteCreditAccount: (id: string) => void;
  onDeleteCreditRepayment: (id: string) => void;
}

export const CreditsTab: React.FC<CreditsTabProps> = ({
  creditAccounts = [],
  creditRepayments = [],
  expenses = [],
  labours = [],
  members = [],
  seasons = [],
  fields = [],
  currency,
  onAddCreditAccount,
  onAddCreditRepayment,
  onDeleteCreditAccount,
  onDeleteCreditRepayment
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'repayments'>('overview');
  const [selectedCreditorId, setSelectedCreditorId] = useState<string | null>(
    creditAccounts.length > 0 ? creditAccounts[0].id : null
  );

  // Modal open states
  const [isOpenAddCreditor, setIsOpenAddCreditor] = useState(false);
  const [isOpenAddRepayment, setIsOpenAddRepayment] = useState(false);

  // Form states - Creditor
  const [credName, setCredName] = useState('');
  const [credPhone, setCredPhone] = useState('');
  const [credType, setCredType] = useState<'Labour' | 'Tractor' | 'Vendor' | 'Other'>('Labour');
  const [credNotes, setCredNotes] = useState('');

  // Form states - Repayment
  const [repCreditorId, setRepCreditorId] = useState(selectedCreditorId || creditAccounts[0]?.id || '');
  const [repMemberId, setRepMemberId] = useState(members[0]?.id || '');
  const [repAmount, setRepAmount] = useState('');
  const [repDate, setRepDate] = useState(new Date().toISOString().split('T')[0]);
  const [repNotes, setRepNotes] = useState('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-select first creditor when list changes and none selected
  React.useEffect(() => {
    if ((!selectedCreditorId || !creditAccounts.some(c => c.id === selectedCreditorId)) && creditAccounts.length > 0) {
      setSelectedCreditorId(creditAccounts[0].id);
    }
  }, [creditAccounts, selectedCreditorId]);

  // Handle adding creditor
  const handleSubmitCreditor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credName.trim()) return;

    const newCreditor: CreditAccount = {
      id: `cred_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      name: credName.trim(),
      phone: credPhone.trim() || undefined,
      type: credType,
      notes: credNotes.trim() || undefined
    };

    onAddCreditAccount(newCreditor);
    setSelectedCreditorId(newCreditor.id);
    
    // Reset form
    setCredName('');
    setCredPhone('');
    setCredType('Labour');
    setCredNotes('');
    setIsOpenAddCreditor(false);
  };

  // Handle adding repayment
  const handleSubmitRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    const creditorId = repCreditorId || selectedCreditorId;
    if (!creditorId || !repMemberId || !repAmount || isNaN(Number(repAmount)) || Number(repAmount) <= 0) return;

    const newRepayment: CreditRepayment = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      creditAccountId: creditorId,
      memberId: repMemberId,
      amount: Number(repAmount),
      date: repDate,
      notes: repNotes.trim() || undefined
    };

    onAddCreditRepayment(newRepayment);

    // Reset form
    setRepAmount('');
    setRepNotes('');
    setIsOpenAddRepayment(false);
  };

  // Compute calculated values for each Creditor
  const creditorReports = creditAccounts.map(account => {
    // 1. Get credit expenses
    const credExpenses = expenses.filter(e => e.isCredit && e.creditAccountId === account.id);
    const totalExpenseIncurred = credExpenses.reduce((sum, e) => sum + e.amount, 0);

    // 2. Get credit labour
    const credLabours = labours.filter(l => l.isCredit && l.creditAccountId === account.id);
    const totalLabourIncurred = credLabours.reduce((sum, l) => sum + l.totalCost, 0);

    // Total credit incurred
    const totalCreditAmount = totalExpenseIncurred + totalLabourIncurred;

    // 3. Get repayments
    const credRepayments = creditRepayments.filter(r => r.creditAccountId === account.id);
    const totalRepaidAmount = credRepayments.reduce((sum, r) => sum + r.amount, 0);

    const outstandingBalance = Number((totalCreditAmount - totalRepaidAmount).toFixed(2));

    return {
      account,
      totalCreditAmount,
      totalRepaidAmount,
      outstandingBalance,
      expensesList: credExpenses,
      laboursList: credLabours,
      repaymentsList: credRepayments
    };
  });

  const selectedReport = creditorReports.find(r => r.account.id === selectedCreditorId);

  // Search filtered overview
  const filteredReports = creditorReports.filter(report => 
    report.account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (report.account.phone && report.account.phone.includes(searchQuery)) ||
    report.account.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalOutstandingDueAll = creditorReports.reduce((sum, r) => sum + r.outstandingBalance, 0);
  const totalCreditSpentAll = creditorReports.reduce((sum, r) => sum + r.totalCreditAmount, 0);
  const totalPaidAll = creditorReports.reduce((sum, r) => sum + r.totalRepaidAmount, 0);

  return (
    <div id="credits-tab-viewport" className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Total Outstanding Due</span>
            <h4 className="text-2xl font-black text-rose-600 tracking-tight mt-1">{currency}{totalOutstandingDueAll.toLocaleString('en-IN')}</h4>
          </div>
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl">
            <Coins size={20} className="stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">Total Credit Incurred</span>
            <h4 className="text-2xl font-black text-amber-600 tracking-tight mt-1">{currency}{totalCreditSpentAll.toLocaleString('en-IN')}</h4>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <CreditCard size={20} className="stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-medium">Total Part Payments Paid</span>
            <h4 className="text-2xl font-black text-emerald-600 tracking-tight mt-1">{currency}{totalPaidAll.toLocaleString('en-IN')}</h4>
          </div>
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ArrowUpRight size={20} className="stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* Primary Sub-Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-250">
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeSubTab === 'overview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-850'
            }`}
          >
            Creditors Directory & Ledger
          </button>
          <button
            onClick={() => setActiveSubTab('repayments')}
            className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeSubTab === 'repayments'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-850'
            }`}
          >
            Repayments History ({creditRepayments.length})
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => setIsOpenAddCreditor(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wide hover:bg-slate-850 transition-all cursor-pointer"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>Add Creditor</span>
          </button>

          <button
            onClick={() => {
              if (creditAccounts.length === 0) {
                alert('Please add a Creditor profile first before recording payments.');
                return;
              }
              setIsOpenAddRepayment(true);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold tracking-wide hover:bg-emerald-700 transition-all cursor-pointer"
          >
            <Coins size={14} className="stroke-[2.5]" />
            <span>Record Part Payment</span>
          </button>
        </div>
      </div>

      {activeSubTab === 'overview' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Creditors list */}
          <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search workers or tractors..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs font-medium pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                />
                <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              </div>
            </div>

            {filteredReports.length === 0 ? (
              <div className="p-8 text-center">
                <AlertCircle size={24} className="mx-auto text-slate-300 mb-2" />
                <p className="text-slate-500 text-xs font-semibold">No creditors found</p>
                <p className="text-slate-400 text-[10px] mt-1">Create profiles to track tractor owners, weeding labor groups, or suppliers on credit.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
                {filteredReports.map((report) => (
                  <button
                    key={report.account.id}
                    onClick={() => setSelectedCreditorId(report.account.id)}
                    className={`w-full text-left p-4 transition-all flex items-center justify-between cursor-pointer outline-none ${
                      selectedCreditorId === report.account.id
                        ? 'bg-slate-50 border-r-4 border-slate-900'
                        : 'hover:bg-slate-50/50'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-slate-900 text-xs">{report.account.name}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${
                          report.account.type === 'Tractor'
                            ? 'bg-blue-50 text-blue-700 border border-blue-100'
                            : report.account.type === 'Labour'
                            ? 'bg-amber-50 text-amber-700 border border-amber-100'
                            : report.account.type === 'Vendor'
                            ? 'bg-purple-50 text-purple-700 border border-purple-100'
                            : 'bg-slate-50 text-slate-650'
                        }`}>
                          {report.account.type}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-1">
                        {report.account.phone ? report.account.phone : 'No phone'}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-black text-xs ${report.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {currency}{report.outstandingBalance.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                        Outstanding
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Selected Creditor Detailed Ledger */}
          <div className="lg:col-span-7 space-y-6">
            {selectedReport ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      {selectedReport.account.name}
                      <span className="text-xs font-bold bg-slate-200 px-2 py-0.5 rounded-md text-slate-700">
                        {selectedReport.account.type}
                      </span>
                    </h3>
                    <p className="text-slate-500 text-xs font-medium mt-1">
                      {selectedReport.account.phone && `📞 ${selectedReport.account.phone} • `}
                      {selectedReport.account.notes ? selectedReport.account.notes : 'No extra notes'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this creditor profile? All credit history records will lose connection.')) {
                        onDeleteCreditAccount(selectedReport.account.id);
                        setSelectedCreditorId(null);
                      }
                    }}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl hover:text-rose-700 transition-all self-end sm:self-auto cursor-pointer"
                    title="Delete creditor profile"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Ledger Quick Summary card */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-4 rounded-xl text-center">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Total Work Bills</span>
                      <p className="text-xs font-black text-slate-800 mt-1">{currency}{selectedReport.totalCreditAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Paid Already</span>
                      <p className="text-xs font-black text-emerald-600 mt-1">{currency}{selectedReport.totalRepaidAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Outstanding Due</span>
                      <p className={`text-sm font-black mt-0.5 ${selectedReport.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {currency}{selectedReport.outstandingBalance.toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>

                  {/* Accrued Credit entries */}
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">Work Bills (Credit Incurred)</h4>
                    {selectedReport.expensesList.length === 0 && selectedReport.laboursList.length === 0 ? (
                      <p className="text-slate-400 text-xs italic py-4">No credit bills registered. Use Transactions or Labor forms and check "Hire or Buy on Credit" option!</p>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {/* Expenses (Tractor repair, machine hires, supplies on credit) */}
                        {selectedReport.expensesList.map(e => {
                          const season = seasons.find(s => s.id === e.targetSeasonId);
                          const field = fields.find(f => f.id === e.targetFieldId);
                          return (
                            <div key={e.id} className="flex items-center justify-between p-3 bg-white border border-slate-150 rounded-xl text-xs hover:border-slate-300 transition-all">
                              <div>
                                <div className="font-extrabold text-slate-850">{e.category} (Expense)</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {e.date} • Season: <span className="font-bold text-slate-600">{season ? season.cropName : 'Common'}</span> {field && `(${field.name})`}
                                </div>
                              </div>
                              <div className="font-black text-slate-800">{currency}{e.amount.toLocaleString()}</div>
                            </div>
                          );
                        })}

                        {/* Labours (Laborers hired on credit) */}
                        {selectedReport.laboursList.map(l => {
                          const season = seasons.find(s => s.id === l.seasonId);
                          const field = fields.find(f => f.id === l.fieldId);
                          return (
                            <div key={l.id} className="flex items-center justify-between p-3 bg-white border border-slate-150 rounded-xl text-xs hover:border-slate-300 transition-all">
                              <div>
                                <div className="font-extrabold text-slate-850">Labor Service ({l.workersCount} worker(s) at {currency}{l.wageRate})</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {l.date} • Season: <span className="font-bold text-slate-600">{season ? season.cropName : 'Unknown'}</span> {field && `(${field.name})`}
                                </div>
                              </div>
                              <div className="font-black text-slate-800">{currency}{l.totalCost.toLocaleString()}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Periodic Part Payments */}
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">Periodic Repayments (Payments History)</h4>
                    {selectedReport.repaymentsList.length === 0 ? (
                      <p className="text-slate-400 text-xs italic py-4">No repayments made yet. Click "Record Part Payment" to post a partial or lump-sum payment!</p>
                    ) : (
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {selectedReport.repaymentsList.map(r => {
                          const member = members.find(m => m.id === r.memberId);
                          return (
                            <div key={r.id} className="flex items-center justify-between p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl text-xs hover:border-emerald-200 transition-all">
                              <div>
                                <div className="font-extrabold text-slate-805">Repaid by {member ? member.name : 'Unknown Partner'}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {r.date} {r.notes && `• Note: "${r.notes}"`}
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-extrabold text-emerald-700">-{currency}{r.amount.toLocaleString()}</span>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this repayment entry?')) {
                                      onDeleteCreditRepayment(r.id);
                                    }
                                  }}
                                  className="text-slate-300 hover:text-rose-500 p-0.5 transition-all cursor-pointer"
                                  title="Remove payment record"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-12 text-center">
                <Calculator size={36} className="text-slate-300 mx-auto mb-3" />
                <h3 className="font-black text-slate-700 text-sm">Select a creditor</h3>
                <p className="text-slate-400 text-[10px] max-w-xs mx-auto mt-1">Please select a creditor from the directory list to see their detailed accrued bills and payments history, or create a new profile!</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Overall payments history log subtab */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/35">
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">All Creditor Repayments</h3>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-md border border-emerald-100">
              {creditRepayments.length} logged payments
            </span>
          </div>

          {creditRepayments.length === 0 ? (
            <div className="p-12 text-center">
              <Coins size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-xs font-semibold">No repayments recorded yet</p>
              <p className="text-slate-400 text-[10px] max-w-xs mx-auto mt-1">When any partner contributes cash to pay off outstanding tractor or laborer bills, record it to log their investment contribution!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-150 text-slate-500 font-bold">
                    <th className="p-4">Date</th>
                    <th className="p-4">Creditor / Vendor</th>
                    <th className="p-4">Paid By Partner</th>
                    <th className="p-4">Description / Notes</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {creditRepayments.map((rep) => {
                    const creditor = creditAccounts.find(c => c.id === rep.creditAccountId);
                    const member = members.find(m => m.id === rep.memberId);
                    return (
                      <tr key={rep.id} className="hover:bg-slate-50/50 transition-all">
                        <td className="p-4 font-medium text-slate-500">{rep.date}</td>
                        <td className="p-4">
                          <span className="font-extrabold text-slate-850">{creditor ? creditor.name : 'Deleted Creditor'}</span>
                          {creditor && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-sm font-bold ml-1.5 uppercase tracking-wide">
                              {creditor.type}
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-semibold text-slate-700 flex items-center gap-1.5">
                          <User size={12} className="text-slate-400" />
                          {member ? member.name : 'Unknown Partner'}
                        </td>
                        <td className="p-4 text-slate-500 max-w-xs truncate">{rep.notes || '—'}</td>
                        <td className="p-4 text-right font-black text-slate-900">{currency}{rep.amount.toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this repayment record?')) {
                                onDeleteCreditRepayment(rep.id);
                              }
                            }}
                            className="p-1 px-2 hover:bg-rose-50 text-slate-350 hover:text-rose-600 transition-all rounded-lg cursor-pointer text-[10px] font-bold"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: Add Creditor */}
      {isOpenAddCreditor && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">Add Creditor Profile</h3>
              <p className="text-slate-400 text-[10px] mt-0.5">Register workers unions, suppliers or machine services to hire on credit.</p>
            </div>

            <form onSubmit={handleSubmitCreditor}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Creditor Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Tractor Services, Labour union leader"
                    value={credName}
                    onChange={(e) => setCredName(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-705"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Creditor Type *</label>
                    <select
                      value={credType}
                      onChange={(e) => setCredType(e.target.value as any)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                    >
                      <option value="Labour">Labour union</option>
                      <option value="Tractor">Tractor / Hire</option>
                      <option value="Vendor">Vendor / Shop</option>
                      <option value="Other">Other Credits</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 99999..."
                      value={credPhone}
                      onChange={(e) => setCredPhone(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Notes / Description</label>
                  <textarea
                    placeholder="Describe hourly/acre rates or specific terms..."
                    rows={3}
                    value={credNotes}
                    onChange={(e) => setCredNotes(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpenAddCreditor(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 text-white hover:bg-slate-850 rounded-xl transition-all cursor-pointer"
                >
                  Save Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Record Repayment */}
      {isOpenAddRepayment && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">Record Part Repayment</h3>
              <p className="text-slate-400 text-[10px] mt-0.5">Record capital paid by a partner directly to settle outstanding bills.</p>
            </div>

            <form onSubmit={handleSubmitRepayment}>
              <div className="p-6 space-y-4 font-medium">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Select Creditor *</label>
                  <select
                    value={repCreditorId}
                    onChange={(e) => setRepCreditorId(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                  >
                    {!repCreditorId && <option value="">-- Choose Creditor --</option>}
                    {creditAccounts.map(c => {
                      const due = creditorReports.find(r => r.account.id === c.id)?.outstandingBalance || 0;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type} - Due: {currency}{due.toLocaleString()})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Paid By (Partner) *</label>
                    <select
                      value={repMemberId}
                      onChange={(e) => setRepMemberId(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Payment Date *</label>
                    <input
                      type="date"
                      required
                      value={repDate}
                      onChange={(e) => setRepDate(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Amount Paid ({currency}) *</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="Enter amount..."
                    value={repAmount}
                    onChange={(e) => setRepAmount(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Repayment Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. Paid cash for second installment"
                    value={repNotes}
                    onChange={(e) => setRepNotes(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-705"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpenAddRepayment(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all cursor-pointer"
                >
                  Record Repayment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
