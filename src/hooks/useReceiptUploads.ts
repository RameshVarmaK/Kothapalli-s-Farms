/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { LocalDatabase, saveDatabase, isPlaceholderSpreadsheetId } from '../utils/database';
import {
  applyUploadedReceipts,
  cleanupStoredReceipts,
  collectPendingReceipts,
  migrateLegacyReceipts,
  pendingReceiptIds,
  stashInlineReceipts,
  stripInlineReceiptData,
  uploadPendingReceipts,
} from '../utils/driveReceipts';
import { checkReceiptsFolderOnSignIn, onReceiptsFolderStatus } from '../utils/receiptsFolder';

const RETRY_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Moves receipts waiting on this device into Google Drive.
 *
 * Runs after every change to the database (so right after an expense is
 * saved), whenever the device comes back online, and every two minutes.
 * Saving an expense never waits on this: a receipt that can't be uploaded
 * stays pending, its file kept in the device's receipt store (not in the
 * saved database), until a later attempt succeeds.
 */
export function useReceiptUploads(
  db: LocalDatabase | null,
  setDb: Dispatch<SetStateAction<LocalDatabase | null>>,
  accessToken: string | null
): void {
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const stashingRef = useRef(false);
  const pendingBeforeRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const retry = () => setTick(n => n + 1);
    window.addEventListener('online', retry);
    // Also try again now and then, for failures that weren't about being
    // offline (a flaky network, an expired token that was since renewed).
    const intervalId = setInterval(retry, RETRY_INTERVAL_MS);
    // Upload straight away once the partner connects the shared folder.
    const stopStatus = onReceiptsFolderStatus(s => { if (s.state === 'ready') retry(); });
    return () => {
      window.removeEventListener('online', retry);
      clearInterval(intervalId);
      stopStatus();
    };
  }, []);

  // Once per sign-in (token) and ledger: does this partner need to connect
  // the shared receipts folder, and — if they own it — add people newly on
  // the sheet to it.
  const sheetId = db?.settings?.linkedSpreadsheetId;
  const checkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!accessToken || !sheetId || isPlaceholderSpreadsheetId(sheetId)) return;
    const key = `${accessToken}|${sheetId}`;
    if (checkedRef.current === key) return;
    checkedRef.current = key;
    checkReceiptsFolderOnSignIn(accessToken, sheetId);
  }, [accessToken, sheetId]);

  // Old-shape receipts (base64 receiptPhoto) become pending attachments,
  // whether or not anyone is signed in, so the sheet never sees them. Then
  // any bytes held inline move to the receipt store, out of the database
  // that has to fit in localStorage. Without a store they stay inline.
  useEffect(() => {
    if (!db?.expenses) return;
    const migrated = migrateLegacyReceipts(db.expenses);
    if (migrated !== db.expenses) {
      setDb(prev => {
        if (!prev) return prev;
        const next = { ...prev, expenses: migrateLegacyReceipts(prev.expenses || []) };
        saveDatabase(next);
        return next;
      });
      return;
    }
    const hasInline = db.expenses.some(e => e?.attachments?.some(a => a.pending && a.data));
    if (!hasInline || stashingRef.current) return;
    stashingRef.current = true;
    (async () => {
      try {
        const moved = await stashInlineReceipts(db.expenses);
        if (moved.size > 0) {
          setDb(prev => {
            if (!prev) return prev;
            const next = { ...prev, expenses: stripInlineReceiptData(prev.expenses || [], moved) };
            saveDatabase(next);
            return next;
          });
        }
      } finally {
        stashingRef.current = false;
      }
    })();
  }, [db?.expenses]);

  // Clear stored files nothing needs any more (uploaded, removed, deleted).
  useEffect(() => {
    if (!db?.expenses) return;
    const before = pendingBeforeRef.current;
    pendingBeforeRef.current = new Set([...before, ...pendingReceiptIds(db.expenses)]);
    cleanupStoredReceipts(db.expenses, pendingBeforeRef.current)
      .then(removed => removed.forEach(id => pendingBeforeRef.current.delete(id)))
      .catch(() => { /* retried on the next change */ });
  }, [db?.expenses]);

  useEffect(() => {
    if (!accessToken || !db) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (pendingReceiptIds(db.expenses).size === 0) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }

    const ledgerId = sheetId && !isPlaceholderSpreadsheetId(sheetId) ? sheetId : null;
    runningRef.current = true;
    (async () => {
      try {
        const work = await collectPendingReceipts(db.expenses);
        if (work.length === 0) return;
        const { uploaded } = await uploadPendingReceipts(accessToken, ledgerId, work);
        if (uploaded.size > 0) {
          setDb(prev => {
            if (!prev) return prev;
            const next = { ...prev, expenses: applyUploadedReceipts(prev.expenses || [], uploaded) };
            saveDatabase(next);
            return next;
          });
        }
      } finally {
        runningRef.current = false;
        if (rerunRef.current) {
          rerunRef.current = false;
          setTick(n => n + 1);
        }
      }
    })();
  }, [db?.expenses, accessToken, tick]);
}
