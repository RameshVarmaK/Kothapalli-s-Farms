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
  CommonAllocationType,
  CreditAccount,
  Attachment
} from '../types';
import { Plus, Filter, Trash2, ArrowUpRight, ArrowDownLeft, Users, Receipt, Calendar, Pencil, AlertTriangle, Check } from 'lucide-react';
import { calculateAllocations, allocationDiscrepancy } from '../utils/calculations';
import { AttachmentUploader } from './AttachmentUploader';

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
  onAddExpense: (expense: Expense) => void;
  onEditExpense: (expense: Expense) => void;
  onDeleteExpense: (id: string) => void;
  onAddLabour: (labour: Labour) => void;
  onEditLabour: (labour: Labour) => void;
  onDeleteLabour: (id: string) => void;
  onAddRevenue: (revenue: HarvestRevenue) => void;
  onEditRevenue: (revenue: HarvestRevenue) => void;
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
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'labour' | 'revenue'>('all');
  const [deleteConfirmInfo, setDeleteConfirmInfo] = useState<{
    id: string;
    type: 'expense' | 'labour' | 'revenue';
  } | null>(null);
  const [filterFieldId, setFilterFieldId] = useState<string>('all');
  const [filterMemberId, setFilterMemberId] = useState<string>('all');

  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'expense' | 'labour' | 'revenue'>('expense');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(members[0]?.id || '');
  const [category, setCategory] = useState('');
  const [linkedActivityId, setLinkedActivityId] = useState('');
  const [targetType, setTargetType] = useState<'single' | 'common'>('single');
  const [selectedSeasonId, setSelectedSeasonId] = useState('');

  // Common cost allocations
  const [allocationRule, setAllocationRule] = useState<CommonAllocationType>('equal');
  const [selectedParticipatingSeasons, setSelectedParticipatingSeasons] = useState<string[]>([]);
  const [manualAllocations, setManualAllocations] = useState<{ [key: string]: string }>({});

  // Labour states
  const [workersCount, setWorkersCount] = useState('');
  const [wageRate, setWageRate] = useState('');
  const [labourTotalCost, setLabourTotalCost] = useState('');
  const [labourTargetType, setLabourTargetType] = useState<'single' | 'common'>('single');
  const [labourAllocationRule, setLabourAllocationRule] = useState<CommonAllocationType>('equal');
  const [labourParticipatingSeasons, setLabourParticipatingSeasons] = useState<string[]>([]);
  const [manualLabourAllocations, setManualLabourAllocations] = useState<{ [key: string]: string }>({});

  // Revenue states
  const [revenueCrop, setRevenueCrop] = useState('');
  const [revenueQuantity, setRevenueQuantity] = useState('');
  const [buyerName, setBuyerName] = useState('');

  const [isCredit, setIsCredit] = useState(false);
  const [creditAccountId, setCreditAccountId] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // Compiling transactional ledger timeline
  const ledgerItems: {
    id: string;
    type: 'expense' | 'labour' | 'revenue';
    date: string;
    description: string;
    subtext: string;
    amount: number;
    party: string;
    fieldSeasonName: string;
    rawRecord: any;
  }[] = [];

  const activeSeasons = seasons.filter(s => !s.isClosed);

  // Parse expenses
  expenses.forEach(e => {
    let payer = '';
    if (e.isCredit) {
      const creditor = creditAccounts.find(c => c.id === e.creditAccountId);
      payer = creditor ? `Credit: ${creditor.name}` : 'Credit';
    } else {
      payer = members.find(m => m.id === e.paidByMemberId)?.name || 'Unknown';
    }
    let fieldSeasonName = 'Common / All';
    if (e.targetType === 'single' && e.targetSeasonId) {
      const s = seasons.find(sea => sea.id === e.targetSeasonId);
      const f = fields.find(fd => fd.id === e.targetFieldId);
      fieldSeasonName = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';
    } else if (e.targetType === 'common' && e.allocations) {
      const activeAllocFields = e.allocations.map(al => fields.find(f => f.id === al.fieldId)?.name || '').filter(Boolean);
      fieldSeasonName = `Common Split (${activeAllocFields.join(', ')})`;
    }

    ledgerItems.push({
      id: e.id,
      type: 'expense',
      date: e.date,
      description: e.category,
      subtext: e.isCredit ? payer : `Paid by ${payer}`,
      amount: e.amount,
      party: payer,
      fieldSeasonName,
      rawRecord: e
    });
  });

  // Parse labour
  labours.forEach(l => {
    let payer = '';
    if (l.isCredit) {
      const creditor = creditAccounts.find(c => c.id === l.creditAccountId);
      payer = creditor ? `Credit: ${creditor.name}` : 'Credit';
    } else {
      payer = members.find(m => m.id === l.paidByMemberId)?.name || 'Unknown';
    }
    let fieldSeasonName = 'Common / All';
    if (l.targetType !== 'common' && l.seasonId) {
      const s = seasons.find(sea => sea.id === l.seasonId);
      const f = fields.find(fd => fd.id === l.fieldId);
      fieldSeasonName = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';
    } else if (l.targetType === 'common' && l.allocations) {
      const activeAllocFields = l.allocations.map(al => fields.find(f => f.id === al.fieldId)?.name || '').filter(Boolean);
      fieldSeasonName = `Common Split (${activeAllocFields.join(', ')})`;
    }

    ledgerItems.push({
      id: l.id,
      type: 'labour',
      date: l.date,
      description: `Labour (${l.workersCount} worker(s) at ${currency}${l.wageRate})`,
      subtext: l.isCredit ? payer : `Paid by ${payer}`,
      amount: l.totalCost,
      party: payer,
      fieldSeasonName,
      rawRecord: l
    });
  });

  // Parse revenue
  revenues.forEach(r => {
    const receiver = members.find(m => m.id === r.receivedByMemberId)?.name || 'Unknown';
    const s = seasons.find(sea => sea.id === r.seasonId);
    const f = fields.find(fd => fd.id === r.fieldId);
    const fieldSeasonName = s ? `${s.cropName} (${f ? f.name : ''})` : 'Unknown';

    ledgerItems.push({
      id: r.id,
      type: 'revenue',
      date: r.date,
      description: `Harvest Sale: ${r.crop} (${r.quantity} sold)`,
      subtext: `Received by ${receiver} ${r.buyerName ? `from ${r.buyerName}` : ''}`,
      amount: r.saleAmount,
      party: receiver,
      fieldSeasonName,
      rawRecord: r
    });
  });

  // Filter items
  const filteredLedger = ledgerItems
    .filter(item => {
      const typeMatches = filterType === 'all' || item.type === filterType;
      
      let fieldMatches = true;
      if (filterFieldId !== 'all') {
        const rec = item.rawRecord;
        if (item.type === 'expense') {
          if (rec.targetType === 'single') {
            fieldMatches = rec.targetFieldId === filterFieldId;
          } else {
            fieldMatches = rec.allocations?.some((al: any) => al.fieldId === filterFieldId) || false;
          }
        } else if (item.type === 'labour' && rec.targetType === 'common') {
          fieldMatches = rec.allocations?.some((al: any) => al.fieldId === filterFieldId) || false;
        } else {
          fieldMatches = rec.fieldId === filterFieldId;
        }
      }

      let memberMatches = true;
      if (filterMemberId !== 'all') {
        const rec = item.rawRecord;
        if (item.type === 'expense') {
          memberMatches = rec.paidByMemberId === filterMemberId;
        } else if (item.type === 'labour') {
          memberMatches = rec.paidByMemberId === filterMemberId;
        } else {
          memberMatches = rec.receivedByMemberId === filterMemberId;
        }
      }

      return typeMatches && fieldMatches && memberMatches;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Handle Start Edit
  const handleStartEdit = (rawRecord: any, type: 'expense' | 'labour' | 'revenue') => {
    setEditingRecordId(rawRecord.id);
    setAddTab(type);
    setDate(rawRecord.date);
    setPaidBy(type === 'revenue' ? rawRecord.receivedByMemberId : rawRecord.paidByMemberId);
    setIsCredit(!!rawRecord.isCredit);
    setCreditAccountId(rawRecord.creditAccountId || '');
    
    if (type === 'expense') {
      setAmount(String(rawRecord.amount));
      setCategory(rawRecord.category);
      setLinkedActivityId(rawRecord.linkedActivityId || '');
      setTargetType(rawRecord.targetType);
      setAttachments(rawRecord.attachments || []);
      
      if (rawRecord.targetType === 'single') {
        setSelectedSeasonId(rawRecord.targetSeasonId || '');
      } else {
        setAllocationRule(rawRecord.commonAllocationRule || 'equal');
        setSelectedParticipatingSeasons(rawRecord.allocations?.map((al: any) => al.seasonId) || []);
        
        const initialManual: { [key: string]: string } = {};
        rawRecord.allocations?.forEach((al: any) => {
          initialManual[`${al.fieldId}_${al.seasonId}`] = String(al.amount);
        });
        setManualAllocations(initialManual);
      }
    } else if (type === 'labour') {
      setWorkersCount(String(rawRecord.workersCount));
      setWageRate(String(rawRecord.wageRate));
      setLabourTotalCost(String(rawRecord.totalCost));
      setLinkedActivityId(rawRecord.linkedActivityId || '');
      setLabourTargetType(rawRecord.targetType === 'common' ? 'common' : 'single');

      if (rawRecord.targetType === 'common') {
        setLabourAllocationRule(rawRecord.commonAllocationRule || 'equal');
        setLabourParticipatingSeasons(rawRecord.allocations?.map((al: any) => al.seasonId) || []);

        const initialManual: { [key: string]: string } = {};
        rawRecord.allocations?.forEach((al: any) => {
          initialManual[`${al.fieldId}_${al.seasonId}`] = String(al.amount);
        });
        setManualLabourAllocations(initialManual);
      } else {
        setSelectedSeasonId(rawRecord.seasonId);
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
    // (see tests/run.ts → "manual amounts ignore the total amount argument")
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

    let expensePost: Expense;
    const baseExpense = editingRecordId ? expenses.find(exp => exp.id === editingRecordId) : null;

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
        paidByMemberId: isCredit ? '' : paidBy,
        category,
        linkedActivityId: linkedActivityId || undefined,
        targetType: 'single',
        targetFieldId: season.fieldId,
        targetSeasonId: season.id,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
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
        paidByMemberId: isCredit ? '' : paidBy,
        category,
        linkedActivityId: linkedActivityId || undefined,
        targetType: 'common',
        commonAllocationRule: allocationRule,
        allocations: calculatedAlloc,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined,
        attachments: attachments.length > 0 ? attachments : undefined
      } as Expense;
    }

    if (editingRecordId) {
      onEditExpense(expensePost);
    } else {
      onAddExpense(expensePost);
    }
    closeAndReset();
  };

  const handleSaveLabour = (e: React.FormEvent) => {
    e.preventDefault();
    const count = parseInt(workersCount);
    const rate = parseFloat(wageRate);
    const computedTotal = labourTotalCost ? parseFloat(labourTotalCost) : count * rate;

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
        workersCount: count || 0,
        wageRate: rate || 0,
        totalCost: computedTotal,
        paidByMemberId: isCredit ? '' : paidBy,
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
        workersCount: count || 0,
        wageRate: rate || 0,
        totalCost: computedTotal,
        paidByMemberId: isCredit ? '' : paidBy,
        isCredit,
        creditAccountId: isCredit ? creditAccountId : undefined
      } as Labour;
    }

    if (editingRecordId) {
      onEditLabour(labourPost);
    } else {
      onAddLabour(labourPost);
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
      receivedByMemberId: paidBy
    } as HarvestRevenue;

    if (editingRecordId) {
      onEditRevenue(revenuePost);
    } else {
      onAddRevenue(revenuePost);
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
    setAttachments([]);
    setFormError(null);
  };

  const handleDelete = (id: string, type: 'expense' | 'labour' | 'revenue') => {
    setDeleteConfirmInfo({ id, type });
  };

  // Live allocation preview for the common-expense split — computed here so
  // both the per-season row preview and the running-total summary below stay
  // in sync with what handleSaveExpense will actually write.
  const participatingDetailedPreview = selectedParticipatingSeasons.map(sid => {
    const s = seasons.find(sea => sea.id === sid);
    if (!s) return null;
    return {
      fieldId: s.fieldId,
      seasonId: s.id,
      fieldArea: fields.find(fd => fd.id === s.fieldId)?.area || 1
    };
  }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

  const parsedManualPreview: { [key: string]: number } = {};
  Object.keys(manualAllocations).forEach(k => {
    parsedManualPreview[k] = parseFloat(manualAllocations[k]) || 0;
  });

  const previewAmount = parseFloat(amount) || 0;
  const allocationPreview = targetType === 'common' && participatingDetailedPreview.length > 0
    ? calculateAllocations(previewAmount, allocationRule, participatingDetailedPreview, parsedManualPreview)
    : [];
  const allocationTotal = allocationPreview.reduce((sum, a) => sum + a.amount, 0);
  const allocationDiff = Number((previewAmount - allocationTotal).toFixed(2));

  const allocationRuleHelp: Record<CommonAllocationType, string> = {
    equal: 'Splits the amount into identical shares across every checked field, regardless of size.',
    area: 'Splits the amount in proportion to each field’s registered acreage — bigger fields carry a bigger share.',
    manual: 'You set the exact rupee amount per field yourself. The entries must add up to the total below.'
  };

  // Same live allocation preview, mirrored for the Labour form's common split.
  const labourParticipatingDetailedPreview = labourParticipatingSeasons.map(sid => {
    const s = seasons.find(sea => sea.id === sid);
    if (!s) return null;
    return {
      fieldId: s.fieldId,
      seasonId: s.id,
      fieldArea: fields.find(fd => fd.id === s.fieldId)?.area || 1
    };
  }).filter((v): v is { fieldId: string; seasonId: string; fieldArea: number } => v !== null);

  const parsedManualLabourPreview: { [key: string]: number } = {};
  Object.keys(manualLabourAllocations).forEach(k => {
    parsedManualLabourPreview[k] = parseFloat(manualLabourAllocations[k]) || 0;
  });

  const previewLabourTotal = parseFloat(labourTotalCost) || 0;
  const labourAllocationPreview = labourTargetType === 'common' && labourParticipatingDetailedPreview.length > 0
    ? calculateAllocations(previewLabourTotal, labourAllocationRule, labourParticipatingDetailedPreview, parsedManualLabourPreview)
    : [];
  const labourAllocationTotal = labourAllocationPreview.reduce((sum, a) => sum + a.amount, 0);
  const labourAllocationDiff = Number((previewLabourTotal - labourAllocationTotal).toFixed(2));

  return (
    <div className="space-y-6">
      {/* Search and Filters Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-3 items-center">
          {/* Quick type toggler */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-250">
            {(['all', 'expense', 'labour', 'revenue'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer ${
                  filterType === type ? 'bg-white text-emerald-800 shadow-xs font-bold' : 'text-slate-450 hover:text-slate-800'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Sown Field filter */}
          <select
            value={filterFieldId}
            onChange={e => setFilterFieldId(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-xl px-3.5 py-2.5 font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">📍 All Sown Fields</option>
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
            <option value="all">👤 Funder: All Partners</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Action Quick Add */}
        <button
          onClick={() => {
            setSelectedSeasonId(activeSeasons[0]?.id || '');
            setIsOpenAddModal(true);
          }}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow-xs hover:shadow-md transition-all active:scale-95 cursor-pointer"
        >
          <Plus size={15} />
          <span>+ New Entry</span>
        </button>
      </div>

      {/* Transaction Feed */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Transactional Ledger</h2>
          <span className="text-xs text-slate-450 font-bold bg-slate-100 px-2.5 py-1 rounded-full">{filteredLedger.length} entries matching</span>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredLedger.length === 0 ? (
            ledgerItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                <span className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                  <Receipt size={22} />
                </span>
                <h4 className="font-bold text-slate-800 text-sm mb-1.5">No transactions logged yet</h4>
                <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">
                  Every expense, labour shift, and harvest sale you record shows up here — one running ledger for the whole partnership.
                </p>
                <button
                  onClick={() => {
                    setSelectedSeasonId(activeSeasons[0]?.id || '');
                    setIsOpenAddModal(true);
                  }}
                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
                >
                  <Plus size={14} />
                  Log First Transaction
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-12 px-6">
                <p className="text-slate-500 text-xs font-semibold mb-3">No transactions match the current filters.</p>
                <button
                  onClick={() => {
                    setFilterType('all');
                    setFilterFieldId('all');
                    setFilterMemberId('all');
                  }}
                  className="text-[11px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 px-3 py-1.5 rounded-lg cursor-pointer transition-all"
                >
                  Clear filters
                </button>
              </div>
            )
          ) : (
            filteredLedger.map(item => {
              const isRevenue = item.type === 'revenue';
              return (
                <div key={item.id} className="p-4.5 flex justify-between items-center hover:bg-slate-50/70 transition-colors">
                  <div className="flex gap-4 items-center min-w-0">
                    <span className={`p-3 rounded-xl border ${isRevenue ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-150'}`}>
                      {isRevenue ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate leading-snug">{item.description}</p>
                      <p className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 font-medium">
                        <span className="font-mono">{item.date}</span>
                        <span>•</span>
                        <span className="font-bold text-slate-600 truncate bg-slate-100 px-1.5 py-0.5 rounded">{item.fieldSeasonName}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 ml-4 shrink-0">
                    <div className="text-right">
                      <p className={`text-base font-bold font-mono tracking-tight ${isRevenue ? 'text-emerald-600' : 'text-slate-800'}`}>
                        {isRevenue ? '+' : '-'}{currency}{item.amount.toLocaleString('en-IN')}
                      </p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{item.subtext}</p>
                    </div>
                    <button
                      onClick={() => handleStartEdit(item.rawRecord, item.type)}
                      className="p-2 rounded-lg text-slate-450 hover:text-emerald-600 hover:bg-emerald-50 hover:border hover:border-emerald-100 transition-colors cursor-pointer"
                      title="Edit Record"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.type)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 hover:border hover:border-red-100 transition-colors cursor-pointer"
                      title="Delete Record"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* QUICK ENTRY MODAL */}
      {isOpenAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-155">
            {/* Nav Tabs */}
            <div className="flex border-b border-gray-100 bg-gray-50/50 p-2">
              <button
                type="button"
                disabled={!!editingRecordId}
                onClick={() => setAddTab('expense')}
                className={`flex-1 text-center py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  addTab === 'expense' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                } ${editingRecordId ? 'cursor-not-allowed opacity-50 font-bold' : ''}`}
              >
                {editingRecordId ? 'Edit Cost Expense' : 'Log Cost Expense'}
              </button>
              <button
                type="button"
                disabled={!!editingRecordId}
                onClick={() => setAddTab('labour')}
                className={`flex-1 text-center py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  addTab === 'labour' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                } ${editingRecordId ? 'cursor-not-allowed opacity-50 font-bold' : ''}`}
              >
                {editingRecordId ? 'Edit Farm Labour' : 'Log Farm Labour'}
              </button>
              <button
                type="button"
                disabled={!!editingRecordId}
                onClick={() => setAddTab('revenue')}
                className={`flex-1 text-center py-2.5 rounded-2xl text-xs font-bold transition-all ${
                  addTab === 'revenue' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-400 hover:text-gray-600'
                } ${editingRecordId ? 'cursor-not-allowed opacity-50 font-bold' : ''}`}
              >
                {editingRecordId ? 'Edit Harvest Revenue' : 'Log Harvest Revenue'}
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[10px] flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            {/* EXPENSE FORM */}
            {addTab === 'expense' && (
              <form onSubmit={handleSaveExpense} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Billing Type</label>
                    <select
                      value={isCredit ? 'credit' : 'direct'}
                      onChange={e => {
                        const creditMode = e.target.value === 'credit';
                        setIsCredit(creditMode);
                        if (creditMode && creditAccounts.length > 0 && !creditAccountId) {
                          setCreditAccountId(creditAccounts[0].id);
                        }
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-705 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="direct">Direct Paid by Partner</option>
                      <option value="credit">Hire or Buy on Credit</option>
                    </select>
                  </div>
                </div>

                {isCredit ? (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center justify-between">
                      <span>Select Creditor Profile *</span>
                      <span className="text-[9px] text-amber-600 font-extrabold uppercase">Outstanding Debt</span>
                    </label>
                    <select
                      value={creditAccountId}
                      required
                      onChange={e => setCreditAccountId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-705 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">-- Choose Creditor --</option>
                      {creditAccounts.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                      ))}
                    </select>
                    {creditAccounts.length === 0 && (
                      <p className="text-[10px] text-rose-500 font-extrabold mt-1">
                        ⚠️ Please add a Creditor profile first in the "Credits & Payables" tab.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Payer (Who Paid?)</label>
                    <select
                      value={paidBy}
                      onChange={e => setPaidBy(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Amount ({currency})</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 5000"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Expense category</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Fertilizer batch / Engine repair"
                      value={category}
                      onChange={e => setCategory(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target field scope</label>
                  <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                    <button
                      type="button"
                      onClick={() => setTargetType('single')}
                      className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
                        targetType === 'single' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
                      }`}
                    >
                      Single Crop Cycle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTargetType('common');
                        setSelectedParticipatingSeasons(activeSeasons.map(s => s.id));
                      }}
                      className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
                        targetType === 'common' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
                      }`}
                    >
                      Common Shared Expense
                    </button>
                  </div>
                </div>

                {targetType === 'single' ? (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Crop Cycle Target</label>
                    <select
                      value={selectedSeasonId}
                      required
                      onChange={e => setSelectedSeasonId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      {seasons.map(s => {
                        const f = fields.find(field => field.id === s.fieldId);
                        return (
                          <option key={s.id} value={s.id}>
                            {s.cropName} ({f ? f.name : 'Unknown'}) {s.isClosed ? '• Closed' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Division Rule</span>
                      <select
                        value={allocationRule}
                        onChange={e => setAllocationRule(e.target.value as CommonAllocationType)}
                        className="bg-white border border-gray-100 rounded-lg text-[10px] px-2 py-1"
                      >
                        <option value="equal">Equal Split</option>
                        <option value="area">Area Proportional (Acres)</option>
                        <option value="manual">Manual Specification</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed -mt-1">{allocationRuleHelp[allocationRule]}</p>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Fields Participating</span>
                      {activeSeasons.map(s => {
                        const f = fields.find(field => field.id === s.fieldId)!;
                        const isChecked = selectedParticipatingSeasons.includes(s.id);
                        return (
                          <div key={s.id} className="flex justify-between items-center text-xs">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedParticipatingSeasons(prev => prev.filter(id => id !== s.id));
                                  } else {
                                    setSelectedParticipatingSeasons(prev => [...prev, s.id]);
                                  }
                                }}
                                className="rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="font-semibold text-gray-700">{s.cropName} ({f?.name})</span>
                            </label>
                            {isChecked && (
                              <div className="flex items-center gap-1">
                                {allocationRule === 'manual' ? (
                                  <input
                                    type="number"
                                    placeholder="Rupees"
                                    value={manualAllocations[`${s.fieldId}_${s.id}`] || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setManualAllocations(prev => ({
                                        ...prev,
                                        [`${s.fieldId}_${s.id}`]: val
                                      }));
                                    }}
                                    className="w-20 bg-white border border-gray-100 rounded-md px-1.5 py-0.5 text-right text-[10px]"
                                  />
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-semibold mono-num">
                                    {isChecked && amount ? (
                                      <>
                                        {currency}
                                        {Math.round(allocationPreview.find(al => al.seasonId === s.id)?.amount || 0)}
                                      </>
                                    ) : '-'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Running total — makes the split fully transparent before saving,
                        instead of only failing the manual-rule check on submit. */}
                    {selectedParticipatingSeasons.length > 0 && (
                      <div
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                          !amount
                            ? 'bg-white border-gray-150 text-gray-400'
                            : Math.abs(allocationDiff) <= 0.5
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-amber-50 border-amber-150 text-amber-700'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {amount && (
                            Math.abs(allocationDiff) <= 0.5
                              ? <Check size={12} />
                              : <AlertTriangle size={12} />
                          )}
                          Allocated {currency}{Math.round(allocationTotal)} of {currency}{Math.round(previewAmount)}
                        </span>
                        {amount && Math.abs(allocationDiff) > 0.5 && (
                          <span className="mono-num">
                            {currency}{Math.abs(allocationDiff).toFixed(2)} {allocationDiff > 0 ? 'unallocated' : 'over'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Link to Diary Event (Optional)</label>
                  <select
                    value={linkedActivityId}
                    onChange={e => setLinkedActivityId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  >
                    <option value="">Do not link to activity</option>
                    {activities.filter(a => targetType === 'single' ? a.seasonId === selectedSeasonId : true).map(a => (
                      <option key={a.id} value={a.id}>
                        {a.date} - {a.type} ({a.notes.substring(0, 30)}...)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Receipt / Photo (Optional)</label>
                  <AttachmentUploader attachments={attachments} onAttachmentsChange={setAttachments} />
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                  >
                    {editingRecordId ? 'Save Changes' : 'Add Expense'}
                  </button>
                </div>
              </form>
            )}

            {/* LABOUR FORM */}
            {addTab === 'labour' && (
              <form onSubmit={handleSaveLabour} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Billing Type</label>
                    <select
                      value={isCredit ? 'credit' : 'direct'}
                      onChange={e => {
                        const creditMode = e.target.value === 'credit';
                        setIsCredit(creditMode);
                        if (creditMode && creditAccounts.length > 0 && !creditAccountId) {
                          setCreditAccountId(creditAccounts[0].id);
                        }
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-705 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="direct">Direct Paid by Partner</option>
                      <option value="credit">Hire or Buy on Credit</option>
                    </select>
                  </div>
                </div>

                {isCredit ? (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 flex items-center justify-between">
                      <span>Select Creditor Profile *</span>
                      <span className="text-[9px] text-amber-600 font-extrabold uppercase">Outstanding Debt</span>
                    </label>
                    <select
                      value={creditAccountId}
                      required
                      onChange={e => setCreditAccountId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-705 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="">-- Choose Creditor --</option>
                      {creditAccounts.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.type})</option>
                      ))}
                    </select>
                    {creditAccounts.length === 0 && (
                      <p className="text-[10px] text-rose-500 font-extrabold mt-1">
                        ⚠️ Please add a Creditor profile first in the "Credits & Payables" tab.
                      </p>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Payer (Who Paid?)</label>
                    <select
                      value={paidBy}
                      onChange={e => setPaidBy(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target field scope</label>
                  <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
                    <button
                      type="button"
                      onClick={() => setLabourTargetType('single')}
                      className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
                        labourTargetType === 'single' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
                      }`}
                    >
                      Single Crop Cycle
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLabourTargetType('common');
                        setLabourParticipatingSeasons(activeSeasons.map(s => s.id));
                      }}
                      className={`flex-1 text-center py-1.5 rounded-lg text-xs font-semibold ${
                        labourTargetType === 'common' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-400'
                      }`}
                    >
                      Shared Across Fields
                    </button>
                  </div>
                </div>

                {labourTargetType === 'single' ? (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target Crop Cycle</label>
                    <select
                      value={selectedSeasonId}
                      required
                      onChange={e => setSelectedSeasonId(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      <option value="">Select crop season...</option>
                      {seasons.map(s => {
                        const f = fields.find(field => field.id === s.fieldId);
                        return (
                          <option key={s.id} value={s.id}>
                            {s.cropName} ({f ? f.name : 'Unknown'})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                ) : (
                  <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-gray-500 uppercase">Division Rule</span>
                      <select
                        value={labourAllocationRule}
                        onChange={e => setLabourAllocationRule(e.target.value as CommonAllocationType)}
                        className="bg-white border border-gray-100 rounded-lg text-[10px] px-2 py-1"
                      >
                        <option value="equal">Equal Split</option>
                        <option value="area">Area Proportional (Acres)</option>
                        <option value="manual">Manual Specification</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed -mt-1">{allocationRuleHelp[labourAllocationRule]}</p>

                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-gray-400 uppercase block">Fields Participating</span>
                      {activeSeasons.map(s => {
                        const f = fields.find(field => field.id === s.fieldId)!;
                        const isChecked = labourParticipatingSeasons.includes(s.id);
                        return (
                          <div key={s.id} className="flex justify-between items-center text-xs">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setLabourParticipatingSeasons(prev => prev.filter(id => id !== s.id));
                                  } else {
                                    setLabourParticipatingSeasons(prev => [...prev, s.id]);
                                  }
                                }}
                                className="rounded text-emerald-600 focus:ring-emerald-500"
                              />
                              <span className="font-semibold text-gray-700">{s.cropName} ({f?.name})</span>
                            </label>
                            {isChecked && (
                              <div className="flex items-center gap-1">
                                {labourAllocationRule === 'manual' ? (
                                  <input
                                    type="number"
                                    placeholder="Rupees"
                                    value={manualLabourAllocations[`${s.fieldId}_${s.id}`] || ''}
                                    onChange={e => {
                                      const val = e.target.value;
                                      setManualLabourAllocations(prev => ({
                                        ...prev,
                                        [`${s.fieldId}_${s.id}`]: val
                                      }));
                                    }}
                                    className="w-20 bg-white border border-gray-100 rounded-md px-1.5 py-0.5 text-right text-[10px]"
                                  />
                                ) : (
                                  <span className="text-[10px] text-gray-500 font-semibold mono-num">
                                    {isChecked && labourTotalCost ? (
                                      <>
                                        {currency}
                                        {Math.round(labourAllocationPreview.find(al => al.seasonId === s.id)?.amount || 0)}
                                      </>
                                    ) : '-'}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {labourParticipatingSeasons.length > 0 && (
                      <div
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                          !labourTotalCost
                            ? 'bg-white border-gray-150 text-gray-400'
                            : Math.abs(labourAllocationDiff) <= 0.5
                            ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                            : 'bg-amber-50 border-amber-150 text-amber-700'
                        }`}
                      >
                        <span className="flex items-center gap-1.5">
                          {labourTotalCost && (
                            Math.abs(labourAllocationDiff) <= 0.5
                              ? <Check size={12} />
                              : <AlertTriangle size={12} />
                          )}
                          Allocated {currency}{Math.round(labourAllocationTotal)} of {currency}{Math.round(previewLabourTotal)}
                        </span>
                        {labourTotalCost && Math.abs(labourAllocationDiff) > 0.5 && (
                          <span className="mono-num">
                            {currency}{Math.abs(labourAllocationDiff).toFixed(2)} {labourAllocationDiff > 0 ? 'unallocated' : 'over'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Worker Count</label>
                    <input
                      type="number"
                      placeholder="e.g. 10"
                      value={workersCount}
                      onChange={e => {
                        setWorkersCount(e.target.value);
                        if(wageRate && e.target.value) {
                          setLabourTotalCost(String(parseFloat(wageRate) * parseFloat(e.target.value)));
                        }
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Wage rate / worker ({currency})</label>
                    <input
                      type="number"
                      placeholder="e.g. 400"
                      value={wageRate}
                      onChange={e => {
                        setWageRate(e.target.value);
                        if(workersCount && e.target.value) {
                          setLabourTotalCost(String(parseFloat(workersCount) * parseFloat(e.target.value)));
                        }
                      }}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Lump Total Cost ({currency})</label>
                  <input
                    type="number"
                    required
                    placeholder="Auto-calculated or override lump"
                    value={labourTotalCost}
                    onChange={e => setLabourTotalCost(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  />
                  <p className="text-[9px] text-gray-400 mt-0.5">Overrides standard calculations if different from workers × rate.</p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Link to Diary Event (Optional)</label>
                  <select
                    value={linkedActivityId}
                    onChange={e => setLinkedActivityId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  >
                    <option value="">Do not link to activity</option>
                    {activities.filter(a => labourTargetType === 'single' ? a.seasonId === selectedSeasonId : true).map(a => (
                      <option key={a.id} value={a.id}>
                        {a.date} - {a.type} ({a.notes.substring(0,30)}...)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                  >
                    {editingRecordId ? 'Save Changes' : 'Add Labour Cost'}
                  </button>
                </div>
              </form>
            )}

            {/* REVENUE FORM */}
            {addTab === 'revenue' && (
              <form onSubmit={handleSaveRevenue} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={date}
                      onChange={e => setDate(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Recipient (Who Got Cash?)</label>
                    <select
                      value={paidBy}
                      onChange={e => setPaidBy(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    >
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target Crop Cycle</label>
                  <select
                    value={selectedSeasonId}
                    required
                    onChange={e => setSelectedSeasonId(e.target.value)}
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                  >
                    <option value="">Select crop season...</option>
                    {seasons.map(s => {
                      const f = fields.find(field => field.id === s.fieldId);
                      return (
                        <option key={s.id} value={s.id}>
                          {s.cropName} ({f ? f.name : 'Unknown'})
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sold Commodity/Crop Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Paddy Sona Masuri"
                      value={revenueCrop}
                      onChange={e => setRevenueCrop(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sold Quantity</label>
                    <input
                      type="number"
                      placeholder="e.g. 150 bags / 3 tons"
                      value={revenueQuantity}
                      onChange={e => setRevenueQuantity(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Total Sale Amount ({currency})</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. 150000"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Buyer / Trader Agency Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Balaji Trading Corp"
                      value={buyerName}
                      onChange={e => setBuyerName(e.target.value)}
                      className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-gray-50">
                  <button
                    type="button"
                    onClick={closeAndReset}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                  >
                    {editingRecordId ? 'Save Changes' : 'Add Crop Revenue'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {deleteConfirmInfo && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <AlertTriangle size={24} className="stroke-[2.5]" />
                <h3 className="font-extrabold text-slate-900 text-sm">Delete Transaction</h3>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed font-semibold mt-2">
                Permanently delete this ledger transaction? This will instantly recalculate all settlement positions.
              </p>
            </div>
            <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => setDeleteConfirmInfo(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const { id, type } = deleteConfirmInfo;
                  if (type === 'expense') {
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
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
