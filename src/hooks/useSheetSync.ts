/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Dispatch, SetStateAction, useEffect, useMemo, useRef, useState } from 'react';
import { clearGoogleAccessToken } from '../utils/auth';
import {
  getInitialDatabase,
  saveDatabase,
  addAuditLog,
  LocalDatabase,
  isPlaceholderSpreadsheetId
} from '../utils/database';
import { classifySync, holdsSameRecords, getLastSyncedFingerprint, setLastSyncedFingerprint, countUnsyncedChanges, collectionsToPush } from '../utils/syncConflict';
import { classifySyncError, isRetryable, retryDelayMs, SyncErrorKind } from '../utils/syncErrors';
import { logError, logWarning } from '../utils/errorLogging';
import { pullDataFromSpreadsheet, pushDataToSpreadsheet, findExistingSpreadsheet, createSpreadsheet, extractSpreadsheetId, fetchSpreadsheetTitle, describeSheetLinkError } from '../utils/googleSheets';
import { pickSpreadsheet } from '../utils/googlePicker';
import { normalizeCloudDb } from '../app/normalizeCloudDb';
import { hasChosenLedger, rememberLedgerChoice } from '../app/ledgerChoice';

export type SyncingState = 'idle' | 'syncing' | 'success' | 'failed';

interface SheetSyncOptions {
  db: LocalDatabase | null;
  setDb: Dispatch<SetStateAction<LocalDatabase | null>>;
  accessToken: string | null;
  setAccessToken: Dispatch<SetStateAction<string | null>>;
  setFetchError: Dispatch<SetStateAction<string | null>>;
}

/**
 * Keeps this device's database and the linked Google Sheet in step: the
 * pull on sign-in, the debounced push after every change (checked against
 * the sheet first), the background poll for a teammate's edits, automatic
 * retries, and the conflict prompt. Also links, creates or pulls a sheet
 * on request.
 */
export function useSheetSync({ db, setDb, accessToken, setAccessToken, setFetchError }: SheetSyncOptions) {
  const [loadingData, setLoadingData] = useState(false);
  const [syncingState, setSyncingState] = useState<SyncingState>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  // Why the last push failed, in terms of what the user must do; null while
  // syncing is healthy. Drives the banner and the automatic retries.
  const [syncErrorKind, setSyncErrorKind] = useState<SyncErrorKind | null>(null);
  const [nextRetryAt, setNextRetryAt] = useState<number | null>(null);
  const retryAttemptRef = useRef(0);
  const [conflictData, setConflictData] = useState<{
    isOpen: boolean;
    cloudData: LocalDatabase | null;
  }>({ isOpen: false, cloudData: null });
  // Signed in, but no ledger found in Drive — ask whether they are joining
  // one they were invited to or starting a fresh one, rather than silently
  // creating a blank spreadsheet on their behalf.
  const [needsSheetSetup, setNeedsSheetSetup] = useState(false);

  // Queue-based sync system that processes syncs serially, ensuring no data loss
  // from concurrent edits. syncQueueRef holds pending DB states; isSyncingRef
  // guards against overlapping pushes.
  const isSyncingRef = useRef(false);
  const syncQueueRef = useRef<LocalDatabase | null>(null);
  const isReconcilingRef = useRef(false);

  const syncDatabaseAcrossCloud = async (currentDb?: LocalDatabase) => {
    const dbToSync = currentDb || db;
    if (!accessToken || !dbToSync) return;

    if (loadingData) {
      console.log('Postponing cloud sync because database is currently loading data...');
      return;
    }

    const targetSheetId = dbToSync.settings?.linkedSpreadsheetId;
    if (!targetSheetId || isPlaceholderSpreadsheetId(targetSheetId)) {
      console.log('Postponing cloud sync because spreadsheet ID is absent or placeholder. Auto-fetch will resolve this.');
      return;
    }

    syncQueueRef.current = dbToSync;

    // If a sync is already in flight, the queued db will be processed after it completes
    if (isSyncingRef.current) {
      return;
    }

    // Start processing the queue serially
    const processQueue = async () => {
      while (syncQueueRef.current && accessToken) {
        const nextDb = syncQueueRef.current;
        syncQueueRef.current = null;
        isSyncingRef.current = true;
        setSyncingState('syncing');

        try {
          // Check the cloud state immediately before writing, not just once at
          // login — otherwise a teammate's concurrent edit gets silently
          // overwritten by our full-state push. A failed check here doesn't
          // block the push (fails open) so a transient network hiccup on the
          // check itself can't stall normal saving.
          let shouldPush = true;
          let cloudBeforePush: LocalDatabase | null = null;
          try {
            const cloudSnapshot = await pullDataFromSpreadsheet(accessToken, targetSheetId);
            if (cloudSnapshot) {
              const normalizedCloud = normalizeCloudDb(cloudSnapshot, nextDb, targetSheetId);
              cloudBeforePush = normalizedCloud;
              const decision = classifySync(normalizedCloud, nextDb, getLastSyncedFingerprint());

              if (decision === 'conflict') {
                setConflictData({ isOpen: true, cloudData: normalizedCloud });
                logWarning('sync_push_paused_for_conflict', 'Paused push to Sheets: cloud data changed since last sync', { sheetId: targetSheetId });
                setSyncErrorKind(null);
                setSyncingState('idle');
                break;
              }

              if (decision === 'adopt-cloud') {
                // The sheet already holds everything this browser has, so a
                // push could only overwrite it with staler data. That is what
                // made linking someone else's shared sheet destructive: a
                // partner who had just joined had nothing pending, and their
                // near-empty database was pushed straight over the shared
                // ledger. Take the cloud state instead of writing.
                if (!holdsSameRecords(normalizedCloud, nextDb)) {
                  saveDatabase(normalizedCloud);
                  setDb(normalizedCloud);
                }
                setLastSyncedFingerprint(normalizedCloud);
                setSyncErrorKind(null);
                retryAttemptRef.current = 0;
                setSyncingState('idle');
                shouldPush = false;
              }
            }
          } catch (checkErr) {
            // A failed check fails open: a transient network hiccup here
            // must not stall ordinary saving.
            logWarning('pre_push_conflict_check_failed', checkErr instanceof Error ? checkErr.message : String(checkErr), { sheetId: targetSheetId });
          }

          if (!shouldPush) {
            continue;
          }

          // Write only the tabs that changed since the last sync (or that
          // differ from what the check just read), not all fifteen.
          await pushDataToSpreadsheet(
            accessToken,
            targetSheetId,
            nextDb,
            collectionsToPush(nextDb, getLastSyncedFingerprint(), cloudBeforePush)
          );
          setLastSyncedFingerprint(nextDb);
          setSyncErrorKind(null);
          retryAttemptRef.current = 0;
          setSyncingState('success');
          setSyncMessage('Successfully synced with cloud Sheets!');
          setTimeout(() => setSyncingState('idle'), 3000);
        } catch (err: any) {
          logError('sync_to_sheets_failed', err, { sheetId: targetSheetId });
          const kind = classifySyncError(err, navigator.onLine);
          setSyncErrorKind(kind);
          setSyncingState('failed');
          setSyncMessage(err?.message || String(err));
          if (kind === 'auth') {
            // Keep the user in the app: their entries are saved locally and
            // they may be mid-way through more. Signing them out used to drop
            // them on the login screen with no word on why. The banner asks
            // them to sign in again instead; forgetting the stored token
            // means a reload asks too, rather than retrying a dead one.
            clearGoogleAccessToken();
          }
          // Re-queue the failed sync; the retry effect below sends it.
          syncQueueRef.current = nextDb;
          break;
        } finally {
          isSyncingRef.current = false;
        }
      }
    };

    processQueue();
  };

  // Background reconciliation: re-pulls the linked Sheet periodically so a
  // teammate's edits show up without a refresh, and so we're never more than
  // one poll interval stale before the pre-push conflict check runs. Skips
  // quietly while a push is in flight/queued (avoid racing our own write) or
  // the tab is backgrounded (avoid burning API calls for nothing).
  const reconcileWithCloud = async (targetSheetId: string) => {
    if (!accessToken || isReconcilingRef.current || isSyncingRef.current || syncQueueRef.current) return;
    isReconcilingRef.current = true;
    try {
      const sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId);
      if (!sheetData) return;
      setDb(prev => {
        const base = prev || getInitialDatabase();
        const finalDb = normalizeCloudDb(sheetData, base, targetSheetId);
        const decision = classifySync(finalDb, base, getLastSyncedFingerprint());
        if (decision === 'conflict') {
          setConflictData({ isOpen: true, cloudData: finalDb });
          return prev;
        }
        if (decision === 'keep-local') {
          // Cloud hasn't moved since our last known sync, but this browser has
          // unsynced local edits — keep them; the normal debounced push will
          // send them up rather than clobbering local state with a stale pull.
          return prev;
        }
        saveDatabase(finalDb);
        setLastSyncedFingerprint(finalDb);
        return finalDb;
      });
    } catch (err) {
      logWarning('background_reconcile_failed', err instanceof Error ? err.message : String(err), { sheetId: targetSheetId });
    } finally {
      isReconcilingRef.current = false;
    }
  };

  useEffect(() => {
    const targetSheetId = db?.settings?.linkedSpreadsheetId;
    if (!accessToken || !targetSheetId || isPlaceholderSpreadsheetId(targetSheetId)) return;

    const POLL_INTERVAL_MS = 45000;
    const intervalId = setInterval(() => {
      if (document.hidden) return;
      reconcileWithCloud(targetSheetId);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, db?.settings?.linkedSpreadsheetId]);

  useEffect(() => {
    if (accessToken) {
      const autoFetch = async () => {
        setLoadingData(true);
        setFetchError(null);
        try {
          let targetSheetId = db?.settings?.linkedSpreadsheetId;
          const isPlaceholder = isPlaceholderSpreadsheetId(targetSheetId);
          // Either a raw Sheets pull or a copy of the local db, depending on
          // which recovery branch below runs.
          let sheetData: any = null;

          // Find the user's existing 'FarmLedger Database' on Drive, and only
          // create one when Drive has definitively said there isn't one. A
          // search that *failed* throws out of here to the outer catch, so a
          // transient Drive error surfaces as an error instead of quietly
          // forking the ledger into a second spreadsheet.
          // Returns null when Drive has no ledger of ours — the caller then
          // stops and the setup prompt takes over. Creating one unasked is
          // what used to strand an invited partner in an empty app, and what
          // left the blank sheet their next device would later "find".
          const resolveSheet = async (): Promise<{ sheetId: string; data: any } | null> => {
            const foundId = await findExistingSpreadsheet(accessToken);
            if (foundId) {
              console.log(`Found existing spreadsheet: ${foundId}`);
              return { sheetId: foundId, data: await pullDataFromSpreadsheet(accessToken, foundId) };
            }
            console.log('No ledger found on Drive. Asking how to set one up...');
            setNeedsSheetSetup(true);
            return null;
          };

          if (!isPlaceholder) {
            try {
              sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId!);
            } catch (pullError) {
              logWarning('pull_from_sheets_failed', `Could not pull from spreadsheet ${targetSheetId}`, { sheetId: targetSheetId });
              console.warn(`Could not pull from spreadsheet ${targetSheetId}. Searching for 'FarmLedger Database'...`, pullError);
              const resolved = await resolveSheet();
              if (!resolved) return;
              targetSheetId = resolved.sheetId;
              sheetData = resolved.data;
            }
          } else {
            const resolved = await resolveSheet();
            if (!resolved) return;
            targetSheetId = resolved.sheetId;
            sheetData = resolved.data;
          }

          if (sheetData) {
            const currentLocalDb = db || getInitialDatabase();
            const isSheetDataEmpty = 
              (!sheetData.members || sheetData.members.length === 0) &&
              (!sheetData.fields || sheetData.fields.length === 0) &&
              (!sheetData.seasons || sheetData.seasons.length === 0) &&
              (!sheetData.expenses || sheetData.expenses.length === 0);

            const isLocalDataNotEmpty = 
              (currentLocalDb.members && currentLocalDb.members.length > 0) ||
              (currentLocalDb.fields && currentLocalDb.fields.length > 0) ||
              (currentLocalDb.seasons && currentLocalDb.seasons.length > 0);

            if (isSheetDataEmpty && !isLocalDataNotEmpty && !hasChosenLedger()) {
              // A ledger was found, but there is nothing in it and nothing on
              // this device either — so it tells the user nothing. The usual
              // cause is a blank sheet the app created for this account back
              // when it created one unasked; an invited partner would
              // otherwise sit in an empty app with no hint that their farm's
              // records are one link away. Ask, rather than show them
              // nothing. Anyone who has already settled the question (linked,
              // created, or chose to stay offline) is never asked again.
              logWarning('empty_ledger_prompting_setup', 'Linked ledger is empty and so is this device', { sheetId: targetSheetId });
              setNeedsSheetSetup(true);
            }

            if (isSheetDataEmpty && isLocalDataNotEmpty) {
              console.log("Newly linked Google Sheet is empty, but local database has valuable offline records. Pushing local state to Sheets to prevent data clearing...");
              await pushDataToSpreadsheet(accessToken, targetSheetId!, currentLocalDb);
              sheetData = {
                ...currentLocalDb,
              };
            }

            setDb(prev => {
              const base = prev || getInitialDatabase();
              const finalDb = normalizeCloudDb(sheetData, base, targetSheetId!);

              // Reconcile against the last state this browser is known to have
              // agreed with the cloud on. Without that, a stale local cache
              // (e.g. reopening the app after other edits happened elsewhere)
              // reads as a "conflict" every time, when it's really just this
              // browser's cache being behind — which should silently adopt the
              // cloud data, not prompt the user.
              if (prev) {
                const decision = classifySync(finalDb, prev, getLastSyncedFingerprint());
                if (decision === 'conflict') {
                  setConflictData({ isOpen: true, cloudData: finalDb });
                  return prev;
                }
                if (decision === 'keep-local') {
                  return prev;
                }
              }

              saveDatabase(finalDb);
              setLastSyncedFingerprint(finalDb);
              return finalDb;
            });
          } else {
            throw new Error("No data returned from Google Sheets layout reader.");
          }
        } catch (err: any) {
          console.error("Autopull on login failed:", err);
          const errMsg = err.message || String(err);
          const isAuthError = errMsg.includes("401") || 
                              errMsg.toLowerCase().includes("unauthenticated") || 
                              errMsg.toLowerCase().includes("invalid credentials") ||
                              errMsg.toLowerCase().includes("unauthorized-domain") ||
                              errMsg.toLowerCase().includes("auth/");
          if (isAuthError) {
            setFetchError("session-expired");
            clearGoogleAccessToken();
            setAccessToken(null);
          } else {
            setFetchError(errMsg);
            setSyncErrorKind(classifySyncError(err, navigator.onLine));
            setSyncingState('failed');
            setSyncMessage(errMsg);
            // We do NOT clear or set accessToken to null so they stay logged in inside the app
          }
        } finally {
          setLoadingData(false);
        }
      };
      autoFetch();
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || !db) return;
    if (loadingData) return;

    // Debounce pushing data to Google Sheets after making changes
    const delayDebounceFn = setTimeout(() => {
      syncDatabaseAcrossCloud(db);
    }, 1500); // 1.5 second debounce

    return () => clearTimeout(delayDebounceFn);
  }, [db, accessToken, loadingData]);

  // Records added, edited or deleted here that the sheet does not have yet.
  // Recomputed when a sync settles too, since a push moves the baseline
  // without changing db.
  const pendingChanges = useMemo(() => {
    if (!db || !db.settings?.linkedSpreadsheetId || isPlaceholderSpreadsheetId(db.settings.linkedSpreadsheetId)) return 0;
    return countUnsyncedChanges(db, getLastSyncedFingerprint());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, syncingState]);
  const pendingChangesRef = useRef(0);
  pendingChangesRef.current = pendingChanges;

  // Always the latest closure, for listeners registered once.
  const retrySyncNowRef = useRef<() => void>(() => {});
  retrySyncNowRef.current = () => {
    if (!db || isSyncingRef.current) return;
    syncDatabaseAcrossCloud(db);
  };

  // Retry a failed push on its own, backing off 10s → 5min. Nothing used to
  // resend it until the user happened to make another edit or found Sync
  // Now. An expired sign-in or a missing share would only fail again, so
  // those wait for the user; being offline waits for the 'online' event.
  useEffect(() => {
    if (syncingState !== 'failed' || !syncErrorKind || !accessToken) {
      setNextRetryAt(null);
      return;
    }
    // A phone that knows it is offline waits for the 'online' event; a flaky
    // connection that still reports itself online gets the timer.
    if (!isRetryable(syncErrorKind) || (syncErrorKind === 'offline' && !navigator.onLine)) {
      setNextRetryAt(null);
      return;
    }
    const delay = retryDelayMs(retryAttemptRef.current);
    setNextRetryAt(Date.now() + delay);
    const id = setTimeout(() => {
      retryAttemptRef.current += 1;
      setNextRetryAt(null);
      retrySyncNowRef.current();
    }, delay);
    return () => clearTimeout(id);
  }, [syncingState, syncErrorKind, accessToken]);

  // Send whatever is pending the moment the phone is back online or the app
  // comes back to the foreground — the usual end of a dead-zone in the field.
  useEffect(() => {
    const resume = () => {
      if (document.hidden) return;
      if (syncQueueRef.current || pendingChangesRef.current > 0) retrySyncNowRef.current();
    };
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);

  // Warn before the tab closes with changes the sheet does not have. They
  // are safe on this device, but a partner reading the sheet would not see
  // them until this device opens the app again.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!accessToken) return;
      if (pendingChangesRef.current > 0 || isSyncingRef.current || syncQueueRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [accessToken]);

  /** Makes `sheetId` this device's ledger: loads its records, records the
   * sync baseline so the next push can't overwrite it, and clears the setup
   * prompt. Shared by both setup choices and by Settings. */
  const adoptSpreadsheet = async (token: string, sheetId: string) => {
    const sheetData = await pullDataFromSpreadsheet(token, sheetId);
    if (!sheetData) {
      throw new Error('That spreadsheet could not be read. Check the link and try again.');
    }
    const finalDb = normalizeCloudDb(sheetData, db || getInitialDatabase(), sheetId);
    saveDatabase(finalDb);
    setLastSyncedFingerprint(finalDb);
    setDb(finalDb);
    rememberLedgerChoice();
    setNeedsSheetSetup(false);
  };

  const handleLinkExistingSheet = async (rawInput: string) => {
    if (!accessToken) throw new Error('Sign in with Google first, then link the ledger.');

    const sheetId = extractSpreadsheetId(rawInput);
    if (!sheetId) {
      throw new Error("That doesn't look like a Google Sheet. Paste the sheet's link, or just its ID.");
    }

    try {
      // Confirms this account can actually open it, so a share that was
      // never granted fails here with a clear reason instead of halfway
      // through a pull.
      await fetchSpreadsheetTitle(accessToken, sheetId);
      await adoptSpreadsheet(accessToken, sheetId);
    } catch (err) {
      logWarning('link_existing_sheet_failed', describeSheetLinkError(err), { sheetId });
      throw new Error(describeSheetLinkError(err));
    }
  };

  /** Opens Drive's chooser. Picking there also grants this app durable
   * access to that file, so later devices find it by search alone. */
  const handleBrowseDrive = async (): Promise<string | null> => {
    if (!accessToken) throw new Error('Sign in with Google first, then browse your Drive.');
    try {
      return await pickSpreadsheet(accessToken);
    } catch (err) {
      logWarning('drive_picker_failed', err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleCreateNewSheet = async () => {
    if (!accessToken) throw new Error('Sign in with Google first, then create the ledger.');
    try {
      const newId = await createSpreadsheet(accessToken);
      await pushDataToSpreadsheet(accessToken, newId, db || getInitialDatabase());
      await adoptSpreadsheet(accessToken, newId);
    } catch (err) {
      logError('create_new_sheet_failed', err instanceof Error ? err : new Error(String(err)));
      throw new Error(describeSheetLinkError(err));
    }
  };

  // ACTIONS: Google Sheets pull Trigger
  const handleTriggerPull = async (accessToken: string, spreadsheetId: string) => {
    const sheetData = await pullDataFromSpreadsheet(accessToken, spreadsheetId);
    if (sheetData) {
      // Go through the same normalizer as the login pull and the background
      // reconciler so a manual pull can't leave the three paths disagreeing
      // about what the cloud holds.
      const pulledDb = normalizeCloudDb(sheetData, db || getInitialDatabase(), spreadsheetId);
      const finalDb = addAuditLog(
        pulledDb,
        'edit',
        'Database',
        spreadsheetId,
        `Overrode local state storage by pulling data from linked Google Sheet: "${spreadsheetId}"`
      );
      // Without this the next background reconcile compares the freshly
      // pulled data against a pre-pull fingerprint and reports a false
      // conflict.
      setLastSyncedFingerprint(finalDb);
      setDb(finalDb);
    }
  };

  const handleResolveConflict = (resolution: 'local' | 'cloud' | 'merge') => {
    const cloudData = conflictData.cloudData;
    if (!cloudData || !db) {
      setConflictData({ isOpen: false, cloudData: null });
      return;
    }

    let finalDb: LocalDatabase = db;

    if (resolution === 'cloud') {
      // Use cloud version entirely
      finalDb = cloudData;
    } else if (resolution === 'merge') {
      // Smart merge: keep new local entries, accept cloud updates
      finalDb = {
        ...cloudData,
        // Merge expenses: keep local additions, accept cloud updates
        expenses: [
          ...cloudData.expenses,
          ...(db.expenses || []).filter(
            local => !cloudData.expenses?.some(cloud => cloud.id === local.id)
          )
        ],
        // Merge labour entries
        labours: [
          ...cloudData.labours,
          ...(db.labours || []).filter(
            local => !cloudData.labours?.some(cloud => cloud.id === local.id)
          )
        ],
        // Keep local revenues too
        revenues: [
          ...cloudData.revenues,
          ...(db.revenues || []).filter(
            local => !cloudData.revenues?.some(cloud => cloud.id === local.id)
          )
        ]
      };
      logWarning('conflict_resolved_merge', 'Merged local and cloud data');
    }
    // else: keep local (do nothing)

    setDb(finalDb);
    saveDatabase(finalDb);
    // Whatever the user picked is now this browser's agreed-upon state with
    // the cloud (the next push will reconcile "local" back up; "cloud"/"merge"
    // already reflect it) — record it so future opens don't re-flag the same
    // resolved difference as a conflict again.
    setLastSyncedFingerprint(finalDb);
    setConflictData({ isOpen: false, cloudData: null });

    if (resolution !== 'local') {
      logWarning('conflict_resolved', `Conflict resolved using: ${resolution}`, {
        resolution,
        cloudEntriesMerged: resolution === 'merge'
      });
    }
  };

  return {
    loadingData,
    syncingState,
    syncMessage,
    syncErrorKind,
    nextRetryAt,
    pendingChanges,
    retrySyncNowRef,
    syncDatabaseAcrossCloud,
    conflictData,
    setConflictData,
    handleResolveConflict,
    needsSheetSetup,
    setNeedsSheetSetup,
    handleLinkExistingSheet,
    handleBrowseDrive,
    handleCreateNewSheet,
    handleTriggerPull
  };
}
