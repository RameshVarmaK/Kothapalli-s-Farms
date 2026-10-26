/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { downloadFile } from './database';
import { LedgerItem } from './moneyLedger';

// A cell that starts with one of these is run as a formula by Excel and
// Sheets. Ledger text is typed by partners (and arrives from a shared sheet),
// so it is prefixed with an apostrophe to stay plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: quoted when it holds a comma, quote or line break. */
export function csvCell(value: string | number): string {
  const text = typeof value === 'number' ? String(value) : value;
  const safe = typeof value === 'string' && FORMULA_START.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n');
}

const TYPE_LABEL = { expense: 'Expense', labour: 'Labour', revenue: 'Harvest sale' } as const;

/** The ledger rows as a CSV. Amounts are plain positive numbers; "Type" says
 * whether it was money out (Expense, Labour) or in (Harvest sale). */
export function ledgerToCsv(items: LedgerItem[]): string {
  const header = ['Date', 'Type', 'Description', 'Field / Crop cycle', 'Paid by / Received by', 'Amount'];
  return toCsv([
    header,
    ...items.map(item => [item.date, TYPE_LABEL[item.type], item.description, item.fieldSeasonName, item.party, item.amount]),
  ]);
}

export function exportLedgerCsv(items: LedgerItem[]): void {
  // The BOM makes Excel read the file as UTF-8, so Telugu names survive.
  downloadFile('﻿' + ledgerToCsv(items), `farm_ledger_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
}
