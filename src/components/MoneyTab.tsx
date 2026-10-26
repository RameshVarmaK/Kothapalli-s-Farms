/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Expense,
  Labour,
  HarvestRevenue,
  Field,
  Season,
  Member,
  Activity,
  CreditAccount,
  Attachment,
  Payment
} from '../types';
import { Plus, AlertTriangle, Download } from 'lucide-react';
import { calculateAllocations, allocationDiscrepancy } from '../utils/calculations';
import { AttachmentGallery } from './AttachmentGallery';
import { expenseAttachments } from '../utils/attachments';
import { removedDriveFileIds } from '../utils/driveReceipts';
import { trashDriveFiles } from '../utils/receiptsFolder';
import { Toast } from './Toast';
import { TransactionFeed } from './money/TransactionFeed';
import { EntryModal } from './money/EntryModal';
import { useMoneyEntryForm } from './money/useMoneyEntryForm';
import { resolvePayers } from '../utils/payers';
import { exportLedgerCsv } from '../utils/csv';
import { buildLedgerItems, filterLedger, LedgerItem } from '../utils/moneyLedger';
import { useLanguage } from '../hooks/useLanguage';
import { Dialog } from './shell/Dialog';

interface MoneyTabProps {
  expenses: Expense[];
  labours: Labour[];
  revenues: HarvestRevenue[];
  fields: Field[];
  seasons: Season[];
  members: Member[];
  activities: Activity[];
  currency: string;
  creditAccounts?: CreditAccount[];
  /** Google access token, for loading receipt images from Drive. */
  accessToken?: string | null;
  onAddExpense: (expense: Expense) => boolean;
  onEditExpense: (expense: Expense) => boolean;
  onDeleteExpense: (id: string) => void;
  onAddLabour: (labour: Labour) => boolean;
  onEditLabour: (labour: Labour) => boolean;
  onDeleteLabour: (id: string) => void;
  onAddRevenue: (revenue: HarvestRevenue) => boolean;
  onEditRevenue: (revenue: HarvestRevenue) => boolean;
  onDeleteRevenue: (id: string) => void;
}

export const MoneyTab: React.FC<MoneyTabProps> = ({
  expenses = [],
  labours = [],
  revenues = [],
  fields = [],
  seasons = [],
  members = [],
  activities = [],
  currency,
  creditAccounts = [],
  accessToken = null,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onAddLabour,
  onEditLabour,
  onDeleteLabour,
  onAddRevenue,
  onEditRevenue,
  onDeleteRevenue
}) => {
  const { t } = useLanguage();
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'labour' | 'revenue'>('all');
  const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<{
    id: string;
    type: 'expense' | 'labour' | 'revenue';
  } | null>(null);
  const [filterFieldId, setFilterFieldId] = useState<string>('all');
  const [filterMemberId, setFilterMemberId] = useState<string>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const form = useMoneyEntryForm(members);
  const {
    isOpenAddModal,
    setIsOpenAddModal,
    setAddTab,
    editingRecordId,
    setEditingRecordId,
    setFormError,
    date,
    setDate,
    amount,
    setAmount,
    paidBy,
    setPaidBy,
    splitPayers,
    setSplitPayers,
    payerRows,
    setPayerRows,
    category,
    setCategory,
    linkedActivityId,
    setLinkedActivityId,
    targetType,
    setTargetType,
    selectedSeasonId,
    setSelectedSeasonId,
    allocationRule,
    setAllocationRule,
    selectedParticipatingSeasons,
    setSelectedParticipatingSeasons,
    manualAllocations,
    setManualAllocations,
    workersCount,
    setWorkersCount,
    labourDescription,
    setLabourDescription,
    wageRate,
    setWageRate,
    labourTotalCost,
    setLabourTotalCost,
    labourTargetType,
    setLabourTargetType,
    labourAllocationRule,
    setLabourAllocationRule,
    labourParticipatingSeasons,
    setLabourParticipatingSeasons,
    manualLabourAllocations,
    setManualLabourAllocations,
    revenueCrop,
    setRevenueCrop,
    revenueQuantity,
    setRevenueQuantity,
    buyerName,
    setBuyerName,
    isCredit,
    setIsCredit,
    creditAccountId,
    setCreditAccountId,
    attachments,
    setAttachments
  } = form;

  const [galleryExpenseId, setGalleryExpenseId] = useState<string | null>(null);
  const galleryExpense = galleryExpenseId ? expenses.find(e => e.id === galleryExpenseId) : undefined;
  const galleryAttachments = galleryExpense ? expenseAttachments(galleryExpense) : [];
  // Receipts taken off an expense (or on a deleted one) go to the Drive
  // trash in the background; saving never waits on it, and a file this
  // account can't trash (a partner's) is left alone.
  const trashRemovedReceipts = (before: Expense | null | undefined, after: Attachment[] | undefined) => {
    const ids = removedDriveFileIds(before, after);
    if (accessToken && ids.length > 0) void trashDriveFiles(accessToken, ids);
  };

  const activeSeasons = seasons.filter(s => !s.isClosed);

  const ledgerItems = buildLedgerItems({ expenses, labours, revenues, fields, seasons, members, creditAccounts, currency });
  const filteredLedger = filterLedger(ledgerItems, { filterType, filterFieldId, filterMemberId });

  const handleNewEntry = () => {
    setSelectedSeasonId(activeSeasons[0]?.id || seasons[0]?.id || '');
    setIsOpenAddModal(true);
  };

  // Handle Start Edit
  const handleStartEdit = ({ type, rawRecord }: LedgerItem) => {
    setEditingRecordId(rawRecord.id);
    setAddTab(type);
    setDate(rawRecord.date);
    setPaidBy(type === 'revenue' ? rawRecord.receivedByMemberId : rawRecord.paidByMemberId);
    const editedPayers = type === 'revenue' ? rawRecord.receivers : rawRecord.payers;
    if (editedPayers && editedPayers.length > 1) {
      setSplitPayers(true);
      setPayerRows(members.map(m => {
        const paid = editedPayers.find(p => p.memberId === m.id);
        return { memberId: m.id, paid: !!paid, amount: paid ? String(paid.amount) : '' };
      }));
    } else {
      setSplitPayers(false);
      setPayerRows([]);
    }
    setIsCredit(type !== 'revenue' && !!rawRecord.isCredit);
    setCreditAccountId((type !== 'revenue' && rawRecord.creditAccountId) || '');
    
    if (type === 'expense') {
      setAmount(String(rawRecord.amount));
      setCategory(rawRecord.category);
      setLinkedActivityId(rawRecord.linkedActivityId || '');
      setTargetType(rawRecord.targetType);
      setAttachments(expenseAttachments(rawRecord));
      
      if (rawRecord.targetType === 'single') {
        setSelectedSeasonId(rawRecord.targetSeasonId || '');
      } else {
        setAllocationRule(rawRecord.commonAllocationRule || 'equal');
        setSelectedParticipatingSeasons(rawRecord.allocations?.map(al => al.seasonId) || []);
        
        const initialManual: { [key: string]: string } = {};
        rawRecord.allocations?.forEach(al => {
          initialManual[`${al.fieldId}_${al.seasonId}`] = String(al.amount);
        });
        setManualAllocations(initialManual);
      }
    } else if (type === 'labour') {
      setWorkersCount(String(rawRecord.workersCount));
      setLabourDescription(rawRecord.description || '');
      setWageRate(String(rawRecord.wageRate));
      setLabourTotalCost(String(rawRecord.totalCost));
      setLinkedActivityId(rawRecord.linkedActivityId || '');
      setLabourTargetType(rawRecord.targetType === 'common' ? 'common' : 'single');

      if (rawRecord.targetType === 'common') {
        setLabourAllocationRule(rawRecord.commonAllocationRule || 'equal');
        setLabourParticipatingSeasons(rawRecord.allocations?.map(al => al.seasonId) || []);

        const initialManual: { [key: string]: string } = {};
        rawRecord.allocations?.forEach(al => {
          initialManual[`${al.fieldId}_${al.seasonId}`] = String(al.amount);
        });
        setManualLabourAllocations(initialManual);
      } else {
        setSelectedSeasonId(rawRecord.seasonId || '');
      }
    } else if (type === 'revenue') {
      setSelectedSeasonId(rawRecord.seasonId);
      setRevenueCrop(rawRecord.crop);
      setRevenueQuantity(String(rawRecord.quantity));
      setAmount(String(rawRecord.saleAmount));
      setBuyerName(rawRecord.buyerName || '');
    }

    setIsOpenAddModal(true);
  };

  // Who paid an entry that partners paid directly: one partner, or several
  // with what each paid (which must come to exactly the total). Credit
  // entries have no payer; harvest sales ask who received instead.
  const resolveWho = (total: number, verb: 'paid' | 'received' = 'paid'): { paidByMemberId: string; payers?: Payment[]; error?: string } => {
    if (verb === 'paid' && isCredit) return { paidByMemberId: '' };
    const { memberId, payers, error } = resolvePayers({ split: splitPayers, rows: payerRows, single: paidBy, total, verb });
    return { paidByMemberId: memberId, payers, error };
  };

  // Handle Quick Save Actions
  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      setFormError('Enter an expense amount greater than 0 before saving.');
      return;
    }

    // Guard rail: if the user picked the "manual" allocation rule, make sure
    // their per-season values actually sum to the headline amount. Without
    // this check, the engine silently writes whatever the caller provided
    // (see tests/calculationScenarios.ts → "manual amounts ignore the total amount argument")
    // and the settlement ledger becomes inconsistent.
    if (targetType === 'common' && allocationRule === 'manual') {
      const parsedManual: { [key: string]: number } = {};
      Object.keys(manualAllocations).forEach(k => {
        parsedManual[k] = parseFloat(manualAllocations[k]) || 0;
      });
      const diff = allocationDiscrepancy(amt, parsedManual);
      if (Math.abs(diff) > 0.5) {
        setFormError(
          `Manual allocations are off by ${diff > 0 ? '+' : ''}${diff.toFixed(2)}. ` +
          `The per-season values must sum to exactly ${amt.toFixed(2)}. ` +
          `Adjust the entries before saving.`,
        );
        return;
      }
    }
    setFormError(null);

    const payerOutcome = resolveWho(amt);
    if (payerOutcome.error) {
      setFormError(payerOutcome.error);
      return;
    }

    let expensePost: Expense;
    const baseExpense = editingRecordId ? expenses.find(exp => exp.id === editingRecordId) : null;
    // A receipt may have reached Drive while this form was open; keep the
    // uploaded copy rather than the pending one the form loaded, or it would
    // be uploaded twice.
    const currentAttachments = baseExpense ? expenseAttachments(baseExpense) : [];
    const reconciled = attachments.map(a => {
      const current = currentAttachments.find(c => c.id === a.id);
      return current?.driveFileId && !a.driveFileId ? current : a;
    });
    const savedAttachments = reconciled.length > 0 ? reconciled : undefined;

    if (targetType === 'single') {
      const season = seasons.find(s => s.id === selectedSeasonId);
      if (!season) {
        setFormError('Pick a crop cycle to charge this expense against before saving.');
        return;
      }
      expensePost = {
        ...(baseExpense || {}),
        id: editingRecordId || `exp_${Date.now()}`,
        date,
        amount: amt,
        paidByMemberId: payerOutcome.paidByMemberId,
        payers: payerOutcome.payers,
        category,
        linkedActivityId: linkedActivityId || undefined,
        targetType: 'single',
        targetFieldId: season.fieldId,
        targetSeasonId: season.id,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined,
        receiptPhoto: undefined,
        attachments: savedAttachments
      } as Expense;
    } else {
      // Allocate common
      const participatingDetailed = selectedParticipatingSeasons.map(sid => {
        const s = seasons.find(sea => sea.id === sid);
        if (!s) return null;
        const f = fields.find(field => field.id === s.fieldId);
        return {
          fieldId: s.fieldId,
          seasonId: s.id,
          fieldArea: f?.area || 1
        };
      }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

      const parsedManual: { [key: string]: number } = {};
      Object.keys(manualAllocations).forEach(k => {
        parsedManual[k] = parseFloat(manualAllocations[k]) || 0;
      });

      const calculatedAlloc = calculateAllocations(amt, allocationRule, participatingDetailed, parsedManual);

      expensePost = {
        ...(baseExpense || {}),
        id: editingRecordId || `exp_${Date.now()}`,
        date,
        amount: amt,
        paidByMemberId: payerOutcome.paidByMemberId,
        payers: payerOutcome.payers,
        category,
        linkedActivityId: linkedActivityId || undefined,
        targetType: 'common',
        commonAllocationRule: allocationRule,
        allocations: calculatedAlloc,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined,
        receiptPhoto: undefined,
        attachments: savedAttachments
      } as Expense;
    }

    // The parent validates as well, and refuses entries this form cannot
    // catch on its own. Waiting for its answer before announcing success is
    // what stops a rejected entry from looking saved.
    if (editingRecordId) {
      if (!onEditExpense(expensePost)) return;
      trashRemovedReceipts(baseExpense, expensePost.attachments);
      setToastMessage(t('Expense updated'));
    } else {
      if (!onAddExpense(expensePost)) return;
      setToastMessage(t('Expense saved'));
    }
    closeAndReset();
  };

  const handleSaveLabour = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(workersCount);
    const rate = parseFloat(wageRate);
    const computedTotal = labourTotalCost ? parseFloat(labourTotalCost) : count * rate;

    if (!labourDescription.trim()) {
      setFormError('Describe the work that was done before saving.');
      return;
    }
    if (!computedTotal || computedTotal <= 0) {
      setFormError('Enter a workers count/wage rate or total cost greater than 0 before saving.');
      return;
    }
    if (labourTargetType === 'single' && !selectedSeasonId) {
      setFormError('Pick a crop cycle to charge this labour cost against before saving.');
      return;
    }

    // Same guard rail as the expense/usage manual-allocation checks: the
    // per-season values must sum to the headline total before saving.
    if (labourTargetType === 'common' && labourAllocationRule === 'manual') {
      const parsedManual: { [key: string]: number } = {};
      Object.keys(manualLabourAllocations).forEach(k => {
        parsedManual[k] = parseFloat(manualLabourAllocations[k]) || 0;
      });
      const diff = allocationDiscrepancy(computedTotal, parsedManual);
      if (Math.abs(diff) > 0.5) {
        setFormError(
          `Manual allocations are off by ${diff > 0 ? '+' : ''}${diff.toFixed(2)}. ` +
          `The per-field values must sum to exactly ${computedTotal.toFixed(2)}. ` +
          `Adjust the entries before saving.`,
        );
        return;
      }
    }
    setFormError(null);

    const baseLabour = editingRecordId ? labours.find(l => l.id === editingRecordId) : null;

    const payerOutcome = resolveWho(computedTotal);
    if (payerOutcome.error) {
      setFormError(payerOutcome.error);
      return;
    }

    let labourPost: Labour;

    if (labourTargetType === 'single') {
      const season = seasons.find(s => s.id === selectedSeasonId);
      if (!season) {
        setFormError('Pick a crop cycle to charge this labour cost against before saving.');
        return;
      }
      labourPost = {
        ...(baseLabour || {}),
        id: editingRecordId || `labour_${Date.now()}`,
        date,
        targetType: 'single',
        fieldId: season.fieldId,
        seasonId: season.id,
        allocations: undefined,
        commonAllocationRule: undefined,
        linkedActivityId: linkedActivityId || undefined,
        description: labourDescription.trim(),
        workersCount: count || 0,
        wageRate: rate || 0,
        totalCost: computedTotal,
        paidByMemberId: payerOutcome.paidByMemberId,
        payers: payerOutcome.payers,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined
      } as Labour;
    } else {
      const participatingDetailed = labourParticipatingSeasons.map(sid => {
        const s = seasons.find(sea => sea.id === sid);
        if (!s) return null;
        const f = fields.find(field => field.id === s.fieldId);
        return { fieldId: s.fieldId, seasonId: s.id, fieldArea: f?.area || 1 };
      }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

      const parsedManual: { [key: string]: number } = {};
      Object.keys(manualLabourAllocations).forEach(k => {
        parsedManual[k] = parseFloat(manualLabourAllocations[k]) || 0;
      });

      const calculatedAlloc = calculateAllocations(computedTotal, labourAllocationRule, participatingDetailed, parsedManual);

      labourPost = {
        ...(baseLabour || {}),
        id: editingRecordId || `labour_${Date.now()}`,
        date,
        targetType: 'common',
        fieldId: undefined,
        seasonId: undefined,
        commonAllocationRule: labourAllocationRule,
        allocations: calculatedAlloc,
        linkedActivityId: linkedActivityId || undefined,
        description: labourDescription.trim(),
        workersCount: count || 0,
        wageRate: rate || 0,
        totalCost: computedTotal,
        paidByMemberId: payerOutcome.paidByMemberId,
        payers: payerOutcome.payers,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined
      } as Labour;
    }

    // The parent validates as well, and refuses entries this form cannot
    // catch on its own. Waiting for its answer before announcing success is
    // what stops a rejected entry from looking saved.
    if (editingRecordId) {
      if (!onEditLabour(labourPost)) return;
      setToastMessage(t('Labour cost updated'));
    } else {
      if (!onAddLabour(labourPost)) return;
      setToastMessage(t('Labour cost saved'));
    }
    closeAndReset();
  };

  const handleSaveRevenue = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = parseFloat(revenueQuantity);
    const sale = parseFloat(amount);
    const season = seasons.find(s => s.id === selectedSeasonId);

    if (!sale || sale <= 0) {
      setFormError('Enter a sale amount greater than 0 before saving.');
      return;
    }
    if (!season) {
      setFormError('Pick a crop cycle to credit this harvest sale against before saving.');
      return;
    }

    const revenuePayer = resolveWho(sale, 'received');
    if (revenuePayer.error) {
      setFormError(revenuePayer.error);
      return;
    }

    const baseRevenue = editingRecordId ? revenues.find(r => r.id === editingRecordId) : null;

    const revenuePost: HarvestRevenue = {
      ...(baseRevenue || {}),
      id: editingRecordId || `rev_${Date.now()}`,
      date,
      fieldId: season.fieldId,
      seasonId: season.id,
      crop: revenueCrop || season.cropName,
      quantity: qty || 0,
      buyerName: buyerName || undefined,
      saleAmount: sale,
      receivedByMemberId: revenuePayer.paidByMemberId,
      receivers: revenuePayer.payers
    } as HarvestRevenue;

    // The parent validates as well, and refuses entries this form cannot
    // catch on its own. Waiting for its answer before announcing success is
    // what stops a rejected entry from looking saved.
    if (editingRecordId) {
      if (!onEditRevenue(revenuePost)) return;
      setToastMessage(t('Harvest sale updated'));
    } else {
      if (!onAddRevenue(revenuePost)) return;
      setToastMessage(t('Harvest sale saved'));
    }
    closeAndReset();
  };

  const closeAndReset = () => {
    setIsOpenAddModal(false);
    setEditingRecordId(null);
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setCategory('');
    setLinkedActivityId('');
    setWorkersCount('');
    setLabourDescription('');
    setWageRate('');
    setLabourTotalCost('');
    setRevenueCrop('');
    setRevenueQuantity('');
    setBuyerName('');
    setSelectedParticipatingSeasons([]);
    setManualAllocations({});
    setLabourTargetType('single');
    setLabourAllocationRule('equal');
    setLabourParticipatingSeasons([]);
    setManualLabourAllocations({});
    setIsCredit(false);
    setCreditAccountId('');
    setSplitPayers(false);
    setPayerRows([]);
    setAttachments([]);
    setFormError(null);
  };

  const handleDelete = (id: string, type: 'expense' | 'labour' | 'revenue') => {
    setDeleteConfirmInfo({ id, type });
  };


  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Quick type toggler */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-300">
            {(['all', 'expense', 'labour', 'revenue'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  filterType === type ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {t(type)}
              </button>
            ))}
          </div>

          {/* Sown Field filter */}
          <select
            value={filterFieldId}
            onChange={e => setFilterFieldId(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-xl px-3.5 py-2.5 font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">{t('📍 All Sown Fields')}</option>
            {fields.map(f => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>

          {/* Member filter */}
          <select
            value={filterMemberId}
            onChange={e => setFilterMemberId(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-xl px-3.5 py-2.5 font-semibold focus:ring-1"
          >
            <option value="all">{t('👤 Funder: All Partners')}</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Action Quick Add */}
        <div className="flex items-center gap-2 ml-auto">
        <button
          type="button"
          onClick={() => exportLedgerCsv(filteredLedger)}
          disabled={filteredLedger.length === 0}
          className="flex items-center gap-2 bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold text-xs px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Download size={14} />
          <span>{t('Export CSV')}</span>
        </button>
        <button
          onClick={handleNewEntry}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={15} />
          <span>+ {t('New Entry')}</span>
        </button>
        </div>
      </div>

      <TransactionFeed
        entries={filteredLedger}
        hasEntries={ledgerItems.length > 0}
        currency={currency}
        onNewEntry={handleNewEntry}
        onClearFilters={() => {
          setFilterType('all');
          setFilterFieldId('all');
          setFilterMemberId('all');
        }}
        onViewReceipts={setGalleryExpenseId}
        onEdit={handleStartEdit}
        onDelete={handleDelete}
      />

      {galleryExpense && galleryAttachments.length > 0 && (
        <AttachmentGallery
          attachments={galleryAttachments}
          accessToken={accessToken}
          title={galleryExpense.category}
          onClose={() => setGalleryExpenseId(null)}
        />
      )}

      {isOpenAddModal && (
        <EntryModal
          form={form}
          members={members}
          fields={fields}
          seasons={seasons}
          activities={activities}
          creditAccounts={creditAccounts}
          currency={currency}
          accessToken={accessToken}
          onSaveExpense={handleSaveExpense}
          onSaveLabour={handleSaveLabour}
          onSaveRevenue={handleSaveRevenue}
          onClose={closeAndReset}
        />
      )}

      {deleteConfirmInfo && (
        <Dialog label={t('Delete Transaction')} onClose={() => setDeleteConfirmInfo(null)} className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <AlertTriangle size={24} className="stroke-[2.5]" />
                <h3 className="font-extrabold text-slate-900 text-sm">{t('Delete Transaction')}</h3>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed font-semibold mt-2">
                {t('Permanently delete this ledger transaction? This will instantly recalculate all settlement positions.')}
              </p>
            </div>
            <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmInfo(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const { id, type } = deleteConfirmInfo;
                  if (type === 'expense') {
                    trashRemovedReceipts(expenses.find(e => e.id === id), undefined);
                    onDeleteExpense(id);
                  } else if (type === 'labour') {
                    onDeleteLabour(id);
                  } else {
                    onDeleteRevenue(id);
                  }
                  setDeleteConfirmInfo(null);
                }}
                className="px-5 py-2 text-xs font-extrabold text-white bg-red-600 hover:bg-red-700 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {t('Delete')}
              </button>
            </div>
          </div>
        </Dialog>
      )}

      {toastMessage && (
        <Toast message={toastMessage} onDismiss={() => setToastMessage(null)} />
      )}
    </div>
  );
};
