/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  AuditLog,
  Settings,
  CreditAccount,
  CreditRepayment,
  NotificationPreferences,
  NotificationDelivery,
  SettlementClearance
} from '../types';
import { saveDatabaseHybrid, loadDatabaseHybrid } from './storage';

export interface LocalDatabase {
  members: Member[];
  fields: Field[];
  seasons: Season[];
  activities: Activity[];
  expenses: Expense[];
  labours: Labour[];
  stockItems: StockItem[];
  purchases: StockPurchase[];
  usages: StockUsage[];
  revenues: HarvestRevenue[];
  auditLogs: AuditLog[];
  settings: Settings;
  creditAccounts?: CreditAccount[];
  creditRepayments?: CreditRepayment[];
  notificationPreferences?: NotificationPreferences[];
  notificationDeliveries?: NotificationDelivery[];
  settlementClearances?: SettlementClearance[];
}

/**
 * Every record collection on LocalDatabase, in one place.
 *
 * Hand-maintained copies of this list drifted apart more than once: season
 * shares never reached the Sheets push, and a conflict "merge" silently
 * dropped notification preferences because they were missing from its table
 * list. Code that walks the collections generically reads them from here, and
 * a test asserts this list still matches the interface.
 */
export const DATABASE_COLLECTIONS = [
  'members',
  'fields',
  'seasons',
  'activities',
  'expenses',
  'labours',
  'stockItems',
  'purchases',
  'usages',
  'revenues',
  'auditLogs',
  'creditAccounts',
  'creditRepayments',
  'notificationPreferences',
  'notificationDeliveries',
  'settlementClearances'
] as const;

export type DatabaseCollection = typeof DATABASE_COLLECTIONS[number];

const STORAGE_KEY = 'farm_ledger_database';

/**
 * Placeholder spreadsheet ID baked into the legacy settings. Treated as
 * "no real spreadsheet linked yet" by the auto-fetch and sync code paths.
 * Keep in sync with the default in `SettingsTab.tsx`.
 */
export const PLACEHOLDER_SPREADSHEET_ID = '1r820DlxdJEOZTYhh1DxGXdyv121d6isnFXix-n_C-Ts';

export function isPlaceholderSpreadsheetId(id: string | undefined | null): boolean {
  return !id || id === PLACEHOLDER_SPREADSHEET_ID;
}

/**
 * Safe wrappers around the localStorage API. localStorage can throw in
 * Safari private mode, when the user has site-data disabled, or when
 * storage is full. The original code only wrapped *some* call sites; these
 * helpers consolidate the protection.
 */
export function safeStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (e) {
    console.warn(`safeStorageGet(${key}) failed:`, e);
    return null;
  }
}

export function safeStorageSet(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    console.warn(`safeStorageSet(${key}) failed:`, e);
    return false;
  }
}

export function safeStorageRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (e) {
    console.warn(`safeStorageRemove(${key}) failed:`, e);
  }
}

/**
 * Expenses, labour, sales and stock usage used to mirror themselves into the
 * timeline as system-generated Activity rows. They duplicated records that
 * already live in the Money and Stock tabs, and because edits and deletes
 * never touched them they drifted out of date. Nothing creates them any more;
 * this drops the ones left behind, including any that come back from a
 * Sheets pull. Manually logged activities, season-start and harvest entries
 * are untouched.
 */
export function stripAutoActivities(activities: Activity[]): Activity[] {
  return (activities || []).filter(act => !act.id?.startsWith('act_auto_'));
}

/**
 * "Mark Transferred" ticks in the Settle tab used to live in these two
 * localStorage keys, which made them per-device: they never reached Google
 * Sheets, so a partner on another phone saw settled debts as outstanding.
 * They now live in the database as `settlementClearances`. These keys are
 * read once to carry existing ticks over.
 */
const LEGACY_CLEARED_DEBTS_KEY = 'farmledger_cleared_debts';
const LEGACY_CLEARED_SUBS_KEY = 'farmledger_cleared_sub_entries';

export const LEGACY_CLEARANCE_KEYS = [LEGACY_CLEARED_DEBTS_KEY, LEGACY_CLEARED_SUBS_KEY];

/**
 * Clearance keys originally ended with the rounded debt amount, e.g.
 * `s1:mem_a:mem_b:4500`. That made the tick a function of the figure, so any
 * recomputation — an edited partnership split, a late expense, a new sale —
 * changed the key and the settled debt silently reappeared as outstanding.
 * The amount is a value, not an identity; a settlement is identified by the
 * seasons it covers and the two partners. This rewrites stored keys to the
 * amount-free form, so existing ticks survive.
 */
export function normalizeClearanceKeys(clearances: SettlementClearance[]): SettlementClearance[] {
  const seen = new Map<string, SettlementClearance>();

  (clearances || []).forEach(entry => {
    if (!entry || typeof entry.key !== 'string') return;

    const segments = entry.key.split(':');
    // <seasonIds>:<fromId>:<toId>:<roundedAmount> is the only legacy shape;
    // member and season ids never contain a colon, so a 4th all-digit
    // segment is unambiguously the amount.
    const key =
      segments.length === 4 && /^\d+$/.test(segments[3])
        ? segments.slice(0, 3).join(':')
        : entry.key;

    const scope = entry.scope === 'sub' ? 'sub' : 'debt';
    const id = `${scope}|${key}`;
    const existing = seen.get(id);

    // Two old keys can collapse onto one new key when the same pair was
    // settled at different amounts. Keep the earliest real timestamp.
    if (!existing) {
      seen.set(id, { id, scope, key, clearedAt: entry.clearedAt || '' });
    } else if (entry.clearedAt && (!existing.clearedAt || entry.clearedAt < existing.clearedAt)) {
      seen.set(id, { ...existing, clearedAt: entry.clearedAt });
    }
  });

  return Array.from(seen.values());
}

export function migrateLegacyClearances(): SettlementClearance[] {
  const readKeys = (storageKey: string, scope: SettlementClearance['scope']): SettlementClearance[] => {
    const raw = safeStorageGet(storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((key: any) => typeof key === 'string' && key.trim() !== '')
        .map((key: string) => ({
          id: `${scope}|${key}`,
          scope,
          key,
          clearedAt: ''
        }));
    } catch (e) {
      console.warn(`Failed to migrate legacy clearances from ${storageKey}:`, e);
      return [];
    }
  };

  return normalizeClearanceKeys([
    ...readKeys(LEGACY_CLEARED_DEBTS_KEY, 'debt'),
    ...readKeys(LEGACY_CLEARED_SUBS_KEY, 'sub')
  ]);
}

const DEFAULT_MEMBERS: Member[] = [];

const DEFAULT_FIELDS: Field[] = [];

const DEFAULT_SEASONS: Season[] = [];

const DEFAULT_STOCK: StockItem[] = [];

const DEFAULT_PURCHASES: StockPurchase[] = [];

const DEFAULT_USAGES: StockUsage[] = [];

const DEFAULT_EXPENSES: Expense[] = [];

const DEFAULT_LABOUR: Labour[] = [];

const DEFAULT_REVENUES: HarvestRevenue[] = [];

const DEFAULT_AUDIT: AuditLog[] = [];

const DEFAULT_SETTINGS: Settings = {
  currency: '₹',
  areaUnit: 'acres',
  googleDriveLinked: false
};

export function getInitialDatabase(): LocalDatabase {
  // Try localStorage first (synchronous fallback)
  const localData = safeStorageGet(STORAGE_KEY);
  if (localData) {
    try {
      const parsed = JSON.parse(localData) || {};
      return {
        members: parsed.members || DEFAULT_MEMBERS || [],
        fields: parsed.fields || DEFAULT_FIELDS || [],
        seasons: parsed.seasons || DEFAULT_SEASONS || [],
        activities: stripAutoActivities(parsed.activities || []),
        expenses: parsed.expenses || DEFAULT_EXPENSES || [],
        labours: parsed.labours || DEFAULT_LABOUR || [],
        stockItems: parsed.stockItems || DEFAULT_STOCK || [],
        purchases: parsed.purchases || DEFAULT_PURCHASES || [],
        usages: parsed.usages || DEFAULT_USAGES || [],
        revenues: parsed.revenues || DEFAULT_REVENUES || [],
        auditLogs: parsed.auditLogs || [],
        settings: parsed.settings || DEFAULT_SETTINGS,
        creditAccounts: parsed.creditAccounts || [],
        creditRepayments: parsed.creditRepayments || [],
        // Absent (rather than empty) means this browser predates the move off
        // localStorage, so carry any ticks it still holds over.
        settlementClearances: parsed.settlementClearances
          ? normalizeClearanceKeys(parsed.settlementClearances)
          : migrateLegacyClearances()
      };
    } catch (e) {
      console.error('Error parsing localstorage database:', e);
    }
  }

  // Create default fallback if nothing is stored
  const db: LocalDatabase = {
    members: DEFAULT_MEMBERS,
    fields: DEFAULT_FIELDS,
    seasons: DEFAULT_SEASONS,
    activities: [],
    expenses: DEFAULT_EXPENSES,
    labours: DEFAULT_LABOUR,
    stockItems: DEFAULT_STOCK,
    purchases: DEFAULT_PURCHASES,
    usages: DEFAULT_USAGES,
    revenues: DEFAULT_REVENUES,
    auditLogs: DEFAULT_AUDIT,
    settings: DEFAULT_SETTINGS,
    creditAccounts: [],
    creditRepayments: [],
    settlementClearances: []
  };

  saveDatabase(db);
  return db;
}

export function saveDatabase(db: LocalDatabase): void {
  // Use hybrid storage (IndexedDB + localStorage)
  saveDatabaseHybrid(db, STORAGE_KEY).catch(err => {
    console.warn('Error in hybrid storage save:', err);
    // Fallback to localStorage if hybrid fails
    safeStorageSet(STORAGE_KEY, JSON.stringify(db));
  });
}

/**
 * Creates an audit log entry in the database.
 * Keeps recent 500 logs in active storage; archives older ones to localStorage.
 */
export function addAuditLog(
  db: LocalDatabase,
  actionType: 'create' | 'edit' | 'delete',
  entityType: string,
  entityId: string,
  description: string,
  memberId?: string
): LocalDatabase {
  const newLog: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    actionType,
    entityType,
    entityId,
    description,
    memberId
  };

  const allLogs = [newLog, ...db.auditLogs];
  const activeLogs = allLogs.slice(0, 500); // Keep 500 recent logs in main DB
  const archivedLogs = allLogs.slice(500); // Archive older logs

  // Store archived logs separately for historical access
  if (archivedLogs.length > 0) {
    try {
      const archiveKey = `farm_ledger_audit_archive`;
      const existing = safeStorageGet(archiveKey);
      const archiveList = existing ? JSON.parse(existing) : [];
      const newArchive = [
        {
          date: new Date().toISOString(),
          logs: archivedLogs
        },
        ...archiveList
      ].slice(0, 24); // Keep up to 24 archive batches (roughly 2 years if monthly)
      safeStorageSet(archiveKey, JSON.stringify(newArchive));
    } catch (err) {
      console.warn('Failed to archive audit logs:', err);
    }
  }

  const updatedDb = {
    ...db,
    auditLogs: activeLogs
  };
  saveDatabase(updatedDb);
  return updatedDb;
}

/**
 * Converts any array of objects into a CSV download string.
 */
export function convertToCSV(array: any[]): string {
  if (array.length === 0) return '';
  const keys = Object.keys(array[0]);
  const csvHeaders = keys.join(',');
  const csvRows = array.map(row => {
    return keys.map(key => {
      let val = row[key];
      if (val === undefined || val === null) {
        val = '';
      }
      if (typeof val === 'object') {
        val = JSON.stringify(val);
      }
      // Escape commas and quotes
      let strVal = String(val).replace(/"/g, '""');
      if (strVal.includes(',') || strVal.includes('\n') || strVal.includes('"')) {
        strVal = `"${strVal}"`;
      }
      return strVal;
    }).join(',');
  });
  return [csvHeaders, ...csvRows].join('\n');
}

/**
 * Trigger browser file download.
 */
export function downloadFile(content: string, filename: string, contentType: string) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
export function exportDatabaseJSON(db: LocalDatabase) {
  const jsonString = JSON.stringify(db, null, 2);
  downloadFile(jsonString, `farmledger_backup_${new Date().toISOString().slice(0,10)}.json`, 'application/json');
}
