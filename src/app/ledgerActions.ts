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
import { sendBulkNotifications } from '../utils/notifications';
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
  setNotificationPreferences
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
    // Validate expense before saving
    if (refuseInvalidMoneyEntry({ kind: 'expense', record: exp })) return false;

    const nextList = [...expenses, exp];
    const newDb = { ...db, expenses: nextList };
    const finalDb = addAuditLog(
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
    if (refuseInvalidMoneyEntry({ kind: 'expense', record: updatedExp })) return false;

    const nextList = expenses.map(e => e.id === updatedExp.id ? updatedExp : e);
    const newDb = { ...db, expenses: nextList };
    const finalDb = addAuditLog(
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
    const nextList = expenses.filter(e => e.id !== id);
    const newDb = { ...db, expenses: nextList };
    if (target) {
      const finalDb = addAuditLog(
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
    // Validate labour before saving
    if (refuseInvalidMoneyEntry({ kind: 'labour', record: lab })) return false;

    const nextList = [...labours, lab];
    const newDb = { ...db, labours: nextList };
    const finalDb = addAuditLog(
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
    if (refuseInvalidMoneyEntry({ kind: 'labour', record: updatedLab })) return false;

    const nextList = labours.map(l => l.id === updatedLab.id ? updatedLab : l);
    const newDb = { ...db, labours: nextList };
    const finalDb = addAuditLog(
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
    const nextList = labours.filter(l => l.id !== id);
    const newDb = { ...db, labours: nextList };
    if (target) {
      const finalDb = addAuditLog(
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
    // Validate revenue before saving
    if (refuseInvalidMoneyEntry({ kind: 'revenue', record: rev })) return false;

    const nextList = [...revenues, rev];
    const newDb = { ...db, revenues: nextList };
    const finalDb = addAuditLog(
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
    if (refuseInvalidMoneyEntry({ kind: 'revenue', record: updatedRev })) return false;

    const nextList = revenues.map(r => r.id === updatedRev.id ? updatedRev : r);
    const newDb = { ...db, revenues: nextList };
    const finalDb = addAuditLog(
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
    const nextList = revenues.filter(r => r.id !== id);
    const newDb = { ...db, revenues: nextList };
    if (target) {
      const finalDb = addAuditLog(
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
    const nextList = [...creditAccounts, acc];
    const newDb = { ...db, creditAccounts: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'CreditAccount' as any,
      acc.id,
      `Registered creditor profile: "${acc.name}" (${acc.type})`
    );
    setDb(finalDb);
  };

  const handleEditCreditAccount = (updatedAcc: CreditAccount) => {
    const nextList = creditAccounts.map(c => c.id === updatedAcc.id ? updatedAcc : c);
    const newDb = { ...db, creditAccounts: nextList };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'CreditAccount' as any,
      updatedAcc.id,
      `Updated creditor profile details: "${updatedAcc.name}" (${updatedAcc.type})`
    );
    setDb(finalDb);
  };

  const handleDeleteCreditAccount = (id: string) => {
    const target = creditAccounts.find(c => c.id === id);
    const nextList = creditAccounts.filter(c => c.id !== id);
    const newDb = { ...db, creditAccounts: nextList };
    if (target) {
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'CreditAccount' as any,
        id,
        `Removed creditor: "${target.name}"`
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ creditAccounts: nextList });
    }
  };

  const handleAddCreditRepayment = (rep: CreditRepayment) => {
    const nextList = [...creditRepayments, rep];
    const newDb = { ...db, creditRepayments: nextList };
    const creditor = creditAccounts.find(c => c.id === rep.creditAccountId);
    const memberName = members.find(m => m.id === rep.memberId)?.name || 'Unknown Partner';
    const finalDb = addAuditLog(
      newDb,
      'create',
      'CreditRepayment' as any,
      rep.id,
      `Paid settlement repayment of ${settings.currency}${rep.amount} to creditor "${creditor ? creditor.name : 'Unknown'}" by partner "${memberName}"`,
      rep.memberId
    );
    setDb(finalDb);
  };

  const handleUpdateCreditRepayment = (updatedRep: CreditRepayment) => {
    const nextList = creditRepayments.map(r => r.id === updatedRep.id ? updatedRep : r);
    const newDb = { ...db, creditRepayments: nextList };
    const creditor = creditAccounts.find(c => c.id === updatedRep.creditAccountId);
    const memberName = members.find(m => m.id === updatedRep.memberId)?.name || 'Unknown Partner';
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'CreditRepayment' as any,
      updatedRep.id,
      `Updated settlement repayment of ${settings.currency}${updatedRep.amount} to creditor "${creditor ? creditor.name : 'Unknown'}" by partner "${memberName}"`,
      updatedRep.memberId
    );
    setDb(finalDb);
  };

  const handleDeleteCreditRepayment = (id: string) => {
    const target = creditRepayments.find(r => r.id === id);
    const nextList = creditRepayments.filter(r => r.id !== id);
    const newDb = { ...db, creditRepayments: nextList };
    if (target) {
      const creditor = creditAccounts.find(c => c.id === target.creditAccountId);
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'CreditRepayment' as any,
        id,
        `Voided repayment of ${settings.currency}${target.amount} to creditor "${creditor ? creditor.name : 'Unknown'}"`,
        target.memberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ creditRepayments: nextList });
    }
  };

  const handleSaveNotificationPreferences = (prefs: NotificationPreferences) => {
    const updated = notificationPreferences.filter(p => p.memberId !== prefs.memberId);
    updated.push(prefs);
    setNotificationPreferences(updated);

    const newDb = { ...db, notificationPreferences: updated };
    setDb(newDb);
  };

  // ACTIONS: Stock Items / Purchases / Usages
  const handleAddStockItem = (item: StockItem) => {
    const nextList = [...stockItems, item];
    const newDb = { ...db, stockItems: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'StockItem',
      item.id,
      `Registered new physical asset ledger category: "${item.name}" measured in "${item.unit}"`
    );
    setDb(finalDb);
  };

  const handleAddPurchase = (purc: StockPurchase) => {
    const nextList = [...purchases, purc];
    const item = stockItems.find(i => i.id === purc.stockItemId);
    const newDb = { ...db, purchases: nextList };
    const finalDb = addAuditLog(
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
    const nextList = stockItems.map(i => i.id === updatedItem.id ? updatedItem : i);
    const newDb = { ...db, stockItems: nextList };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'StockItem',
      updatedItem.id,
      `Updated physical asset ledger category details: "${updatedItem.name}"`
    );
    setDb(finalDb);
  };

  const handleUpdatePurchase = (updatedPurchase: StockPurchase) => {
    const nextList = purchases.map(p => p.id === updatedPurchase.id ? updatedPurchase : p);
    const item = stockItems.find(i => i.id === updatedPurchase.stockItemId);
    const newDb = { ...db, purchases: nextList };
    const finalDb = addAuditLog(
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
    const nextList = [...usages, use];
    const item = stockItems.find(i => i.id === use.stockItemId);
    const newDb = { ...db, usages: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'StockUsage',
      use.id,
      `Consumed physical stock out of stockroom: ${use.quantityUsed} ${item?.unit || ''} of "${item?.name || 'materials'}" as field expense input`
    );
    setDb(finalDb);
  };

  const handleUpdateUsage = (updatedUsage: StockUsage) => {
    const nextList = usages.map(u => u.id === updatedUsage.id ? updatedUsage : u);
    const item = stockItems.find(i => i.id === updatedUsage.stockItemId);
    const newDb = { ...db, usages: nextList };
    const finalDb = addAuditLog(
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
    const finalDb = addAuditLog(
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
    const finalDb = addAuditLog(
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
      title: 'Delete Land Boundary',
      message:
        `Are you sure you want to permanently delete field records for "${target.name}"?\n\n` +
        (dependentCount > 0
          ? `This will also remove:\n` +
            `  - ${affectedSeasons.length} crop season(s)\n` +
            `  - ${labCount} labour entries, ${expSingleCount} field-specific expenses, ` +
            `${usgSingleCount} stock usages\n` +
            `  - ${revCount} harvest revenues and ${actCount} activity log entries\n\n` +
            `Common expenses/usages that include this field's seasons will have those seasons removed from their allocation list.`
          : 'No dependent records were found for this field.'),
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
        const finalDb = addAuditLog(
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
    const finalDb = addAuditLog(
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
    const finalDb = addAuditLog(
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
    const finalDb = addAuditLog(
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
      title: 'Delete Closed Season',
      message:
        `Are you sure you want to permanently delete the completed cropping season: "${target.cropName}"?\n\n` +
        (dependentCount > 0
          ? `This will also remove ${dependentCount} dependent record(s): ${labCount} labour, ` +
            `${expSingleCount} expenses, ${usgSingleCount} usages, ${revCount} revenues, ` +
            `${actCount} activities. Common-allocation entries will have this season unlinked.`
          : 'No dependent records were found for this season.'),
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
        const finalDb = addAuditLog(
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
    const newDb = { ...db, settlementClearances: next };
    const finalDb = addAuditLog(newDb, 'edit', 'Settlement', '', description);
    setDb(finalDb);
  };

  const handleAddActivity = (act: Activity) => {
    const nextList = [...activities, act];
    const newDb = { ...db, activities: nextList };
    const finalDb = addAuditLog(
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
    const nextList = [...members, m];
    const newDb = { ...db, members: nextList };
    const finalDb = addAuditLog(
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
    const nextList = members.map(m => m.id === updatedMember.id ? updatedMember : m);
    const newDb = { ...db, members: nextList };
    const finalDb = addAuditLog(
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
    const target = members.find(m => m.id === id);
    if (!target) return;

    // Pre-flight check: silently deleting a member who is referenced from
    // expenses / labours / revenues / shares would break settlement math,
    // because every paidBy/receivedBy id would now point at a ghost. Refuse
    // and tell the user exactly where the references live so they can clean
    // up (re-assign or delete) first.
    const expRefs = expenses.filter(e => e.paidByMemberId === id).length;
    const labRefs = labours.filter(l => l.paidByMemberId === id).length;
    const revRefs = revenues.filter(r => r.receivedByMemberId === id).length;
    const purRefs = purchases.filter(p => p.paidByMemberId === id).length;
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
      title: 'Delete Member Profile',
      message: `Are you sure you want to permanently delete partner profile for "${target.name}"?`,
      confirmText: 'Delete Member',
      onConfirm: () => {
        const nextList = members.filter(m => m.id !== id);
        const newDb = { ...db, members: nextList };
        const finalDb = addAuditLog(
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
    handleUpdateDatabase({ settings: nextSettings });
  };

  // ACTIONS: Import Backups JSON
  const handleImportDatabase = (nextData: any) => {
    // A backup taken before auto-generated timeline rows were dropped would
    // otherwise restore them.
    handleUpdateDatabase({ ...nextData, activities: stripAutoActivities(nextData.activities || []) });
    handleAudit('edit', 'Database', `Database full restoration performed via custom JSON backup file`);
  };

  const handleAudit = (action: AuditLog['actionType'], type: string, desc: string) => {
    const finalDb = addAuditLog(db, action, type, '', desc);
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
