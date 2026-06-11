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
  CreditRepayment
} from '../types';

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
}

const STORAGE_KEY = 'farm_ledger_database';

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
  const localData = localStorage.getItem(STORAGE_KEY);
  if (localData) {
    try {
      const parsed = JSON.parse(localData) || {};
      return {
        members: parsed.members || DEFAULT_MEMBERS || [],
        fields: parsed.fields || DEFAULT_FIELDS || [],
        seasons: parsed.seasons || DEFAULT_SEASONS || [],
        activities: parsed.activities || [],
        expenses: parsed.expenses || DEFAULT_EXPENSES || [],
        labours: parsed.labours || DEFAULT_LABOUR || [],
        stockItems: parsed.stockItems || DEFAULT_STOCK || [],
        purchases: parsed.purchases || DEFAULT_PURCHASES || [],
        usages: parsed.usages || DEFAULT_USAGES || [],
        revenues: parsed.revenues || DEFAULT_REVENUES || [],
        auditLogs: parsed.auditLogs || [],
        settings: parsed.settings || DEFAULT_SETTINGS,
        creditAccounts: parsed.creditAccounts || [],
        creditRepayments: parsed.creditRepayments || []
      };
    } catch (e) {
      console.error('Error parsing localstorage database:', e);
    }
  }

  // Create default fallback if nothing is stored in localStorage
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
    creditRepayments: []
  };

  saveDatabase(db);
  return db;
}

export function saveDatabase(db: LocalDatabase): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/**
 * Creates an audit log entry in the database.
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
    id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    actionType,
    entityType,
    entityId,
    description,
    memberId
  };

  const updatedDb = {
    ...db,
    auditLogs: [newLog, ...db.auditLogs].slice(0, 1000) // Keep last 1000 logs
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
