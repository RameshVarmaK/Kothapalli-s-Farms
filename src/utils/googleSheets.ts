/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface SheetsBatchUpdatePayload {
  valueInputOption: 'USER_ENTERED';
  data: {
    range: string;
    values: any[][];
  }[];
}

/**
 * Searches the user's Google Drive for an existing spreadsheet named 'FarmLedger Database'.
 * Returns the spreadsheet ID if found, otherwise null.
 */
export async function findExistingSpreadsheet(accessToken: string): Promise<string | null> {
  const query = encodeURIComponent("name = 'FarmLedger Database' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to list Drive files: ${res.statusText}`);
    }

    const result = await res.json();
    if (result.files && result.files.length > 0) {
      return result.files[0].id;
    }
    return null;
  } catch (error) {
    console.error('findExistingSpreadsheet error:', error);
    return null;
  }
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
      { properties: { title: 'Labor', gridProperties: { columnCount: 10, rowCount: 1000 } } },
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
    throw new Error(`Failed to create Google Sheet: ${res.statusText}`);
  }

  const result = await res.json();
  return result.spreadsheetId;
}

/**
 * Transforms an array of objects to Excel-exportable / Google Sheet spreadsheet rows.
 */
function toSheetRows<T extends object>(data: T[], headers: string[]): any[][] {
  const rows = [headers];
  data.forEach(item => {
    const row = headers.map(header => {
      const val = (item as any)[header];
      if (val === undefined || val === null) return '';
      if (typeof val === 'object') return JSON.stringify(val);
      return val;
    });
    rows.push(row);
  });
  return rows;
}

/**
 * Ensures that all required tabs/sheets exist in the spreadsheet.
 * If any sheets are missing, it sends a batchUpdate request to create them.
 */
export async function ensureSheetsExist(accessToken: string, spreadsheetId: string): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties.title`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch spreadsheet metadata: ${res.statusText}`);
  }

  const metadata = await res.json();
  const existingTitles = new Set<string>();
  if (metadata.sheets) {
    metadata.sheets.forEach((sheet: any) => {
      if (sheet.properties?.title) {
        existingTitles.add(sheet.properties.title);
      }
    });
  }

  const requiredSheets = [
    { title: 'Members', columnCount: 10, rowCount: 100 },
    { title: 'Fields', columnCount: 10, rowCount: 100 },
    { title: 'Seasons', columnCount: 10, rowCount: 150 },
    { title: 'Activities', columnCount: 10, rowCount: 1000 },
    { title: 'Expenses', columnCount: 15, rowCount: 1000 },
    { title: 'Labor', columnCount: 10, rowCount: 1000 },
    { title: 'StockItems', columnCount: 10, rowCount: 200 },
    { title: 'StockPurchases', columnCount: 10, rowCount: 1000 },
    { title: 'StockUsage', columnCount: 10, rowCount: 1000 },
    { title: 'HarvestRevenue', columnCount: 10, rowCount: 1000 },
    { title: 'AuditLogs', columnCount: 10, rowCount: 5000 },
  ];

  const missingSheets = requiredSheets.filter(s => !existingTitles.has(s.title));

  if (missingSheets.length > 0) {
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`;
    const requests = missingSheets.map(sheet => ({
      addSheet: {
        properties: {
          title: sheet.title,
          gridProperties: {
            columnCount: sheet.columnCount,
            rowCount: sheet.rowCount,
          },
        },
      },
    }));

    const updateRes = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      throw new Error(`Failed to create missing sheets in spreadsheet: ${errText}`);
    }
  }
}

/**
 * Synchronizes local data object to the specified Google Spreadsheet.
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
  }
): Promise<void> {
  // Gracefully ensure all relevant sheet tabs exist beforehand
  await ensureSheetsExist(accessToken, spreadsheetId);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;

  const batchData = [
    {
      range: 'Members!A1:J100',
      values: toSheetRows(data.members, ['id', 'name', 'phone', 'photo']),
    },
    {
      range: 'Fields!A1:J100',
      values: toSheetRows(data.fields, ['id', 'name', 'area', 'locationNote', 'shares']),
    },
    {
      range: 'Seasons!A1:J150',
      values: toSheetRows(data.seasons, ['id', 'fieldId', 'cropName', 'startDate', 'endDate', 'isClosed']),
    },
    {
      range: 'Activities!A1:J1000',
      values: toSheetRows(data.activities, ['id', 'date', 'fieldId', 'seasonId', 'type', 'notes', 'weatherNote', 'photos']),
    },
    {
      range: 'Expenses!A1:O1000',
      values: toSheetRows(data.expenses, ['id', 'date', 'amount', 'paidByMemberId', 'category', 'linkedActivityId', 'targetType', 'targetFieldId', 'targetSeasonId', 'commonAllocationRule', 'allocations', 'receiptPhoto']),
    },
    {
      range: 'Labor!A1:J1000',
      values: toSheetRows(data.labours, ['id', 'date', 'fieldId', 'seasonId', 'linkedActivityId', 'workersCount', 'wageRate', 'totalCost', 'paidByMemberId']),
    },
    {
      range: 'StockItems!A1:J200',
      values: toSheetRows(data.stockItems, ['id', 'name', 'type', 'unit', 'quantityOnHand', 'weightedAverageCost', 'totalCostSpent', 'fundingByMember']),
    },
    {
      range: 'StockPurchases!A1:J1000',
      values: toSheetRows(data.purchases, ['id', 'stockItemId', 'quantity', 'totalCost', 'date', 'paidByMemberId']),
    },
    {
      range: 'StockUsage!A1:J1000',
      values: toSheetRows(data.usages, ['id', 'stockItemId', 'quantityUsed', 'date', 'targetType', 'targetFieldId', 'targetSeasonId', 'commonAllocationRule', 'allocations', 'linkedActivityId']),
    },
    {
      range: 'HarvestRevenue!A1:J1000',
      values: toSheetRows(data.revenues, ['id', 'date', 'fieldId', 'seasonId', 'crop', 'quantity', 'buyerName', 'saleAmount', 'receivedByMemberId']),
    },
    {
      range: 'AuditLogs!A1:J5000',
      values: toSheetRows(data.auditLogs, ['id', 'timestamp', 'actionType', 'entityType', 'entityId', 'description', 'memberId']),
    },
  ];

  // Google Sheets batch update requires clearing old cells or batch overwriting them
  // We can write user_entered values
  const payload: SheetsBatchUpdatePayload = {
    valueInputOption: 'USER_ENTERED',
    data: batchData,
  };

  // First, we should clear existing cells so deletions also sync properly
  // To keep it simple, we can just POST the batch update. Since we overwrite from row 1, any excess rows are retained unless cleared.
  // Let's first clear the sheets to ensure no stale leftover rows exist.
  for (const tabName of [
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
  ]) {
    try {
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${tabName}!A1:Z5000:clear`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch (e) {
      console.warn(`Could not clear ${tabName}:` , e);
    }
  }

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
    throw new Error(`Google Sheets batch update failed: ${errorDetails}`);
  }
}

/**
 * Helper to parse Sheet row data into javascript objects using headers.
 */
function parseSheetRows<T>(rows: any[][]): T[] {
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

      // Restore JSON stringified arrays or objects
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        try {
          item[header] = JSON.parse(val);
        } catch (e) {
          item[header] = val;
        }
      } else if (val === 'true') {
        item[header] = true;
      } else if (val === 'false') {
        item[header] = false;
      } else if (!isNaN(Number(val)) && val !== '') {
        item[header] = Number(val);
      } else {
        item[header] = val;
      }
    });
    items.push(item as T);
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
  ];

  const ranges = tabNames.map(name => `${name}!A1:Z5000`).join('&ranges=');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?ranges=${ranges}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to batchGet spreadsheet data: ${res.statusText}`);
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
          : name.toLowerCase();

      data[collectionName] = parseSheetRows(rows);
    });

    return data;
  } catch (error) {
    console.error('pullDataFromSpreadsheet error:', error);
    throw error;
  }
}
