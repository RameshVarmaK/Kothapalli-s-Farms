/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LocalDatabase, stripAutoActivities, normalizeClearanceKeys } from '../utils/database';
import { keepPendingReceiptData } from '../utils/attachments';

// Merges a raw Sheets pull with a fallback base, filling in the shape
// LocalDatabase expects. Shared by the login pull, the background
// reconciler, and the pre-push conflict check so all three compare data
// the same way.
export function normalizeCloudDb(sheetData: any, base: LocalDatabase, targetSheetId: string): LocalDatabase {
  return {
    members: sheetData.members ?? base.members ?? [],
    fields: sheetData.fields ?? base.fields ?? [],
    seasons: sheetData.seasons ?? base.seasons ?? [],
    activities: stripAutoActivities(sheetData.activities ?? base.activities ?? []),
    // Receipts not yet in Drive keep their file from this device's copy.
    expenses: keepPendingReceiptData(sheetData.expenses ?? base.expenses ?? [], base.expenses),
    labours: sheetData.labours ?? base.labours ?? [],
    stockItems: sheetData.stockItems ?? base.stockItems ?? [],
    purchases: sheetData.purchases ?? base.purchases ?? [],
    usages: sheetData.usages ?? base.usages ?? [],
    revenues: sheetData.revenues ?? base.revenues ?? [],
    auditLogs: sheetData.auditLogs ?? base.auditLogs ?? [],
    creditAccounts: sheetData.creditAccounts ?? base.creditAccounts ?? [],
    creditRepayments: sheetData.creditRepayments ?? base.creditRepayments ?? [],
    notificationPreferences: sheetData.notificationPreferences ?? base.notificationPreferences,
    settlementClearances: normalizeClearanceKeys(sheetData.settlementClearances ?? base.settlementClearances ?? []),
    settings: {
      ...base.settings,
      ...(sheetData.settings || {}),
      googleDriveLinked: true,
      linkedSpreadsheetId: targetSheetId
    }
  };
}
