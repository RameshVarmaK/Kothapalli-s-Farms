/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction } from 'react';
import {
  saveDatabase,
  addAuditLog,
  LocalDatabase,
  stripAutoActivities
} from '../utils/database';
import {
  moneyEntryRejection,
  type MoneyEntry,
  validateFieldShares,
  validateSeasonShares
} from '../utils/validation';
import { logWarning } from '../utils/errorLogging';
import { isNamedPayer, isNamedReceiver } from '../utils/payers';
import { saveSafetyCopy, SAFETY_REASONS } from '../utils/safetyBackup';
import { sendBulkNotifications } from '../utils/notifications';
import { Access, AccessAction, FULL_ACCESS, sharesChanged } from './access';
import {
  Member,
  Field,
  Season,
  Activity,
  Expense,
  Labour,
  StockItem,
  StockPurchase,
  StockUsage,
  HarvestRevenue,
  Settings,
  AuditLog,
  CreditAccount,
  CreditRepayment,
  NotificationPreferences,
  SettlementClearance
} from '../types';

/** The shell's confirm/notice dialog. Actions open it to ask before a
 * destructive change or to say why an entry was refused. */
export interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm: () => void;
}

/** Every collection in `db`, with an empty default for any that is missing. */
export function ledgerCollections(db: LocalDatabase) {
  const {
    members = [],
    fields = [],
    seasons = [],
    expenses = [],
    labours = [],
    revenues = [],
    stockItems = [],
    purchases = [],
    usages = [],
    activities = [],
    settings = { currency: '₹', areaUnit: 'acres', googleDriveLinked: false },
    auditLogs = [],
    creditAccounts = [],
    creditRepayments = [],
    settlementClearances = []
  } = db || {};
  return {
    members,
    fields,
    seasons,
    expenses,
    labours,
    revenues,
    stockItems,
    purchases,
    usages,
    activities,
    settings,
    auditLogs,
    creditAccounts,
    creditRepayments,
    settlementClearances
  };
}

export interface LedgerActionsContext {
  db: LocalDatabase;
  setDb: Dispatch<SetStateAction<LocalDatabase | null>>;
  setConfirmDialog: Dispatch<SetStateAction<ConfirmDialogState | null>>;
  notificationPreferences: NotificationPreferences[];
  setNotificationPreferences: Dispatch<SetStateAction<NotificationPreferences[]>>;
  /** The signed-in partner's permissions; every write is checked here first. */
  access?: Access;
}

/**
 * The add/edit/delete handlers for every ledger collection. Each one writes
 * the change and its audit log entry through setDb; the add and edit
 * handlers the tabs check return false when the entry was refused.
 *
 * Not a hook: AppShell builds these after its early returns, once `db` is
 * loaded, on every render, exactly as it did when they lived inline.
 */
export function createLedgerActions({
  db,
  setDb,
  setConfirmDialog,
  notificationPreferences,
  setNotificationPreferences,
  access = FULL_ACCESS
}: LedgerActionsContext) {
  const {
    members,
    fields,
    seasons,
    expenses,
    labours,
    revenues,
    stockItems,
    purchases,
    usages,
    activities,
    settings,
    creditAccounts,
    creditRepayments
  } = ledgerCollections(db);

  // Every audit entry names the signed-in partner unless the caller names
  // the partner the entry is about (its payer).
  const actorId = access.member?.id;
  const audit = (
    base: LocalDatabase,
    actionType: AuditLog['actionType'],
    entityType: string,
    entityId: string,
    description: string,
    memberId?: string
  ) => addAuditLog(base, actionType, entityType, entityId, description, memberId ?? actorId);

  // The role check behind every handler. Shows why and reports refusal so
  // the caller can stop; the tabs also hide what a partner may not do, but
  // this is where it is actually enforced.
  const refuse = (action: AccessAction): boolean => {
    if (access.can(action)) return false;
    setConfirmDialog({
      isOpen: true,
      title: 'Not allowed',
      message: access.reason(action),
      confirmText: 'OK',
      onConfirm: () => setConfirmDialog(null)
    });
    logWarning('action_refused_by_role', access.reason(action), { action, role: access.role });
    return true;
  };
  const refuseDelete = (payerIds: Array<string | undefined>): boolean => {
    if (access.canDeleteEntry(payerIds)) return false;
    setConfirmDialog({
      isOpen: true,
      title: 'Not allowed',
      message: access.reason('delete-any'),
      confirmText: 'OK',
      onConfirm: () => setConfirmDialog(null)
    });
    return true;
  };
  const payersOf = (entry: { paidByMemberId?: string; payers?: { memberId: string }[] }) =>
    [entry.paidByMemberId, ...(entry.payers || []).map(p => p.memberId)];

  // Persist helper
  const handleUpdateDatabase = (updatedFields: Partial<LocalDatabase>) => {
    const updatedDb = { ...db, ...updatedFields };
    setDb(updatedDb);
    saveDatabase(updatedDb);
  };

  // Shows why a money entry cannot be saved and reports whether it was
  // refused. Add and edit both go through here so they refuse the same things.
  const refuseInvalidMoneyEntry = (entry: MoneyEntry): boolean => {
    const rejection = moneyEntryRejection(entry);
    if (!rejection) return false;
    setConfirmDialog({
      isOpen: true,
      title: rejection.title,
      message: rejection.message,
      confirmText: 'OK',
      onConfirm: () => setConfirmDialog(null)
    });
    logWarning(rejection.logEvent, rejection.message, { [entry.kind]: entry.record });
    return true;
  };

  // ACTIONS: Expenses
  const handleAddExpense = (exp: Expense): boolean => {
    if (refuse('write')) return false;
    // Validate expense before saving
    if (refuseInvalidMoneyEntry({ kind: 'expense', record: exp })) return false;

    const nextList = [...expenses, exp];
    const newDb = { ...db, expenses: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'Expense',
      exp.id,
      `Recorded general cost expense category: "${exp.category}" of ${settings.currency}${exp.amount}`,
      exp.paidByMemberId
    );
    setDb(finalDb);

    // Send notifications to members about new expense
    if (notificationPreferences.length > 0) {
      const targetField = fields.find(f => f.id === exp.targetFieldId);
      sendBulkNotifications(notificationPreferences, {
        memberId: exp.paidByMemberId,
        eventType: 'expense_added',
        data: {
          amount: exp.amount,
          category: exp.category,
          fieldName: targetField?.name || 'Common',
          currency: settings.currency
        }
      }).catch(err => logWarning('notification_send_failed', err.message || ''));
    }
    return true;
  };

  const handleEditExpense = (updatedExp: Expense): boolean => {
    if (refuse('write')) return false;
    if (refuseInvalidMoneyEntry({ kind: 'expense', record: updatedExp })) return false;

    const nextList = expenses.map(e => e.id === updatedExp.id ? updatedExp : e);
    const newDb = { ...db, expenses: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'Expense',
      updatedExp.id,
      `Updated expense charge: "${updatedExp.category}" to ${settings.currency}${updatedExp.amount}`,
      updatedExp.paidByMemberId
    );
    setDb(finalDb);
    return true;
  };

  const handleDeleteExpense = (id: string) => {
    const target = expenses.find(e => e.id === id);
    if (target && refuseDelete(payersOf(target))) return;
    const nextList = expenses.filter(e => e.id !== id);
    const newDb = { ...db, expenses: nextList };
    if (target) {
      const finalDb = audit(
        newDb,
        'delete',
        'Expense',
        id,
        `Deleted expense charge: "${target.category}" valued at ${settings.currency}${target.amount}`,
        target.paidByMemberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ expenses: nextList });
    }
  };

  // ACTIONS: Labour
  const handleAddLabour = (lab: Labour): boolean => {
    if (refuse('write')) return false;
    // Validate labour before saving
    if (refuseInvalidMoneyEntry({ kind: 'labour', record: lab })) return false;

    const nextList = [...labours, lab];
    const newDb = { ...db, labours: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'Labour',
      lab.id,
      `Logged contract worker shift: ${lab.description ? `${lab.description}, ` : ''}${lab.workersCount} people for ${settings.currency}${lab.totalCost}`,
      lab.paidByMemberId
    );
    setDb(finalDb);

    // Send notifications to members about new labour entry
    if (notificationPreferences.length > 0) {
      const targetField = lab.targetType === 'common' ? null : fields.find(f => f.id === lab.fieldId);
      sendBulkNotifications(notificationPreferences, {
        memberId: lab.paidByMemberId,
        eventType: 'labour_logged',
        data: {
          quantity: lab.workersCount,
          description: lab.description,
          fieldName: lab.targetType === 'common' ? 'Multiple fields (shared)' : (targetField?.name || 'Unknown'),
          currency: settings.currency
        }
      }).catch(err => logWarning('notification_send_failed', err.message || ''));
    }
    return true;
  };

  const handleEditLabour = (updatedLab: Labour): boolean => {
    if (refuse('write')) return false;
    if (refuseInvalidMoneyEntry({ kind: 'labour', record: updatedLab })) return false;

    const nextList = labours.map(l => l.id === updatedLab.id ? updatedLab : l);
    const newDb = { ...db, labours: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'Labour',
      updatedLab.id,
      `Updated labour shift: ${updatedLab.description ? `${updatedLab.description}, ` : ''}${updatedLab.workersCount} workers, cost ${settings.currency}${updatedLab.totalCost}`,
      updatedLab.paidByMemberId
    );
    setDb(finalDb);
    return true;
  };

  const handleDeleteLabour = (id: string) => {
    const target = labours.find(l => l.id === id);
    if (target && refuseDelete(payersOf(target))) return;
    const nextList = labours.filter(l => l.id !== id);
    const newDb = { ...db, labours: nextList };
    if (target) {
      const finalDb = audit(
        newDb,
        'delete',
        'Labour',
        id,
        `Removed labour payroll: ${target.description ? `${target.description}, ` : ''}${target.workersCount} workers, cost ${settings.currency}${target.totalCost}`,
        target.paidByMemberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ labours: nextList });
    }
  };

  // ACTIONS: Harvest Sales
  const handleAddRevenue = (rev: HarvestRevenue): boolean => {
    if (refuse('write')) return false;
    // Validate revenue before saving
    if (refuseInvalidMoneyEntry({ kind: 'revenue', record: rev })) return false;

    const nextList = [...revenues, rev];
    const newDb = { ...db, revenues: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'HarvestRevenue',
      rev.id,
      `Logged harvest product sale receipt: "${rev.crop}" of quantity ${rev.quantity} valuing ${settings.currency}${rev.saleAmount}`,
      rev.receivedByMemberId
    );
    setDb(finalDb);

    // Send notifications to members about harvest recorded
    if (notificationPreferences.length > 0) {
      const targetField = fields.find(f => f.id === rev.fieldId);
      sendBulkNotifications(notificationPreferences, {
        memberId: rev.receivedByMemberId,
        eventType: 'harvest_recorded',
        data: {
          cropName: rev.crop,
          quantity: rev.quantity,
          fieldName: targetField?.name || 'Unknown',
          currency: settings.currency
        }
      }).catch(err => logWarning('notification_send_failed', err.message || ''));
    }
    return true;
  };

  const handleEditRevenue = (updatedRev: HarvestRevenue): boolean => {
    if (refuse('write')) return false;
    if (refuseInvalidMoneyEntry({ kind: 'revenue', record: updatedRev })) return false;

    const nextList = revenues.map(r => r.id === updatedRev.id ? updatedRev : r);
    const newDb = { ...db, revenues: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'HarvestRevenue',
      updatedRev.id,
      `Updated harvest product sale receipt: "${updatedRev.crop}" of quantity ${updatedRev.quantity} to ${settings.currency}${updatedRev.saleAmount}`,
      updatedRev.receivedByMemberId
    );
    setDb(finalDb);
    return true;
  };

  const handleDeleteRevenue = (id: string) => {
    const target = revenues.find(r => r.id === id);
    if (target && refuseDelete([target.receivedByMemberId, ...(target.receivers || []).map(r => r.memberId)])) return;
    const nextList = revenues.filter(r => r.id !== id);
    const newDb = { ...db, revenues: nextList };
    if (target) {
      const finalDb = audit(
        newDb,
        'delete',
        'HarvestRevenue',
        id,
        `Excised harvest product receipt: "${target.crop}" of ${settings.currency}${target.saleAmount}`,
        target.receivedByMemberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ revenues: nextList });
    }
  };

  // ACTIONS: Credit Profiles & Repayments
  const handleAddCreditAccount = (acc: CreditAccount) => {
    if (refuse('write')) return;
    const nextList = [...creditAccounts, acc];
    const newDb = { ...db, creditAccounts: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'CreditAccount',
      acc.id,
      `Registered creditor profile: "${acc.name}" (${acc.type})`
    );
    setDb(finalDb);
  };

  const handleEditCreditAccount = (updatedAcc: CreditAccount) => {
    if (refuse('write')) return;
    const nextList = creditAccounts.map(c => c.id === updatedAcc.id ? updatedAcc : c);
    const newDb = { ...db, creditAccounts: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'CreditAccount',
      updatedAcc.id,
      `Updated creditor profile details: "${updatedAcc.name}" (${updatedAcc.type})`
    );
    setDb(finalDb);
  };

  const handleDeleteCreditAccount = (id: string) => {
    if (refuse('delete-any')) return;
    const target = creditAccounts.find(c => c.id === id);
    const nextList = creditAccounts.filter(c => c.id !== id);
    if (!target) {
      handleUpdateDatabase({ creditAccounts: nextList });
      return;
    }
    const doDelete = () => {
      setDb(audit({ ...db, creditAccounts: nextList }, 'delete', 'CreditAccount', id, `Removed creditor: "${target.name}"`));
      setConfirmDialog(null);
    };
    const bills = [
      ...expenses.filter(e => e.isCredit && e.creditAccountId === id).map(e => e.amount),
      ...labours.filter(l => l.isCredit && l.creditAccountId === id).map(l => l.totalCost),
    ];
    const repayments = creditRepayments.filter(r => r.creditAccountId === id);
    const billTotal = bills.reduce((s, a) => s + a, 0);
    const repaidTotal = repayments.reduce((s, r) => s + r.amount, 0);
    const money = (v: number) => `${settings.currency}${Math.round(v).toLocaleString('en-IN')}`;
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Creditor',
      message:
        `Remove creditor "${target.name}" (${target.type})?\n\n` +
        (bills.length + repayments.length > 0
          ? `${bills.length} bill(s) totalling ${money(billTotal)} and ${repayments.length} repayment(s) totalling ${money(repaidTotal)} stay in the ledger but lose their link to this creditor, so what is still owed to them can no longer be tracked here. Partners' balances do not change.\n\n`
          : 'No bills or repayments are linked to this creditor.\n\n') +
        'The Google Sheet is updated on the next sync. There is no undo.',
      confirmText: 'Delete Creditor',
      onConfirm: doDelete,
    });
  };

  const handleAddCreditRepayment = (rep: CreditRepayment) => {
    if (refuse('write')) return;
    const nextList = [...creditRepayments, rep];
    const newDb = { ...db, creditRepayments: nextList };
    const creditor = creditAccounts.find(c => c.id === rep.creditAccountId);
    const memberName = members.find(m => m.id === rep.memberId)?.name || 'Unknown Partner';
    const finalDb = audit(
      newDb,
      'create',
      'CreditRepayment',
      rep.id,
      `Paid settlement repayment of ${settings.currency}${rep.amount} to creditor "${creditor ? creditor.name : 'Unknown'}" by partner "${memberName}"`,
      rep.memberId
    );
    setDb(finalDb);
  };

  const handleUpdateCreditRepayment = (updatedRep: CreditRepayment) => {
    if (refuse('write')) return;
    const nextList = creditRepayments.map(r => r.id === updatedRep.id ? updatedRep : r);
    const newDb = { ...db, creditRepayments: nextList };
    const creditor = creditAccounts.find(c => c.id === updatedRep.creditAccountId);
    const memberName = members.find(m => m.id === updatedRep.memberId)?.name || 'Unknown Partner';
    const finalDb = audit(
      newDb,
      'edit',
      'CreditRepayment',
      updatedRep.id,
      `Updated settlement repayment of ${settings.currency}${updatedRep.amount} to creditor "${creditor ? creditor.name : 'Unknown'}" by partner "${memberName}"`,
      updatedRep.memberId
    );
    setDb(finalDb);
  };

  const handleDeleteCreditRepayment = (id: string) => {
    const target = creditRepayments.find(r => r.id === id);
    if (target && refuseDelete([target.memberId])) return;
    const nextList = creditRepayments.filter(r => r.id !== id);
    if (!target) {
      handleUpdateDatabase({ creditRepayments: nextList });
      return;
    }
    const creditor = creditAccounts.find(c => c.id === target.creditAccountId);
    const payer = members.find(m => m.id === target.memberId)?.name || 'Unknown partner';
    const money = `${settings.currency}${Math.round(target.amount).toLocaleString('en-IN')}`;
    setConfirmDialog({
      isOpen: true,
      title: 'Delete Repayment',
      message:
        `Delete the ${money} payment by ${payer} to "${creditor ? creditor.name : 'Unknown'}" on ${target.date}?\n\n` +
        `What is owed to ${creditor ? creditor.name : 'the creditor'} goes up by ${money}, and ${payer}'s paid-in goes down by ${money}, which moves every partner's balance in the cycles that bill belongs to. ` +
        'The Google Sheet is updated on the next sync. There is no undo.',
      confirmText: 'Delete Repayment',
      onConfirm: () => {
        setDb(audit(
          { ...db, creditRepayments: nextList },
          'delete',
          'CreditRepayment',
          id,
          `Voided repayment of ${settings.currency}${target.amount} to creditor "${creditor ? creditor.name : 'Unknown'}"`,
          target.memberId
        ));
        setConfirmDialog(null);
      },
    });
  };

  const handleSaveNotificationPreferences = (prefs: NotificationPreferences) => {
    if (refuse('write')) return;
    const updated = notificationPreferences.filter(p => p.memberId !== prefs.memberId);
    updated.push(prefs);
    setNotificationPreferences(updated);

    const newDb = { ...db, notificationPreferences: updated };
    setDb(newDb);
  };

  // ACTIONS: Stock Items / Purchases / Usages
  const handleAddStockItem = (item: StockItem) => {
    if (refuse('write')) return;
    const nextList = [...stockItems, item];
    const newDb = { ...db, stockItems: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'StockItem',
      item.id,
      `Registered new physical asset ledger category: "${item.name}" measured in "${item.unit}"`
    );
    setDb(finalDb);
  };

  const handleAddPurchase = (purc: StockPurchase) => {
    if (refuse('write')) return;
    const nextList = [...purchases, purc];
    const item = stockItems.find(i => i.id === purc.stockItemId);
    const newDb = { ...db, purchases: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'StockPurchase',
      purc.id,
      `Purchased physical stock replenishment: ${purc.quantity} ${item?.unit || ''} of "${item?.name || 'materials'}" for total ${settings.currency}${purc.totalCost}`,
      purc.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleUpdateStockItem = (updatedItem: StockItem) => {
    if (refuse('write')) return;
    const nextList = stockItems.map(i => i.id === updatedItem.id ? updatedItem : i);
    const newDb = { ...db, stockItems: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'StockItem',
      updatedItem.id,
      `Updated physical asset ledger category details: "${updatedItem.name}"`
    );
    setDb(finalDb);
  };

  const handleUpdatePurchase = (updatedPurchase: StockPurchase) => {
    if (refuse('write')) return;
    const nextList = purchases.map(p => p.id === updatedPurchase.id ? updatedPurchase : p);
    const item = stockItems.find(i => i.id === updatedPurchase.stockItemId);
    const newDb = { ...db, purchases: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'StockPurchase',
      updatedPurchase.id,
      `Updated stock replenishment record: ${updatedPurchase.quantity} ${item?.unit || ''} of "${item?.name || 'materials'}" for total ${settings.currency}${updatedPurchase.totalCost}`,
      updatedPurchase.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleAddUsage = (use: StockUsage) => {
    if (refuse('write')) return;
    const nextList = [...usages, use];
    const item = stockItems.find(i => i.id === use.stockItemId);
    const newDb = { ...db, usages: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'StockUsage',
      use.id,
      `Consumed physical stock out of stockroom: ${use.quantityUsed} ${item?.unit || ''} of "${item?.name || 'materials'}" as field expense input`
    );
    setDb(finalDb);
  };

  const handleUpdateUsage = (updatedUsage: StockUsage) => {
    if (refuse('write')) return;
    const nextList = usages.map(u => u.id === updatedUsage.id ? updatedUsage : u);
    const item = stockItems.find(i => i.id === updatedUsage.stockItemId);
    const newDb = { ...db, usages: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'StockUsage',
      updatedUsage.id,
      `Updated stock usage record: ${updatedUsage.quantityUsed} ${item?.unit || ''} of "${item?.name || 'materials'}"`
    );
    setDb(finalDb);
  };

  // ACTIONS: Field Plots
  const handleAddField = (field: Field): boolean => {
    if (refuse('write')) return false;
    // Validate field shares sum to 100%
    const validation = validateFieldShares(field);
    if (!validation.valid) {
      setConfirmDialog({
        isOpen: true,
        title: 'Invalid Field Shares',
        message: validation.error || 'Field shares must sum to 100%',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog(null)
      });
      logWarning('field_validation_failed', validation.error || 'Invalid field shares', { field });
      return false;
    }

    const nextList = [...fields, field];
    const newDb = { ...db, fields: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'Field',
      field.id,
      `Registered land tract: "${field.name}" size ${field.area} ${settings.areaUnit}`
    );
    setDb(finalDb);
    return true;
  };

  const handleUpdateField = (updatedField: Field): boolean => {
    if (refuse('write')) return false;
    const before = fields.find(x => x.id === updatedField.id);
    if (before && sharesChanged(before.shares, updatedField.shares) && refuse('manage-shares')) return false;
    const validation = validateFieldShares(updatedField);
    if (!validation.valid) {
      setConfirmDialog({
        isOpen: true,
        title: 'Invalid Field Shares',
        message: validation.error || 'Field shares must sum to 100%',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog(null)
      });
      logWarning('field_validation_failed', validation.error || 'Invalid field shares', { field: updatedField });
      return false;
    }

    const nextList = fields.map(f => f.id === updatedField.id ? updatedField : f);
    const newDb = { ...db, fields: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'Field',
      updatedField.id,
      `Updated land tract ownership/details: "${updatedField.name}"`
    );
    setDb(finalDb);
    return true;
  };

  const handleDeleteField = (id: string) => {
    if (refuse('delete-any')) return;
    const target = fields.find(f => f.id === id);
    if (!target) return;

    // Pre-compute the dependent records so we can tell the user up-front
    // exactly what will be lost. Previously a field could be deleted while
    // its seasons / labour / expenses / usages / revenues continued to
    // reference the now-missing fieldId, leaving orphan rows.
    const affectedSeasons = seasons.filter(s => s.fieldId === id).map(s => s.id);
    const isAffectedSeason = (sid?: string | null) => !!sid && affectedSeasons.includes(sid);

    const labCount = labours.filter(
      l => l.targetType !== 'common' && (l.fieldId === id || isAffectedSeason(l.seasonId)),
    ).length;
    const expSingleCount = expenses.filter(
      e => e.targetType === 'single' && (e.targetFieldId === id || isAffectedSeason(e.targetSeasonId)),
    ).length;
    const usgSingleCount = usages.filter(
      u => u.targetType === 'single' && (u.targetFieldId === id || isAffectedSeason(u.targetSeasonId)),
    ).length;
    const revCount = revenues.filter(r => r.fieldId === id || isAffectedSeason(r.seasonId)).length;
    const actCount = activities.filter(a => a.fieldId === id || isAffectedSeason(a.seasonId)).length;

    const dependentCount = labCount + expSingleCount + usgSingleCount + revCount + actCount + affectedSeasons.length;

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Field',
      message:
        `Delete the field "${target.name}" (${target.area} ${settings.areaUnit})?\n\n` +
        (dependentCount > 0
          ? `This also deletes:\n` +
            `  - ${affectedSeasons.length} crop season(s)\n` +
            `  - ${labCount} labour entries, ${expSingleCount} field-specific expenses, ` +
            `${usgSingleCount} stock usages\n` +
            `  - ${revCount} harvest sales and ${actCount} activity log entries\n\n` +
            `Shared expenses and stock usages that were split across this field's seasons lose those seasons from their split, so their cost falls on the remaining seasons. ` +
            `Every partner's balance is recalculated, and anything already settled on these seasons is no longer shown.\n\n`
          : 'No entries are linked to this field.\n\n') +
        'The Google Sheet is updated on the next sync. There is no undo.',
      confirmText: 'Delete Field & Dependents',
      onConfirm: () => {
        const nextFields = fields.filter(f => f.id !== id);
        const nextSeasons = seasons.filter(s => s.fieldId !== id);
        const nextRevenues = revenues.filter(r => r.fieldId !== id && !isAffectedSeason(r.seasonId));
        const nextActivities = activities.filter(a => a.fieldId !== id && !isAffectedSeason(a.seasonId));

        // Labour follows the same single-vs-common split as expenses/usages below.
        const nextLabours = labours
          .filter(l => !(l.targetType !== 'common' && (l.fieldId === id || isAffectedSeason(l.seasonId))))
          .map(l => {
            if (l.targetType === 'common' && l.allocations) {
              const remaining = l.allocations.filter(al => al.fieldId !== id && !isAffectedSeason(al.seasonId));
              return { ...l, allocations: remaining };
            }
            return l;
          })
          .filter(l => !(l.targetType === 'common' && (l.allocations || []).length === 0));

        // For expenses & usages, drop "single" rows that target this field, and
        // strip the dead field's/seasons' entries out of "common" rows'
        // allocation lists. If a common row ends up with no remaining
        // allocations it is dropped entirely. This used to read/write a
        // `commonTargetSeasonIds` field that was never actually populated
        // anywhere (allocations are stored under `allocations`), which meant
        // this filter always evaluated "no remaining seasons" and silently
        // deleted EVERY common expense/usage in the database on any field or
        // season deletion — fixed to operate on the real `allocations` array.
        const nextExpenses = expenses
          .filter(e => !(e.targetType === 'single' && (e.targetFieldId === id || isAffectedSeason(e.targetSeasonId))))
          .map(e => {
            if (e.targetType === 'common' && e.allocations) {
              const remaining = e.allocations.filter(al => al.fieldId !== id && !isAffectedSeason(al.seasonId));
              return { ...e, allocations: remaining };
            }
            return e;
          })
          .filter(e => !(e.targetType === 'common' && (e.allocations || []).length === 0));

        const nextUsages = usages
          .filter(u => !(u.targetType === 'single' && (u.targetFieldId === id || isAffectedSeason(u.targetSeasonId))))
          .map(u => {
            if (u.targetType === 'common' && u.allocations) {
              const remaining = u.allocations.filter(al => al.fieldId !== id && !isAffectedSeason(al.seasonId));
              return { ...u, allocations: remaining };
            }
            return u;
          })
          .filter(u => !(u.targetType === 'common' && (u.allocations || []).length === 0));

        const newDb = {
          ...db,
          fields: nextFields,
          seasons: nextSeasons,
          labours: nextLabours,
          revenues: nextRevenues,
          activities: nextActivities,
          expenses: nextExpenses,
          usages: nextUsages,
        };
        const finalDb = audit(
          newDb,
          'delete',
          'Field',
          id,
          `Removed boundary "${target.name}" and ${dependentCount} dependent record(s)`,
        );
        setDb(finalDb);
        setConfirmDialog(null);
      },
    });
  };

  // ACTIONS: Season Crop Cycles
  const handleAddSeason = (season: Season): boolean => {
    if (refuse('write')) return false;
    // Validate season shares sum to 100% if season-specific
    const validation = validateSeasonShares(season);
    if (!validation.valid) {
      setConfirmDialog({
        isOpen: true,
        title: 'Invalid Season Shares',
        message: validation.error || 'Season shares must sum to 100%',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog(null)
      });
      logWarning('season_validation_failed', validation.error || 'Invalid season shares', { season });
      return false;
    }

    const nextList = [...seasons, season];
    const firstAct: Activity = {
      id: `act_init_${Date.now()}`,
      fieldId: season.fieldId,
      seasonId: season.id,
      date: season.startDate,
      type: 'Sowing',
      notes: `Registered and started crop season cycle: Sowed "${season.cropName}". Initial soil preparations accomplished.`
    };

    const newDb = { ...db, seasons: nextList, activities: [...activities, firstAct] };
    const finalDb = audit(
      newDb,
      'create',
      'Season',
      season.id,
      `Created and sowed cropping cycle: "${season.cropName}"`
    );
    setDb(finalDb);
    return true;
  };

  const handleUpdateSeason = (updatedSeason: Season): boolean => {
    if (refuse('write')) return false;
    const before = seasons.find(x => x.id === updatedSeason.id);
    if (before && sharesChanged(before.shares, updatedSeason.shares) && refuse('manage-shares')) return false;
    const validation = validateSeasonShares(updatedSeason);
    if (!validation.valid) {
      setConfirmDialog({
        isOpen: true,
        title: 'Invalid Season Shares',
        message: validation.error || 'Season shares must sum to 100%',
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog(null)
      });
      logWarning('season_validation_failed', validation.error || 'Invalid season shares', { season: updatedSeason });
      return false;
    }

    const nextList = seasons.map(s => s.id === updatedSeason.id ? updatedSeason : s);
    const newDb = { ...db, seasons: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'Season',
      updatedSeason.id,
      `Updated cropping cycle ownership/details: "${updatedSeason.cropName}"`
    );
    setDb(finalDb);
    return true;
  };

  const handleCloseSeason = (id: string, endDate: string): boolean => {
    if (refuse('close-season')) return false;
    const nextList = seasons.map(s => s.id === id ? { ...s, isClosed: true, endDate } : s);
    const target = seasons.find(s => s.id === id);
    if (!target) return false;

    const harvestAct: Activity = {
      id: `act_harvest_${Date.now()}`,
      fieldId: target.fieldId,
      seasonId: id,
      date: endDate,
      type: 'Harvesting',
      notes: `Crop successfully harvested and cropping season closed on database. Preparing balance ledger metrics.`
    };

    const newDb = { ...db, seasons: nextList, activities: [...activities, harvestAct] };
    const finalDb = audit(
      newDb,
      'edit',
      'Season',
      id,
      `Closed cropping cycle crop season: "${target.cropName}" marked harvested`
    );
    setDb(finalDb);
    return true;
  };

  const handleDeleteSeason = (id: string) => {
    if (refuse('delete-any')) return;
    const target = seasons.find(s => s.id === id);
    if (!target) return;

    const labCount = labours.filter(l => l.targetType !== 'common' && l.seasonId === id).length;
    const expSingleCount = expenses.filter(e => e.targetType === 'single' && e.targetSeasonId === id).length;
    const usgSingleCount = usages.filter(u => u.targetType === 'single' && u.targetSeasonId === id).length;
    const revCount = revenues.filter(r => r.seasonId === id).length;
    const actCount = activities.filter(a => a.seasonId === id).length;
    const dependentCount = labCount + expSingleCount + usgSingleCount + revCount + actCount;

    setConfirmDialog({
      isOpen: true,
      title: target.isClosed ? 'Delete Closed Season' : 'Delete Season',
      message:
        `Delete the ${target.isClosed ? 'closed' : 'active'} "${target.cropName}" season on ${fields.find(f => f.id === target.fieldId)?.name || 'this field'}?\n\n` +
        (dependentCount > 0
          ? `This also deletes ${dependentCount} entries: ${labCount} labour, ` +
            `${expSingleCount} expenses, ${usgSingleCount} stock usages, ${revCount} harvest sales, ` +
            `${actCount} activities. Shared expenses split across this season lose it from their split, so their cost falls on the other seasons. ` +
            `Every partner's balance is recalculated, and anything already settled on this season is no longer shown.\n\n`
          : 'No entries are linked to this season.\n\n') +
        'The Google Sheet is updated on the next sync. There is no undo.',
      confirmText: 'Delete Season & Dependents',
      onConfirm: () => {
        const nextSeasons = seasons.filter(s => s.id !== id);
        const nextRevenues = revenues.filter(r => r.seasonId !== id);
        const nextActivities = activities.filter(a => a.seasonId !== id);

        const nextLabours = labours
          .filter(l => !(l.targetType !== 'common' && l.seasonId === id))
          .map(l => {
            if (l.targetType === 'common' && l.allocations) {
              return { ...l, allocations: l.allocations.filter(al => al.seasonId !== id) };
            }
            return l;
          })
          .filter(l => !(l.targetType === 'common' && (l.allocations || []).length === 0));

        // See handleDeleteField for why this operates on `allocations`
        // rather than the never-populated `commonTargetSeasonIds`.
        const nextExpenses = expenses
          .filter(e => !(e.targetType === 'single' && e.targetSeasonId === id))
          .map(e => {
            if (e.targetType === 'common' && e.allocations) {
              return { ...e, allocations: e.allocations.filter(al => al.seasonId !== id) };
            }
            return e;
          })
          .filter(e => !(e.targetType === 'common' && (e.allocations || []).length === 0));

        const nextUsages = usages
          .filter(u => !(u.targetType === 'single' && u.targetSeasonId === id))
          .map(u => {
            if (u.targetType === 'common' && u.allocations) {
              return { ...u, allocations: u.allocations.filter(al => al.seasonId !== id) };
            }
            return u;
          })
          .filter(u => !(u.targetType === 'common' && (u.allocations || []).length === 0));

        const newDb = {
          ...db,
          seasons: nextSeasons,
          labours: nextLabours,
          revenues: nextRevenues,
          activities: nextActivities,
          expenses: nextExpenses,
          usages: nextUsages,
        };
        const finalDb = audit(
          newDb,
          'delete',
          'Season',
          id,
          `Deleted season "${target.cropName}" and ${dependentCount} dependent record(s)`,
        );
        setDb(finalDb);
        setConfirmDialog(null);
      },
    });
  };

  // ACTIONS: Settlement clearances ("Mark Transferred" in the Settle tab)
  const handleUpdateClearances = (next: SettlementClearance[], description: string) => {
    if (refuse('settle')) return;
    const newDb = { ...db, settlementClearances: next };
    const finalDb = audit(newDb, 'edit', 'Settlement', '', description);
    setDb(finalDb);
  };

  const handleAddActivity = (act: Activity) => {
    if (refuse('write')) return;
    const nextList = [...activities, act];
    const newDb = { ...db, activities: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'Activity',
      act.id,
      `Manually logged activity: "${act.type}" - "${act.notes.slice(0, 40)}..."`
    );
    setDb(finalDb);
  };

  // ACTIONS: Partners
  const handleAddMember = (m: Member): boolean => {
    if (refuse('manage-members')) return false;
    const nextList = [...members, m];
    const newDb = { ...db, members: nextList };
    const finalDb = audit(
      newDb,
      'create',
      'Member',
      m.id,
      `Registered partner stakeholder: "${m.name}"`
    );
    setDb(finalDb);
    return true;
  };

  const handleUpdateMember = (updatedMember: Member): boolean => {
    // Owner-only, including a partner's own name and phone: the Members tab
    // is protected in the sheet once roles are in use, so an editor's change
    // there could never be saved.
    if (refuse('manage-members')) return false;
    const nextList = members.map(m => m.id === updatedMember.id ? updatedMember : m);
    const newDb = { ...db, members: nextList };
    const finalDb = audit(
      newDb,
      'edit',
      'Member',
      updatedMember.id,
      `Updated partner stakeholder details: "${updatedMember.name}"`
    );
    setDb(finalDb);
    return true;
  };

  const handleDeleteMember = (id: string) => {
    if (refuse('manage-members')) return;
    const target = members.find(m => m.id === id);
    if (!target) return;

    // Pre-flight check: silently deleting a member who is referenced from
    // expenses / labours / revenues / shares would break settlement math,
    // because every paidBy/receivedBy id would now point at a ghost. Refuse
    // and tell the user exactly where the references live so they can clean
    // up (re-assign or delete) first.
    const expRefs = expenses.filter(e => isNamedPayer(e, id)).length;
    const labRefs = labours.filter(l => isNamedPayer(l, id)).length;
    const revRefs = revenues.filter(r => isNamedReceiver(r, id)).length;
    const purRefs = purchases.filter(p => isNamedPayer(p, id)).length;
    const repRefs = creditRepayments.filter(r => r.memberId === id).length;
    const fieldRefs = fields.filter(f => (f.shares || []).some(sh => sh.memberId === id)).length;
    const seasonRefs = seasons.filter(
      s => (s.shares || []).some(sh => sh.memberId === id),
    ).length;
    const totalRefs = expRefs + labRefs + revRefs + purRefs + repRefs + fieldRefs + seasonRefs;

    if (totalRefs > 0) {
      setConfirmDialog({
        isOpen: true,
        title: 'Cannot Delete Partner',
        message:
          `"${target.name}" is still referenced by ${totalRefs} record(s):\n\n` +
          `  - ${expRefs} expense(s), ${labRefs} labour entries, ${revRefs} revenue receipts\n` +
          `  - ${purRefs} stock purchases, ${repRefs} credit repayments\n` +
          `  - ${fieldRefs} field share allocation(s), ${seasonRefs} season override(s)\n\n` +
          `Re-assign or delete these dependents first, then try again. This keeps your settlement ledger consistent.`,
        confirmText: 'OK',
        onConfirm: () => setConfirmDialog(null),
      });
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Partner',
      message:
        `Remove "${target.name}" from the partners?\n\n` +
        `They are on no entry and hold no share, so no balance changes. Their notification preferences are removed, and their sign-in${target.email ? ` (${target.email})` : ''} no longer opens this ledger. ` +
        'The Google Sheet is updated on the next sync. There is no undo.',
      confirmText: 'Delete Member',
      onConfirm: () => {
        const nextList = members.filter(m => m.id !== id);
        const newDb = { ...db, members: nextList };
        const finalDb = audit(
          newDb,
          'delete',
          'Member',
          id,
          `Expelled partner record: "${target.name}"`,
        );
        setDb(finalDb);
        setConfirmDialog(null);
      },
    });
  };

  // ACTIONS: Preferences
  const handleSaveSettings = (nextSettings: Settings) => {
    if (refuse('write')) return;
    handleUpdateDatabase({ settings: nextSettings });
  };

  // ACTIONS: Import Backups JSON
  const handleImportDatabase = (nextData: any) => {
    if (refuse('restore')) return;
    saveSafetyCopy(SAFETY_REASONS.deviceBeforeRestore, db);
    // A backup taken before auto-generated timeline rows were dropped would
    // otherwise restore them.
    handleUpdateDatabase({ ...nextData, activities: stripAutoActivities(nextData.activities || []) });
    handleAudit('edit', 'Database', `Database full restoration performed via custom JSON backup file`);
  };

  const handleAudit = (action: AuditLog['actionType'], type: string, desc: string) => {
    const finalDb = audit(db, action, type, '', desc);
    setDb(finalDb);
  };

  return {
    handleAddExpense,
    handleEditExpense,
    handleDeleteExpense,
    handleAddLabour,
    handleEditLabour,
    handleDeleteLabour,
    handleAddRevenue,
    handleEditRevenue,
    handleDeleteRevenue,
    handleAddCreditAccount,
    handleEditCreditAccount,
    handleDeleteCreditAccount,
    handleAddCreditRepayment,
    handleUpdateCreditRepayment,
    handleDeleteCreditRepayment,
    handleSaveNotificationPreferences,
    handleAddStockItem,
    handleAddPurchase,
    handleUpdateStockItem,
    handleUpdatePurchase,
    handleAddUsage,
    handleUpdateUsage,
    handleAddField,
    handleUpdateField,
    handleDeleteField,
    handleAddSeason,
    handleUpdateSeason,
    handleCloseSeason,
    handleDeleteSeason,
    handleUpdateClearances,
    handleAddActivity,
    handleAddMember,
    handleUpdateMember,
    handleDeleteMember,
    handleSaveSettings,
    handleImportDatabase
  };
}
