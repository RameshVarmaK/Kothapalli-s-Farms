/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import type { PayerRow } from '../../utils/payers';
import { Attachment, CommonAllocationType, Member } from '../../types';

export type { PayerRow } from '../../utils/payers';

/** Every field of the quick-entry form (expense, labour and harvest sale),
 * with the setters React hands back. Kept apart from MoneyTab so the tab and
 * the modal can share it without a prop per field. */
export function useMoneyEntryForm(members: Member[]) {
  const [isOpenAddModal, setIsOpenAddModal] = useState(false);
  const [addTab, setAddTab] = useState<'expense' | 'labour' | 'revenue'>('expense');
  const [editingRecordId, setEditingRecordId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  // Form states
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState(members[0]?.id || '');
  // Paid by several partners rather than one.
  const [splitPayers, setSplitPayers] = useState(false);
  const [payerRows, setPayerRows] = useState<PayerRow[]>([]);
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
  const [labourDescription, setLabourDescription] = useState('');
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

  return {
    isOpenAddModal,
    setIsOpenAddModal,
    addTab,
    setAddTab,
    editingRecordId,
    setEditingRecordId,
    formError,
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
  };
}

export type MoneyEntryForm = ReturnType<typeof useMoneyEntryForm>;
