/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from 'react';
import { CreditAccount, CreditRepayment, Expense, Labour, Member, Season, Field } from '../types';
import { Plus, Pencil, Trash2, CreditCard, Calculator, User, Search, AlertCircle, Coins, ArrowUpRight } from 'lucide-react';
import { Toast } from './Toast';
import { useLanguage } from '../hooks/useLanguage';
import { Dialog } from './shell/Dialog';
import { allocateToBills, attributeRepayments, billKey, billOutstanding, creditBills } from '../utils/creditBills';

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
  onEditCreditAccount: (account: CreditAccount) => void;
  onAddCreditRepayment: (repayment: CreditRepayment) => void;
  onUpdateCreditRepayment: (repayment: CreditRepayment) => void;
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
  onEditCreditAccount,
  onAddCreditRepayment,
  onUpdateCreditRepayment,
  onDeleteCreditAccount,
  onDeleteCreditRepayment
}) => {
  const { t } = useLanguage();
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'repayments'>('overview');
  const [selectedCreditorId, setSelectedCreditorId] = useState<string | null>(
    creditAccounts.length > 0 ? creditAccounts[0].id : null
  );

  // Modal open states
  const [isOpenAddCreditor, setIsOpenAddCreditor] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [isOpenAddRepayment, setIsOpenAddRepayment] = useState(false);
  const [editingRepaymentId, setEditingRepaymentId] = useState<string | null>(null);

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
  // Bills the payer says this payment is for. Empty: spread over the account.
  const [repTickedBills, setRepTickedBills] = useState<string[]>([]);

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

    if (editingAccountId) {
      const existing = creditAccounts.find(c => c.id === editingAccountId);
      const updatedCreditor: CreditAccount = {
        ...(existing as CreditAccount),
        id: editingAccountId,
        name: credName.trim(),
        phone: credPhone.trim() || undefined,
        type: credType,
        notes: credNotes.trim() || undefined
      };
      onEditCreditAccount(updatedCreditor);
      setToastMessage(t('Creditor updated'));
    } else {
      const newCreditor: CreditAccount = {
        id: `cred_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        name: credName.trim(),
        phone: credPhone.trim() || undefined,
        type: credType,
        notes: credNotes.trim() || undefined
      };
      onAddCreditAccount(newCreditor);
      setSelectedCreditorId(newCreditor.id);
      setToastMessage(t('Creditor added'));
    }

    // Reset form
    setEditingAccountId(null);
    setCredName('');
    setCredPhone('');
    setCredType('Labour');
    setCredNotes('');
    setIsOpenAddCreditor(false);
  };

  const handleOpenEditAccount = (account: CreditAccount) => {
    setEditingAccountId(account.id);
    setCredName(account.name);
    setCredPhone(account.phone || '');
    setCredType(account.type);
    setCredNotes(account.notes || '');
    setIsOpenAddCreditor(true);
  };

  // The bills a payment can be ticked against, and what each still owes
  // without this payment (so editing one does not count it against itself).
  const repCreditorForForm = repCreditorId || selectedCreditorId || '';
  const repBills = creditBills(repCreditorForForm, expenses, labours);
  const repOthersAttribution = attributeRepayments(
    repBills,
    creditRepayments.filter(r => r.creditAccountId === repCreditorForForm && r.id !== editingRepaymentId)
  );
  const repBillOutstanding = (key: string) => {
    const bill = repBills.find(b => b.key === key);
    return bill ? billOutstanding(bill, repOthersAttribution) : 0;
  };
  const repTickable = repBills.filter(b => repBillOutstanding(b.key) > 0.005);
  const repPreview = allocateToBills(Number(repAmount) || 0, repTickedBills, repBills, repBillOutstanding);
  const repTickedDue = repTickable
    .filter(b => repTickedBills.includes(b.key))
    .reduce((sum, b) => sum + repBillOutstanding(b.key), 0);
  const toggleRepBill = (key: string) =>
    setRepTickedBills(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));

  // Handle adding/editing repayment
  const handleSubmitRepayment = (e: React.FormEvent) => {
    e.preventDefault();
    const creditorId = repCreditorId || selectedCreditorId;
    if (!creditorId || !repMemberId || !repAmount || isNaN(Number(repAmount)) || Number(repAmount) <= 0) return;

    const { allocations } = allocateToBills(Number(repAmount), repTickedBills, repBills, repBillOutstanding);
    const billAllocations = allocations.length > 0 ? allocations : undefined;

    if (editingRepaymentId) {
      const updatedRepayment: CreditRepayment = {
        id: editingRepaymentId,
        creditAccountId: creditorId,
        memberId: repMemberId,
        amount: Number(repAmount),
        date: repDate,
        notes: repNotes.trim() || undefined,
        billAllocations
      };
      onUpdateCreditRepayment(updatedRepayment);
      setToastMessage(t('Repayment updated'));
    } else {
      const newRepayment: CreditRepayment = {
        id: `rep_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        creditAccountId: creditorId,
        memberId: repMemberId,
        amount: Number(repAmount),
        date: repDate,
        notes: repNotes.trim() || undefined,
        billAllocations
      };
      onAddCreditRepayment(newRepayment);
      setToastMessage(t('Repayment recorded'));
    }

    // Reset form
    setRepAmount('');
    setRepNotes('');
    setRepTickedBills([]);
    setEditingRepaymentId(null);
    setIsOpenAddRepayment(false);
  };

  const handleOpenEditRepayment = (rep: CreditRepayment) => {
    setEditingRepaymentId(rep.id);
    setRepCreditorId(rep.creditAccountId);
    setRepMemberId(rep.memberId);
    setRepAmount(String(rep.amount));
    setRepDate(rep.date);
    setRepNotes(rep.notes || '');
    setRepTickedBills((rep.billAllocations || []).map(a => a.billKey));
    setIsOpenAddRepayment(true);
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

    const bills = creditBills(account.id, expenses, labours);
    const attribution = attributeRepayments(bills, credRepayments);

    return {
      account,
      bills,
      attribution,
      totalCreditAmount,
      totalRepaidAmount,
      outstandingBalance,
      expensesList: credExpenses,
      laboursList: credLabours,
      repaymentsList: credRepayments
    };
  });

  const selectedReport = creditorReports.find(r => r.account.id === selectedCreditorId);

  // Where one bill stands, and who has paid towards it.
  const renderBillStatus = (key: string) => {
    if (!selectedReport) return null;
    const bill = selectedReport.bills.find(b => b.key === key);
    if (!bill) return null;
    const due = billOutstanding(bill, selectedReport.attribution);
    const payers = [...(selectedReport.attribution.get(key)?.entries() || [])]
      .filter(([, amount]) => amount >= 0.5)
      .map(([memberId, amount]) => `${members.find(m => m.id === memberId)?.name || t('Unknown Partner')} ${currency}${Math.round(amount).toLocaleString('en-IN')}`)
      .join(', ');
    return (
      <div className="text-right">
        <div className={`text-[10px] font-extrabold uppercase tracking-wider ${due > 0.005 ? 'text-amber-600' : 'text-emerald-600'}`}>
          {due > 0.005 ? `${currency}${Math.round(due).toLocaleString('en-IN')} ${t('due')}` : t('Settled')}
        </div>
        {payers && <div className="text-[10px] text-slate-400 font-medium">{t('Paid by')} {payers}</div>}
      </div>
    );
  };

  // Search filtered overview
  const filteredReports = creditorReports.filter(report => 
    report.account.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (report.account.phone && report.account.phone.includes(searchQuery)) ||
    report.account.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // An advance paid to one creditor is not money off what is owed to another.
  const totalOutstandingDueAll = creditorReports.reduce((sum, r) => sum + Math.max(0, r.outstandingBalance), 0);
  const totalCreditSpentAll = creditorReports.reduce((sum, r) => sum + r.totalCreditAmount, 0);
  const totalPaidAll = creditorReports.reduce((sum, r) => sum + r.totalRepaidAmount, 0);

  return (
    <div id="credits-tab-viewport" className="space-y-6">
      {/* Overview stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">{t('Total Outstanding Due')}</span>
            <h4 className="text-2xl font-black text-rose-600 tracking-tight mt-1">{currency}{totalOutstandingDueAll.toLocaleString('en-IN')}</h4>
          </div>
          <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl">
            <Coins size={20} className="stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400">{t('Total Credit Incurred')}</span>
            <h4 className="text-2xl font-black text-amber-600 tracking-tight mt-1">{currency}{totalCreditSpentAll.toLocaleString('en-IN')}</h4>
          </div>
          <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl">
            <CreditCard size={20} className="stroke-[2.5]" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 font-medium">{t('Total Part Payments Paid')}</span>
            <h4 className="text-2xl font-black text-emerald-600 tracking-tight mt-1">{currency}{totalPaidAll.toLocaleString('en-IN')}</h4>
          </div>
          <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
            <ArrowUpRight size={20} className="stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* Primary Sub-Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-2xl border border-slate-300">
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setActiveSubTab('overview')}
            className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeSubTab === 'overview'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('Creditors Directory & Ledger')}
          </button>
          <button
            onClick={() => setActiveSubTab('repayments')}
            className={`px-4 py-2 rounded-lg text-xs font-bold tracking-wide transition-all cursor-pointer ${
              activeSubTab === 'repayments'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            {t('Repayments History')} ({creditRepayments.length})
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => {
              setEditingAccountId(null);
              setCredName('');
              setCredPhone('');
              setCredType('Labour');
              setCredNotes('');
              setIsOpenAddCreditor(true);
            }}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold tracking-wide hover:bg-slate-900 transition-all cursor-pointer"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>{t('Add Creditor')}</span>
          </button>

          <button
            onClick={() => {
              setEditingRepaymentId(null);
              setRepCreditorId(selectedCreditorId || creditAccounts[0]?.id || '');
              setRepMemberId(members[0]?.id || '');
              setRepAmount('');
              setRepTickedBills([]);
              setRepDate(new Date().toISOString().split('T')[0]);
              setRepNotes('');
              setIsOpenAddRepayment(true);
            }}
            disabled={creditAccounts.length === 0}
            title={creditAccounts.length === 0 ? t('Add a creditor profile first before recording payments.') : undefined} aria-label={creditAccounts.length === 0 ? t('Add a creditor profile first before recording payments.') : undefined}
            className={`flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold tracking-wide transition-all ${
              creditAccounts.length === 0
                ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
            }`}
          >
            <Coins size={14} className="stroke-[2.5]" />
            <span>{t('Record Part Payment')}</span>
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
                  placeholder={t('Search workers or tractors...')}
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
                <p className="text-slate-500 text-xs font-semibold">{t('No creditors found')}</p>
                <p className="text-slate-400 text-[10px] mt-1">{t('Create profiles to track tractor owners, weeding labor groups, or suppliers on credit.')}</p>
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
                            : 'bg-slate-50 text-slate-700'
                        }`}>
                          {t(report.account.type)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium mt-1">
                        {report.account.phone ? report.account.phone : t('No phone')}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`font-black text-xs ${report.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {currency}{Math.abs(report.outstandingBalance).toLocaleString('en-IN')}
                      </div>
                      <div className="text-[9px] text-slate-400 font-bold mt-0.5 uppercase tracking-wider">
                        {report.outstandingBalance < 0 ? t('Advance paid') : t('Outstanding')}
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
                        {t(selectedReport.account.type)}
                      </span>
                    </h3>
                    <p className="text-slate-500 text-xs font-medium mt-1">
                      {selectedReport.account.phone && `📞 ${selectedReport.account.phone} • `}
                      {selectedReport.account.notes ? selectedReport.account.notes : t('No extra notes')}
                    </p>
                  </div>

                  <div className="flex items-center gap-1 self-end sm:self-auto">
                    <button
                      onClick={() => handleOpenEditAccount(selectedReport.account)}
                      className="p-2.5 text-slate-500 hover:bg-slate-100 rounded-xl hover:text-slate-700 transition-all cursor-pointer"
                      title={t('Edit creditor profile')} aria-label={t('Edit creditor profile')}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this creditor profile? All credit history records will lose connection.')) {
                          onDeleteCreditAccount(selectedReport.account.id);
                          setSelectedCreditorId(null);
                        }
                      }}
                      className="p-2.5 text-rose-500 hover:bg-rose-50 rounded-xl hover:text-rose-700 transition-all cursor-pointer"
                      title={t('Delete creditor profile')} aria-label={t('Delete creditor profile')}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Ledger Quick Summary card */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-4 rounded-xl text-center">
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('Total Work Bills')}</span>
                      <p className="text-xs font-black text-slate-800 mt-1">{currency}{selectedReport.totalCreditAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{t('Paid Already')}</span>
                      <p className="text-xs font-black text-emerald-600 mt-1">{currency}{selectedReport.totalRepaidAmount.toLocaleString('en-IN')}</p>
                    </div>
                    <div>
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                        {selectedReport.outstandingBalance < 0 ? t('Advance paid') : t('Outstanding Due')}
                      </span>
                      <p className={`text-sm font-black mt-0.5 ${selectedReport.outstandingBalance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                        {currency}{Math.abs(selectedReport.outstandingBalance).toLocaleString('en-IN')}
                      </p>
                      {selectedReport.outstandingBalance < 0 && (
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 leading-snug">
                          {t('Paid ahead of the bills. It goes onto bills as they are added.')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Accrued Credit entries */}
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">{t('Work Bills (Credit Incurred)')}</h4>
                    {selectedReport.expensesList.length === 0 && selectedReport.laboursList.length === 0 ? (
                      <p className="text-slate-400 text-xs italic py-4">{t('No credit bills registered. Use Transactions or Labor forms and check "Hire or Buy on Credit" option!')}</p>
                    ) : (
                      <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                        {/* Every bill on the account, oldest first: the order payments settle them in */}
                        {selectedReport.bills.map(bill => {
                          if (bill.kind === 'expense') {
                            const e = selectedReport.expensesList.find(x => x.id === bill.id);
                            if (!e) return null;
                          const season = seasons.find(s => s.id === e.targetSeasonId);
                          const field = fields.find(f => f.id === e.targetFieldId);
                          return (
                            <div key={e.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-xs hover:border-slate-300 transition-all">
                              <div>
                                <div className="font-extrabold text-slate-900">{e.category} (Expense)</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {e.date} • Season: <span className="font-bold text-slate-600">{season ? season.cropName : 'Common'}</span> {field && `(${field.name})`}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-black text-slate-800">{currency}{e.amount.toLocaleString()}</div>
                                {renderBillStatus(billKey('expense', e.id))}
                              </div>
                            </div>
                          );
                          }
                          const l = selectedReport.laboursList.find(x => x.id === bill.id);
                          if (!l) return null;
                          const season = seasons.find(s => s.id === l.seasonId);
                          const field = fields.find(f => f.id === l.fieldId);
                          return (
                            <div key={l.id} className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-xs hover:border-slate-300 transition-all">
                              <div>
                                <div className="font-extrabold text-slate-900">{l.description || 'Labor Service'} ({l.workersCount} worker(s) at {currency}{l.wageRate})</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {l.date} • Season: <span className="font-bold text-slate-600">{season ? season.cropName : 'Unknown'}</span> {field && `(${field.name})`}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-black text-slate-800">{currency}{l.totalCost.toLocaleString()}</div>
                                {renderBillStatus(billKey('labour', l.id))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Periodic Part Payments */}
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">{t('Periodic Repayments (Payments History)')}</h4>
                    {selectedReport.repaymentsList.length === 0 ? (
                      <p className="text-slate-400 text-xs italic py-4">{t('No repayments made yet. Click "Record Part Payment" to post a partial or lump-sum payment!')}</p>
                    ) : (
                      <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                        {selectedReport.repaymentsList.map(r => {
                          const member = members.find(m => m.id === r.memberId);
                          return (
                            <div key={r.id} className="flex items-center justify-between p-3 bg-emerald-50/40 border border-emerald-100 rounded-xl text-xs hover:border-emerald-200 transition-all">
                              <div>
                                <div className="font-extrabold text-slate-800">Repaid by {member ? member.name : t('Unknown Partner')}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">
                                  {r.date} {r.notes && `• Note: "${r.notes}"`}
                                </div>
                                {r.billAllocations && r.billAllocations.length > 0 && (
                                  <div className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                                    {t('Settles')}: {r.billAllocations
                                      .map(a => selectedReport.bills.find(b => b.key === a.billKey)?.label)
                                      .filter(Boolean)
                                      .join(', ')}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="font-extrabold text-emerald-700">-{currency}{r.amount.toLocaleString()}</span>
                                <button
                                  onClick={() => handleOpenEditRepayment(r)}
                                  className="text-slate-500 hover:text-emerald-600 p-2 transition-all cursor-pointer"
                                  title={t('Edit payment record')} aria-label={t('Edit payment record')}
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  onClick={() => {
                                    if (confirm('Delete this repayment entry?')) {
                                      onDeleteCreditRepayment(r.id);
                                    }
                                  }}
                                  className="text-slate-500 hover:text-rose-500 p-2 transition-all cursor-pointer"
                                  title={t('Remove payment record')} aria-label={t('Remove payment record')}
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
                <h3 className="font-black text-slate-700 text-sm">{t('Select a creditor')}</h3>
                <p className="text-slate-400 text-[10px] max-w-xs mx-auto mt-1">{t('Please select a creditor from the directory list to see their detailed accrued bills and payments history, or create a new profile!')}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Overall payments history log subtab */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/35">
            <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">{t('All Creditor Repayments')}</h3>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-1 rounded-md border border-emerald-100">
              {creditRepayments.length} {t('logged payments')}
            </span>
          </div>

          {creditRepayments.length === 0 ? (
            <div className="p-12 text-center">
              <Coins size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500 text-xs font-semibold">{t('No repayments recorded yet')}</p>
              <p className="text-slate-400 text-[10px] max-w-xs mx-auto mt-1">{t('When any partner contributes cash to pay off outstanding tractor or laborer bills, record it to log their investment contribution!')}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
                    <th className="p-4">{t('Date')}</th>
                    <th className="p-4">{t('Creditor / Vendor')}</th>
                    <th className="p-4">{t('Paid By Partner')}</th>
                    <th className="p-4">{t('Description / Notes')}</th>
                    <th className="p-4 text-right">{t('Amount')}</th>
                    <th className="p-4 text-center">{t('Actions')}</th>
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
                          <span className="font-extrabold text-slate-900">{creditor ? creditor.name : t('Deleted Creditor')}</span>
                          {creditor && (
                            <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-sm font-bold ml-1.5 uppercase tracking-wide">
                              {t(creditor.type)}
                            </span>
                          )}
                        </td>
                        <td className="p-4 font-semibold text-slate-700 flex items-center gap-1.5">
                          <User size={12} className="text-slate-400" />
                          {member ? member.name : t('Unknown Partner')}
                        </td>
                        <td className="p-4 text-slate-500 max-w-xs truncate">{rep.notes || '—'}</td>
                        <td className="p-4 text-right font-black text-slate-900">{currency}{rep.amount.toLocaleString()}</td>
                        <td className="p-4 text-center">
                          <button
                            onClick={() => handleOpenEditRepayment(rep)}
                            className="p-2 px-2.5 hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-all rounded-lg cursor-pointer text-[10px] font-bold"
                          >
                            {t('Edit')}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to delete this repayment record?')) {
                                onDeleteCreditRepayment(rep.id);
                              }
                            }}
                            className="p-2 px-2.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all rounded-lg cursor-pointer text-[10px] font-bold"
                          >
                            {t('Delete')}
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
        <Dialog label={t('Add Creditor Profile')} onClose={() => setIsOpenAddCreditor(false)} className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">{editingAccountId ? t('Edit Creditor Profile') : t('Add Creditor Profile')}</h3>
              <p className="text-slate-400 text-[10px] mt-0.5">{t('Register workers unions, suppliers or machine services to hire on credit.')}</p>
            </div>

            <form onSubmit={handleSubmitCreditor}>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Creditor Name *')}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Tractor Services, Labour union leader"
                    value={credName}
                    onChange={(e) => setCredName(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium text-slate-700"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Creditor Type *')}</label>
                    <select
                      value={credType}
                      onChange={(e) => setCredType(e.target.value as any)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                    >
                      <option value="Labour">{t('Labour union')}</option>
                      <option value="Tractor">{t('Tractor / Hire')}</option>
                      <option value="Vendor">{t('Vendor / Shop')}</option>
                      <option value="Other">{t('Other Credits')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Phone Number')}</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 99999..."
                      value={credPhone}
                      onChange={(e) => setCredPhone(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Notes / Description')}</label>
                  <textarea
                    placeholder="Describe hourly/acre rates or specific terms..."
                    rows={3}
                    value={credNotes}
                    onChange={(e) => setCredNotes(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccountId(null);
                    setIsOpenAddCreditor(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-slate-900 text-white hover:bg-slate-900 rounded-xl transition-all cursor-pointer"
                >
                  {editingAccountId ? t('Save Changes') : t('Save Profile')}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* MODAL: Record Repayment */}
      {isOpenAddRepayment && (
        <Dialog label={t('Record Part Repayment')} onClose={() => setIsOpenAddRepayment(false)} className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-base">{editingRepaymentId ? t('Edit Part Repayment') : t('Record Part Repayment')}</h3>
              <p className="text-slate-400 text-[10px] mt-0.5">{editingRepaymentId ? t('Update the details of this recorded repayment.') : t('Record capital paid by a partner directly to settle outstanding bills.')}</p>
            </div>

            <form onSubmit={handleSubmitRepayment}>
              <div className="p-6 space-y-4 font-medium">
                <div>
                  <label htmlFor="rep-creditor" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Select Creditor *')}</label>
                  <select
                    id="rep-creditor"
                    value={repCreditorId}
                    onChange={(e) => { setRepCreditorId(e.target.value); setRepTickedBills([]); }}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                  >
                    {!repCreditorId && <option value="">{t('-- Choose Creditor --')}</option>}
                    {creditAccounts.map(c => {
                      const due = creditorReports.find(r => r.account.id === c.id)?.outstandingBalance || 0;
                      return (
                        <option key={c.id} value={c.id}>
                          {c.name} ({t(c.type)} - {t('Due')}: {currency}{due.toLocaleString()})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="rep-member" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Paid By (Partner) *')}</label>
                    <select
                      id="rep-member"
                      value={repMemberId}
                      onChange={(e) => setRepMemberId(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label htmlFor="rep-date" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Payment Date *')}</label>
                    <input
                      id="rep-date"
                      type="date"
                      required
                      value={repDate}
                      onChange={(e) => setRepDate(e.target.value)}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="rep-amount" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Amount Paid')} ({currency}) *</label>
                  <input
                    id="rep-amount"
                    type="number"
                    step="any"
                    required
                    placeholder="Enter amount..."
                    value={repAmount}
                    onChange={(e) => setRepAmount(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-bold text-slate-800"
                  />
                </div>

                {repTickable.length > 0 && (
                  <fieldset>
                    <legend className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Which bills is this paying?')}</legend>
                    <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
                      {t('Tick the bills this payment settles. Tick none and it settles the oldest unpaid bills first.')}
                    </p>
                    <div className="space-y-1.5 max-h-[170px] overflow-y-auto pr-1">
                      {repTickable.map(b => (
                        <label key={b.key} className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                          repTickedBills.includes(b.key) ? 'bg-emerald-50 border-emerald-300' : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}>
                          <input
                            type="checkbox"
                            checked={repTickedBills.includes(b.key)}
                            onChange={() => toggleRepBill(b.key)}
                            className="accent-emerald-600"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold text-slate-800 truncate">{b.label}</span>
                            <span className="block text-[10px] text-slate-400">{b.date}</span>
                          </span>
                          <span className="font-extrabold text-slate-700 shrink-0">{currency}{Math.round(repBillOutstanding(b.key)).toLocaleString('en-IN')} {t('due')}</span>
                        </label>
                      ))}
                    </div>

                    {repTickedBills.length > 0 && (
                      <div className="mt-2 text-[10px] leading-relaxed text-slate-500">
                        {!repAmount && (
                          <button
                            type="button"
                            onClick={() => setRepAmount(String(Number(repTickedDue.toFixed(2))))}
                            className="font-bold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                          >
                            {t('Pay the full')} {currency}{Math.round(repTickedDue).toLocaleString('en-IN')} {t('due on the ticked bills')}
                          </button>
                        )}
                        {repPreview.allocations.map(a => (
                          <div key={a.billKey}>
                            {currency}{a.amount.toLocaleString('en-IN')} → {repBills.find(b => b.key === a.billKey)?.label}
                          </div>
                        ))}
                        {repPreview.leftover > 0.005 && Number(repAmount) > 0 && (
                          <div className="text-amber-700 font-semibold">
                            {currency}{repPreview.leftover.toLocaleString('en-IN')} {t('is more than the ticked bills owe; the rest will settle the oldest other unpaid bills.')}
                          </div>
                        )}
                      </div>
                    )}
                  </fieldset>
                )}

                <div>
                  <label htmlFor="rep-notes" className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">{t('Repayment Notes')}</label>
                  <input
                    id="rep-notes"
                    type="text"
                    placeholder="e.g. Paid cash for second installment"
                    value={repNotes}
                    onChange={(e) => setRepNotes(e.target.value)}
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-slate-700"
                  />
                </div>
              </div>

              <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRepaymentId(null);
                    setRepTickedBills([]);
                    setIsOpenAddRepayment(false);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 rounded-xl transition-all cursor-pointer"
                >
                  {editingRepaymentId ? t('Save Changes') : t('Record Repayment')}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
};
