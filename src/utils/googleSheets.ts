/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { attachmentsForSheet } from './attachments';

interface SheetsBatchUpdatePayload {
  valueInputOption: 'USER_ENTERED';
  data: {
    range: string;
    values: any[][];
  }[];
}

/** A bare spreadsheet id: Google's are long opaque url-safe strings. The
 * length floor keeps a stray word from being mistaken for an id. */
const BARE_SPREADSHEET_ID = /^[a-zA-Z0-9-_]{20,}$/;

/**
 * Accepts whatever the user pasted and returns the spreadsheet id, or null
 * if it isn't one.
 *
 * People share sheets by copying the address bar, so a full
 * `https://docs.google.com/spreadsheets/d/<id>/edit#gid=0` has to work just
 * as well as the bare id — asking someone to surgically extract the id from
 * a URL on a phone is how a shared ledger doesn't get linked.
 */
export function extractSpreadsheetId(input: string): string | null {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const fromUrl = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (fromUrl) return fromUrl[1];

  if (BARE_SPREADSHEET_ID.test(trimmed)) return trimmed;
  return null;
}

/** The address to hand someone so they can open or share the sheet. */
export function spreadsheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}

/** Why a spreadsheet couldn't be opened — drives the message the user sees. */
export type SpreadsheetAccessFailure = 'forbidden' | 'not-found' | 'unknown';

export class SpreadsheetAccessError extends Error {
  readonly reason: SpreadsheetAccessFailure;
  readonly status?: number;
  constructor(message: string, reason: SpreadsheetAccessFailure, status?: number) {
    super(message);
    this.name = 'SpreadsheetAccessError';
    this.reason = reason;
    this.status = status;
  }
}

/**
 * Confirms the signed-in user can actually open this spreadsheet, and
 * returns its title.
 *
 * Note this goes through the Sheets API, not Drive. The `spreadsheets` scope
 * covers every sheet the user can open — including one another person shared
 * with them — whereas Drive's `drive.file` scope only ever sees files this
 * app created. That asymmetry is the whole reason a shared sheet can be
 * used but not found by name: linking it by id works, searching for it does
 * not.
 */
export async function fetchSpreadsheetTitle(accessToken: string, spreadsheetId: string): Promise<string> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title`;

  let res: Response;
  try {
    res = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${accessToken}` } });
  } catch (err) {
    throw new SpreadsheetAccessError(
      `Could not reach Google Sheets: ${err instanceof Error ? err.message : String(err)}`,
      'unknown'
    );
  }

  if (!res.ok) {
    let body = '';
    try {
      body = await res.text();
    } catch (_) {}
    const reason: SpreadsheetAccessFailure =
      res.status === 403 ? 'forbidden' : res.status === 404 ? 'not-found' : 'unknown';
    throw new SpreadsheetAccessError(
      `Could not open spreadsheet ${spreadsheetId}: ${res.status} ${res.statusText || ''} ${body}`.trim(),
      reason,
      res.status
    );
  }

  const result = await res.json();
  return result?.properties?.title || 'Untitled spreadsheet';
}

/** Turns a linking failure into something a farm partner can act on. Shared
 * by every place that links a sheet so they can't drift apart. */
export function describeSheetLinkError(err: unknown): string {
  if (err instanceof SpreadsheetAccessError) {
    if (err.reason === 'forbidden') {
      return 'Your Google account cannot open that sheet. Ask its owner to share it with you as an Editor, then try again.';
    }
    if (err.reason === 'not-found') {
      return 'No spreadsheet exists with that link or ID. Check it and try again.';
    }
  }
  return err instanceof Error ? err.message : String(err);
}

/** Raised when Drive could not be asked whether the spreadsheet exists.
 * Distinct from a successful search that found nothing — see below. */
export class DriveSearchError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'DriveSearchError';
    this.status = status;
  }
}

/**
 * Searches the user's Google Drive for an existing spreadsheet named
 * 'FarmLedger Database'.
 *
 * Returns the spreadsheet ID if found, or `null` *only* when Drive answered
 * successfully and had no such file. Any failure to ask the question — an
 * expired token, a 403, a network blip — throws instead.
 *
 * That distinction matters: callers create a brand new spreadsheet when this
 * returns null. Reporting a failed search as "not found" made a transient
 * Drive error silently fork the user's ledger into a second 'FarmLedger
 * Database', leaving the real one orphaned.
 *
 * Results are ordered by creation time so that if duplicates do already
 * exist, every session picks the same (oldest) one rather than whichever
 * Drive happened to list first.
 */
export async function findExistingSpreadsheet(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent("name = 'FarmLedger Database' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,createdTime)&orderBy=createdTime`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  } catch (err) {
    throw new DriveSearchError(
      `Could not reach Google Drive to check for an existing 'FarmLedger Database': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!res.ok) {
    let errBody = '';
    try {
      errBody = await res.text();
    } catch (_) {}
    throw new DriveSearchError(
      `Drive search for an existing 'FarmLedger Database' failed: ${res.status} ${res.statusText || ''} ${errBody}`.trim(),
      res.status
    );
  }

  let result: any;
  try {
    result = await res.json();
  } catch (err) {
    throw new DriveSearchError(
      `Drive returned an unreadable response while searching for 'FarmLedger Database': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (result?.files?.length > 0) {
    return result.files[0].id;
  }
  return null;
}

/**
 * Creates a brand new Spreadsheet in Google Drive with pre-formatted sheets for all FarmLedger entities.
 */
export async function createSpreadsheet(accessToken: string): Promise<string> {
  const url = 'https://sheets.googleapis.com/v4/spreadsheets';
  const body = {
    properties: {
      title: 'FarmLedger Database',
    },
    sheets: [
      { properties: { title: 'Members', gridProperties: { columnCount: 10, rowCount: 100 } } },
      { properties: { title: 'Fields', gridProperties: { columnCount: 10, rowCount: 100 } } },
      { properties: { title: 'Seasons', gridProperties: { columnCount: 10, rowCount: 150 } } },
      { properties: { title: 'Activities', gridProperties: { columnCount: 10, rowCount: 1000 } } },
      { properties: { title: 'Expenses', gridProperties: { columnCount: 15, rowCount: 1000 } } },
      { properties: { title: 'Labor', gridProperties: { columnCount: 15, rowCount: 1000 } } },
      { properties: { title: 'StockItems', gridProperties: { columnCount: 10, rowCount: 200 } } },
      { properties: { title: 'StockPurchases', gridProperties: { columnCount: 10, rowCount: 1000 } } },
      { properties: { title: 'StockUsage', gridProperties: { columnCount: 10, rowCount: 1000 } } },
      { properties: { title: 'HarvestRevenue', gridProperties: { columnCount: 10, rowCount: 1000 } } },
      { properties: { title: 'AuditLogs', gridProperties: { columnCount: 10, rowCount: 5000 } } },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let errBody = '';
    try {
      errBody = await res.text();
    } catch (_) {}
    throw new Error(`Failed to create Google Sheet: ${res.status} ${res.statusText || ''} - ${errBody}`);
  }

  const result = await res.json();
  return result.spreadsheetId;
}

/**
 * Transforms an array of objects to Excel-exportable / Google Sheet spreadsheet rows.
 */
export function toSheetRows<T extends object>(data: T[], headers: string[]): any[][] {
  const rows = [headers];
  if (!data) return rows;
  data.forEach(item => {
    if (!item) return;
    const row = headers.map(header => {
      let val = (item as any)[header];
      // Receipt files live in Drive; only their metadata goes in the sheet.
      // File content (base64) would overflow a cell and has no place in the
      // shared ledger, so it is dropped here, on every write path.
      if (header === 'attachments') val = attachmentsForSheet(val);
      if (header === 'receiptPhoto') val = undefined;
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });
    rows.push(row);
  });
  return rows;
}

/** Spreadsheet column letter for a 1-based column number: 1 → A, 27 → AA. */
export function columnLetter(n: number): string {
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

/** Spare rows added whenever a tab has to grow, so a ledger that is adding
 * entries steadily doesn't need another resize on every push, and the
 * trailing clear below the data still starts inside the grid. */
const ROW_HEADROOM = 500;

/**
 * Ensures that all required tabs/sheets exist in the spreadsheet.
 * If any sheets are missing, it sends a batchUpdate request to create them.
 *
 * `rowsNeeded` maps a tab title to the rows about to be written to it
 * (header included). A tab whose grid is shorter is grown first: Sheets
 * rejects a write that runs past the grid's last row, and before this every
 * push failed for good once a collection outgrew the size its tab was
 * created with.
 */
export async function ensureSheetsExist(
  accessToken: string,
  spreadsheetId: string,
  rowsNeeded: Record<string, number> = {}
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties(title,sheetId,gridProperties(columnCount,rowCount))`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${res.status} ${res.statusText || ''}`.trim());
  }

  const metadata = await res.json();
  const existingTitles = new Set<string>();
  const existingTabs = new Map<string, { sheetId: number; columnCount: number; rowCount: number }>();
  if (metadata.sheets) {
    metadata.sheets.forEach((sheet: any) => {
      if (sheet.properties?.title) {
        existingTitles.add(sheet.properties.title);
        existingTabs.set(sheet.properties.title, {
          sheetId: sheet.properties.sheetId,
          columnCount: sheet.properties.gridProperties?.columnCount ?? 0,
          rowCount: sheet.properties.gridProperties?.rowCount ?? 0,
        });
      }
    });
  }

  const requiredSheets = [
    { title: 'Members', columnCount: 10, rowCount: 100 },
    { title: 'Fields', columnCount: 10, rowCount: 100 },
    { title: 'Seasons', columnCount: 10, rowCount: 150 },
    { title: 'Activities', columnCount: 10, rowCount: 1000 },
    { title: 'Expenses', columnCount: 15, rowCount: 1000 },
    { title: 'Labor', columnCount: 15, rowCount: 1000 },
    { title: 'StockItems', columnCount: 10, rowCount: 200 },
    { title: 'StockPurchases', columnCount: 10, rowCount: 1000 },
    { title: 'StockUsage', columnCount: 10, rowCount: 1000 },
    { title: 'HarvestRevenue', columnCount: 10, rowCount: 1000 },
    { title: 'AuditLogs', columnCount: 10, rowCount: 5000 },
    { title: 'CreditAccounts', columnCount: 10, rowCount: 500 },
    { title: 'CreditRepayments', columnCount: 10, rowCount: 1000 },
    { title: 'SettlementClearances', columnCount: 10, rowCount: 1000 },
    { title: 'NotificationPreferences', columnCount: 10, rowCount: 200 },
  ];

  const missingSheets = requiredSheets.filter(s => !existingTitles.has(s.title));

  // A tab created before a column was added (Labor gained 'description') is
  // too narrow for the new layout; widen it rather than write past its edge.
  const narrowSheets = requiredSheets
    .map(s => ({ required: s, existing: existingTabs.get(s.title) }))
    .filter(({ required, existing }) => existing && existing.columnCount > 0 && existing.columnCount < required.columnCount);

  // Likewise a tab with more records than rows. An unknown row count (0)
  // is left alone rather than guessed at.
  const shortSheets = requiredSheets
    .map(s => ({ existing: existingTabs.get(s.title), needed: rowsNeeded[s.title] ?? 0 }))
    .filter(({ existing, needed }) => existing && existing.rowCount > 0 && existing.rowCount < needed);

  if (missingSheets.length > 0 || narrowSheets.length > 0 || shortSheets.length > 0) {
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const widenRequests = narrowSheets.map(({ required, existing }) => ({
      appendDimension: {
        sheetId: existing!.sheetId,
        dimension: 'COLUMNS',
        length: required.columnCount - existing!.columnCount,
      },
    }));
    const lengthenRequests = shortSheets.map(({ existing, needed }) => ({
      appendDimension: {
        sheetId: existing!.sheetId,
        dimension: 'ROWS',
        length: needed - existing!.rowCount + ROW_HEADROOM,
      },
    }));
    const addRequests = missingSheets.map(sheet => {
      const needed = rowsNeeded[sheet.title] ?? 0;
      return {
        addSheet: {
          properties: {
            title: sheet.title,
            gridProperties: {
              columnCount: sheet.columnCount,
              rowCount: needed > sheet.rowCount ? needed + ROW_HEADROOM : sheet.rowCount,
            },
          },
        },
      };
    });

    const updateRes = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: [...addRequests, ...widenRequests, ...lengthenRequests] }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to create or resize sheet tabs in spreadsheet: ${errText}`);
    }
  }
}

/**
 * The columns each collection is written to its Sheet tab with. Anything not
 * listed here never reaches the sheet, so it is also exactly the part of a
 * record the sync fingerprint compares (see syncConflict.ts).
 */
export const SHEET_COLUMNS: Record<string, string[]> = {
  members: ['id', 'name', 'phone', 'photo'],
  fields: ['id', 'name', 'area', 'locationNote', 'shares'],
  seasons: ['id', 'fieldId', 'cropName', 'startDate', 'endDate', 'isClosed', 'shares'],
  activities: ['id', 'date', 'fieldId', 'seasonId', 'type', 'notes', 'weatherNote', 'photos'],
  // 'receiptPhoto' is kept only so later columns don't move; it is always
  // written blank (see toSheetRows). 'attachments' (Drive receipt metadata)
  // goes last so existing sheets keep every column where it was.
  expenses: ['id', 'date', 'amount', 'paidByMemberId', 'category', 'linkedActivityId', 'targetType', 'targetFieldId', 'targetSeasonId', 'commonAllocationRule', 'allocations', 'receiptPhoto', 'isCredit', 'creditAccountId', 'attachments'],
  // 'description' goes last so existing sheets keep every column where it was.
  labours: ['id', 'date', 'fieldId', 'seasonId', 'linkedActivityId', 'workersCount', 'wageRate', 'totalCost', 'paidByMemberId', 'isCredit', 'creditAccountId', 'targetType', 'commonAllocationRule', 'allocations', 'description'],
  stockItems: ['id', 'name', 'type', 'unit', 'quantityOnHand', 'weightedAverageCost', 'totalCostSpent', 'fundingByMember'],
  purchases: ['id', 'stockItemId', 'quantity', 'totalCost', 'date', 'paidByMemberId', 'isCredit', 'creditAccountId'],
  usages: ['id', 'stockItemId', 'quantityUsed', 'date', 'targetType', 'targetFieldId', 'targetSeasonId', 'commonAllocationRule', 'allocations', 'linkedActivityId'],
  revenues: ['id', 'date', 'fieldId', 'seasonId', 'crop', 'quantity', 'buyerName', 'saleAmount', 'receivedByMemberId'],
  auditLogs: ['id', 'timestamp', 'actionType', 'entityType', 'entityId', 'description', 'memberId'],
  creditAccounts: ['id', 'name', 'phone', 'type', 'notes'],
  creditRepayments: ['id', 'creditAccountId', 'memberId', 'amount', 'date', 'notes'],
  settlementClearances: ['id', 'scope', 'key', 'clearedAt'],
  notificationPreferences: ['memberId', 'channel', 'phoneNumber', 'enabledEvents'],
};

/**
 * Synchronizes local data object to the specified Google Spreadsheet.
 *
 * `collections` limits the write to those collections' tabs (by collection
 * name, e.g. 'expenses'); leave it out to write every tab. The autosave
 * passes only what changed since the last sync, so one new expense doesn't
 * resend the whole ledger.
 */
export async function pushDataToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  data: {
    members: any[];
    fields: any[];
    seasons: any[];
    activities: any[];
    expenses: any[];
    labours: any[];
    stockItems: any[];
    purchases: any[];
    usages: any[];
    revenues: any[];
    auditLogs: any[];
    creditAccounts?: any[];
    creditRepayments?: any[];
    settlementClearances?: any[];
    notificationPreferences?: any[];
  },
  collections?: Iterable<string>
): Promise<void> {
  const wanted = collections ? new Set(collections) : null;
  const allTabs = [
    { collection: 'members', tab: 'Members', rows: data.members },
    { collection: 'fields', tab: 'Fields', rows: data.fields },
    // 'shares' holds the season-level ownership override. Leaving it out of
    // the Seasons columns meant an edited split was saved locally but never
    // pushed, so the next pull handed back a season with no shares and the
    // UI silently fell back to the field-level split.
    { collection: 'seasons', tab: 'Seasons', rows: data.seasons },
    { collection: 'activities', tab: 'Activities', rows: data.activities },
    { collection: 'expenses', tab: 'Expenses', rows: data.expenses },
    { collection: 'labours', tab: 'Labor', rows: data.labours },
    { collection: 'stockItems', tab: 'StockItems', rows: data.stockItems },
    { collection: 'purchases', tab: 'StockPurchases', rows: data.purchases },
    { collection: 'usages', tab: 'StockUsage', rows: data.usages },
    { collection: 'revenues', tab: 'HarvestRevenue', rows: data.revenues },
    { collection: 'auditLogs', tab: 'AuditLogs', rows: data.auditLogs },
    { collection: 'creditAccounts', tab: 'CreditAccounts', rows: data.creditAccounts },
    { collection: 'creditRepayments', tab: 'CreditRepayments', rows: data.creditRepayments },
    { collection: 'settlementClearances', tab: 'SettlementClearances', rows: data.settlementClearances },
    // Keyed by memberId, not id: there is exactly one preference row per member.
    { collection: 'notificationPreferences', tab: 'NotificationPreferences', rows: data.notificationPreferences },
  ];
  const tabs = allTabs
    .filter(t => !wanted || wanted.has(t.collection))
    .map(t => ({
      tab: t.tab,
      columns: SHEET_COLUMNS[t.collection],
      values: toSheetRows(t.rows || [], SHEET_COLUMNS[t.collection]),
    }));

  if (tabs.length === 0) return;

  // Gracefully ensure all relevant sheet tabs exist beforehand, with room
  // for every row about to be written.
  const rowsNeeded: Record<string, number> = {};
  tabs.forEach(t => { rowsNeeded[t.tab] = t.values.length; });
  await ensureSheetsExist(accessToken, spreadsheetId, rowsNeeded);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;

  // Each range is exactly as tall and wide as the data. A fixed range
  // ('Expenses!A1:Q1000') made the write fail on every push once a
  // collection outgrew it, with no way to recover from inside the app.
  const batchData = tabs.map(t => ({
    range: `${t.tab}!A1:${columnLetter(t.columns.length)}${t.values.length}`,
    values: t.values,
  }));

  // Google Sheets batch update requires clearing old cells or batch overwriting them.
  // SAFETY NOTE: Previous versions cleared every tab BEFORE writing. If the
  // batchUpdate then failed (network/auth/quota), the spreadsheet would be
  // left wiped. We now write first, and only clear cells beyond the new
  // data range after a successful write so the worst-case failure mode is
  // "stale rows remain" rather than "data lost".
  const payload: SheetsBatchUpdatePayload = {
    valueInputOption: 'USER_ENTERED',
    data: batchData,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errorDetails = await res.text();
    throw new Error(`Google Sheets batch update failed: ${res.status} ${errorDetails}`);
  }

  // Now that the write succeeded, clean up any leftover stale rows that
  // sit below the data we just wrote. We compute the safe starting row per
  // tab (header row + data rows + 1) so we never erase rows we just wrote.
  const trailingClears: { tab: string; startRow: number }[] = tabs.map(t => {
    const startRow = (t.values?.length || 0) + 1; // 1-indexed; +1 to start AFTER the last data row
    return { tab: t.tab, startRow };
  });

  // The range is left open at the bottom ('A12:Z' runs to the grid's last
  // row) so a tab that has grown past any fixed bound is still cleared all
  // the way down.
  await Promise.all(trailingClears.map(async ({ tab, startRow }) => {
    try {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tab}!A${startRow}:Z:clear`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (e) {
      // Non-fatal: stale tail rows are an aesthetic issue, not a data-loss one.
      console.warn(`Could not clear trailing rows of ${tab}:`, e);
    }
  }));
}

/**
 * Collections whose rows are identified by something other than `id`.
 */
const SHEET_ID_FIELDS: Record<string, string> = {
  notificationPreferences: 'memberId'
};

/**
 * Helper to parse Sheet row data into javascript objects using headers.
 * Safely deserializes JSON with error recovery.
 */
export function parseSheetRows<T>(rows: any[][], idField: string = 'id'): T[] {
  if (!rows || rows.length <= 1) return [];
  const headers = rows[0];
  const items: T[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const item: any = {};

    headers.forEach((header, index) => {
      let val = row[index];
      if (val === undefined || val === null) {
        val = '';
      }

      // A cell that is already a real boolean must pass through untouched.
      // The branches below only recognise the *string* forms Sheets returns
      // under FORMATTED_VALUE; without this, an actual `false` falls through
      // to the numeric branch and becomes 0.
      if (typeof val === 'boolean') {
        item[header] = val;
        return;
      }

      // Safely restore JSON stringified arrays or objects
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          // Arrays of primitives are legitimate here — Activity.photos holds
          // image URLs and NotificationPreferences.enabledEvents holds event
          // names. Rejecting them discarded the whole record, so a logged
          // activity with a photo vanished on the next pull.
          item[header] = JSON.parse(val);
        } catch (e) {
          console.warn(`Failed to parse JSON in ${header} at row ${i}: ${val.slice(0, 50)}...`);
          // Fall back to string if JSON parsing fails
          item[header] = val;
        }
      } else if (typeof val === 'string' && val.toLowerCase() === 'true') {
        // Google Sheets returns boolean cells as "TRUE"/"FALSE" (uppercase) under the
        // default FORMATTED_VALUE render option, not the lowercase "true"/"false" we write.
        item[header] = true;
      } else if (typeof val === 'string' && val.toLowerCase() === 'false') {
        item[header] = false;
      } else if (!isNaN(Number(val)) && val !== '') {
        item[header] = Number(val);
      } else {
        item[header] = val;
      }
    });

    // Only add rows carrying an identity. Most collections use `id`; a few
    // are keyed by something else (notification preferences, one per member).
    if (item[idField] && String(item[idField]).trim() !== '') {
      items.push(item as T);
    }
  }

  return items;
}

/**
 * Reads all data rows from the Google Spreadsheet to recover state.
 */
export async function pullDataFromSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  members: any[];
  fields: any[];
  seasons: any[];
  activities: any[];
  expenses: any[];
  labours: any[];
  stockItems: any[];
  purchases: any[];
  usages: any[];
  revenues: any[];
  auditLogs: any[];
  settlementClearances: any[];
  notificationPreferences: any[];
} | null> {
  // Gracefully ensure all relevant sheet tabs exist beforehand
  await ensureSheetsExist(accessToken, spreadsheetId);

  const tabNames = [
    'Members',
    'Fields',
    'Seasons',
    'Activities',
    'Expenses',
    'Labor',
    'StockItems',
    'StockPurchases',
    'StockUsage',
    'HarvestRevenue',
    'AuditLogs',
    'CreditAccounts',
    'CreditRepayments',
    'SettlementClearances',
    'NotificationPreferences',
  ];

  // Open-ended ('A:Z' runs to the last row) so a tab past any fixed bound
  // is read in full rather than silently cut short.
  const ranges = tabNames.map(name => `${name}!A:Z`).join('&ranges=');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to batchGet spreadsheet data: ${res.status} ${res.statusText || ''}`.trim());
    }

    const result = await res.json();
    const valueRanges = result.valueRanges || [];

    // Parse according to sequence of ranges requested
    const data: any = {};
    tabNames.forEach((name, idx2) => {
      const rows = valueRanges[idx2]?.values || [];
      const collectionName =
        name === 'Labor'
          ? 'labours'
          : name === 'StockItems'
          ? 'stockItems'
          : name === 'StockPurchases'
          ? 'purchases'
          : name === 'StockUsage'
          ? 'usages'
          : name === 'HarvestRevenue'
          ? 'revenues'
          : name === 'AuditLogs'
          ? 'auditLogs'
          : name === 'CreditAccounts'
          ? 'creditAccounts'
          : name === 'CreditRepayments'
          ? 'creditRepayments'
          : name === 'SettlementClearances'
          ? 'settlementClearances'
          : name === 'NotificationPreferences'
          ? 'notificationPreferences'
          : name.toLowerCase();

      data[collectionName] = parseSheetRows(rows, SHEET_ID_FIELDS[collectionName] || 'id');
    });

    return data;
  } catch (error) {
    console.error('pullDataFromSpreadsheet error:', error);
    throw error;
  }
}
