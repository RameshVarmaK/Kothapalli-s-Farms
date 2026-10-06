/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction, useEffect, useRef, useState } from 'react';
import { LocalDatabase, saveDatabase, isPlaceholderSpreadsheetId } from '../utils/database';
import {
  applyUploadedReceipts,
  collectPendingReceipts,
  migrateLegacyReceipts,
  uploadPendingReceipts,
} from '../utils/driveReceipts';

const RETRY_INTERVAL_MS = 2 * 60 * 1000;

/**
 * Moves receipts waiting on this device into Google Drive.
 *
 * Runs after every change to the database (so right after an expense is
 * saved) and again whenever the device comes back online. Saving an expense
 * never waits on this: a receipt that can't be uploaded stays pending, with
 * its file kept locally, until a later attempt succeeds.
 */
export function useReceiptUploads(
  db: LocalDatabase | null,
  setDb: Dispatch<SetStateAction<LocalDatabase | null>>,
  accessToken: string | null
): void {
  const runningRef = useRef(false);
  const rerunRef = useRef(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const retry = () => setTick(n => n + 1);
    window.addEventListener('online', retry);
    // Also try again now and then, for failures that weren't about being
    // offline (a flaky network, an expired token that was since renewed).
    const intervalId = setInterval(retry, RETRY_INTERVAL_MS);
    return () => {
      window.removeEventListener('online', retry);
      clearInterval(intervalId);
    };
  }, []);

  // Old-shape receipts (base64 receiptPhoto) become pending attachments,
  // whether or not anyone is signed in, so the sheet never sees them.
  useEffect(() => {
    if (!db?.expenses) return;
    const migrated = migrateLegacyReceipts(db.expenses);
    if (migrated === db.expenses) return;
    setDb(prev => {
      if (!prev) return prev;
      const next = { ...prev, expenses: migrateLegacyReceipts(prev.expenses || []) };
      saveDatabase(next);
      return next;
    });
  }, [db?.expenses]);

  useEffect(() => {
    if (!accessToken || !db) return;
    const work = collectPendingReceipts(db.expenses);
    if (work.length === 0) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    if (runningRef.current) {
      rerunRef.current = true;
      return;
    }

    const sheetId = db.settings?.linkedSpreadsheetId;
    const shareWith = sheetId && !isPlaceholderSpreadsheetId(sheetId) ? sheetId : null;
    runningRef.current = true;
    (async () => {
      try {
        const { uploaded } = await uploadPendingReceipts(accessToken, shareWith, work);
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
