/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Settings, AuditLog, Member, NotificationPreferences, NotificationDelivery } from '../types';
import {
  exportDatabaseJSON,
  PLACEHOLDER_SPREADSHEET_ID,
  safeStorageGet,
  safeStorageSet,
} from '../utils/database';
import { findExistingSpreadsheet, createSpreadsheet, pushDataToSpreadsheet, pullDataFromSpreadsheet } from '../utils/googleSheets';
import { NotificationPreferencesPanel } from './NotificationPreferencesPanel';
import { NotificationDeliveryLog } from './NotificationDeliveryLog';
import { getNotificationDeliveries, clearNotificationDeliveries } from '../utils/notifications';
import { LocalizationPreferencesCard } from './settings/LocalizationPreferencesCard';
import { BackupRestoreCard } from './settings/BackupRestoreCard';
import { GoogleSheetsSyncPanel } from './settings/GoogleSheetsSyncPanel';
import { AuditLogTable } from './settings/AuditLogTable';
import { PullConfirmModal } from './settings/PullConfirmModal';
import { SheetsConflictModal } from './settings/SheetsConflictModal';

interface SettingsTabProps {
  settings: Settings;
  auditLogs: AuditLog[];
  members: Member[];
  onSaveSettings: (settings: Settings) => void;
  onImportDatabase: (data: any) => void;
  onTriggerSync: (accessToken: string, spreadsheetId: string) => Promise<void>;
  onTriggerPull: (accessToken: string, spreadsheetId: string) => Promise<void>;
  localData: any;
  user: User | null;
  accessToken: string | null;
  onLogin: (mode?: 'popup' | 'redirect') => Promise<string | null>;
  onLogout: () => Promise<void>;
  notificationPreferences?: NotificationPreferences[];
  onSaveNotificationPreferences?: (prefs: NotificationPreferences) => void;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  auditLogs,
  members,
  onSaveSettings,
  onImportDatabase,
  onTriggerSync,
  onTriggerPull,
  localData,
  user,
  accessToken,
  onLogin,
  onLogout,
  notificationPreferences = [],
  onSaveNotificationPreferences
}) => {
  const [currency, setCurrency] = useState(settings.currency);
  const [showPullConfirm, setShowPullConfirm] = useState(false);
  const [conflictData, setConflictData] = useState<{
    local: any;
    cloud: any;
    diffDetails: { [key: string]: { localCount: number; cloudCount: number } };
  } | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [deliveries, setDeliveries] = useState<NotificationDelivery[]>(getNotificationDeliveries());

  // Get current user's notification preference (using first member as proxy for now)
  const currentUserPref = members.length > 0
    ? notificationPreferences.find(p => p.memberId === members[0].id) || {
        memberId: members[0].id,
        channel: 'none' as const,
        enabledEvents: []
      }
    : null;

  const checkDatabaseDiff = (local: any, cloud: any) => {
    const tables = [
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
      'creditAccounts',
      'creditRepayments'
    ];

    let hasDiff = false;
    const diffDetails: { [key: string]: { localCount: number; cloudCount: number } } = {};

    tables.forEach(table => {
      const localCount = (local?.[table] || []).length;
      const cloudCount = (cloud?.[table] || []).length;
      if (localCount !== cloudCount) {
        hasDiff = true;
      }
      diffDetails[table] = { localCount, cloudCount };
    });

    if (!hasDiff) {
      for (const table of tables) {
        const localArr = local?.[table] || [];
        const cloudArr = cloud?.[table] || [];
        const localIds = new Set(localArr.map((x: any) => x?.id).filter(Boolean));
        const cloudIds = new Set(cloudArr.map((x: any) => x?.id).filter(Boolean));

        if (localIds.size !== cloudIds.size) {
          hasDiff = true;
          break;
        }

        for (const id of localIds) {
          if (!cloudIds.has(id)) {
            hasDiff = true;
            break;
          }
        }
        if (hasDiff) break;
      }
    }

    return { hasDiff, diffDetails };
  };

  const smartMergeDatabases = (local: any, cloud: any) => {
    const merged: any = {};
    const tables = [
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
      'creditAccounts',
      'creditRepayments',
      'auditLogs'
    ];

    tables.forEach(table => {
      const localArr = local?.[table] || [];
      const cloudArr = cloud?.[table] || [];
      const itemMap = new Map();

      // Cloud elements loaded first
      cloudArr.forEach((item: any) => {
        if (item && item.id) {
          itemMap.set(item.id, item);
        }
      });

      // Local elements merge and combine
      localArr.forEach((item: any) => {
        if (item && item.id) {
          const existing = itemMap.get(item.id);
          if (!existing) {
            itemMap.set(item.id, item);
          } else {
            const cloudDate = existing.timestamp || existing.date || '';
            const localDate = item.timestamp || item.date || '';

            if (cloudDate && localDate) {
              if (new Date(localDate) >= new Date(cloudDate)) {
                itemMap.set(item.id, { ...existing, ...item });
              } else {
                itemMap.set(item.id, { ...item, ...existing });
              }
            } else {
              itemMap.set(item.id, { ...existing, ...item });
            }
          }
        }
      });

      merged[table] = Array.from(itemMap.values());
    });

    merged.settings = {
      ...(cloud?.settings || {}),
      ...(local?.settings || {}),
    };

    return merged;
  };
  const [areaUnit, setAreaUnit] = useState(settings.areaUnit);
  const [customClientId, setCustomClientId] = useState('');
  const [customAccessToken, setCustomAccessToken] = useState('');
  const [linkedSheetId, setLinkedSheetId] = useState(settings.linkedSpreadsheetId || PLACEHOLDER_SPREADSHEET_ID);
  const [customFirebaseConfig, setCustomFirebaseConfig] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'authorizing' | 'syncing' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [preferencesMessage, setPreferencesMessage] = useState<{ text: string; isError: boolean } | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    // Attempt to read custom credentials stored in localstorage
    const cid = safeStorageGet('farmledger_custom_client_id') || '';
    const token = safeStorageGet('farmledger_custom_access_token') || '';
    const fconf = safeStorageGet('farmledger_custom_firebase_config') || '';
    setCustomClientId(cid);
    setCustomAccessToken(token);
    setCustomFirebaseConfig(fconf);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setDeliveries(getNotificationDeliveries());
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (settings.linkedSpreadsheetId) {
      setLinkedSheetId(settings.linkedSpreadsheetId);
    }
  }, [settings.linkedSpreadsheetId]);

  const handleSavePreferences = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      ...settings,
      currency,
      areaUnit
    });
    setPreferencesMessage({ text: 'General preferences updated successfully!', isError: false });
  };

  const handleJSONExport = () => {
    exportDatabaseJSON(localData);
  };

  const handleJSONImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (parsed.members && parsed.fields && parsed.seasons) {
          onImportDatabase(parsed);
          setBackupMessage({ text: 'Database restored successfully from backup JSON! All calculations updated.', isError: false });
        } else {
          setBackupMessage({ text: 'Invalid file format. Ensure it is a valid FarmLedger backup JSON.', isError: true });
        }
      } catch (err) {
        setBackupMessage({ text: 'Could not parse JSON. Check the file content.', isError: true });
      }
    };
    reader.readAsText(file);
  };

  // Google Rest API Sync handler
  const handleGoogleAuthAndSync = async () => {
    const activeToken = accessToken || customAccessToken;
    if (!activeToken) {
      // Prompt user to obtain token
      setSyncStatus('failed');
      setStatusMessage('Please sign in with Google or enter a Google OAuth Access Token.');
      return;
    }

    setSyncStatus('syncing');
    setStatusMessage('Searching files on Google Drive...');
    if (customAccessToken) {
      safeStorageSet('farmledger_custom_access_token', customAccessToken);
    }

    try {
      let sheetId = linkedSheetId;
      if (!sheetId) {
        // Search
        const found = await findExistingSpreadsheet(activeToken);
        if (found) {
          sheetId = found;
          setLinkedSheetId(found);
          setStatusMessage('Found existing FarmLedger Database Sheet on Drive.');
        } else {
          setStatusMessage('No Sheet found. Instantiating new FarmLedger Spreadsheet on Drive...');
          sheetId = await createSpreadsheet(activeToken);
          setLinkedSheetId(sheetId);
          setStatusMessage('New FarmLedger Database Spreadsheet instantiated on Drive.');
        }

        onSaveSettings({
          ...settings,
          googleDriveLinked: true,
          linkedSpreadsheetId: sheetId
        });
      }

      setStatusMessage('Writing ledger sheets, cell segments, and matrix structures...');
      await pushDataToSpreadsheet(activeToken, sheetId, localData);
      setSyncStatus('success');
      setStatusMessage('✓ Synchronization completed! Real-time snapshot is active in Google Sheets.');
    } catch (err: any) {
      console.error(err);
      setSyncStatus('failed');
      setStatusMessage(`Synchronization failed: ${err.message || String(err)}`);
    }
  };

  const handleGooglePull = async () => {
    const activeToken = accessToken || customAccessToken;
    if (!activeToken || !linkedSheetId) {
      setSyncStatus('failed');
      setStatusMessage('Requires an active Access Token (or active Google Sign-In) and linked Spreadsheet ID to pull data.');
      return;
    }

    setSyncStatus('syncing');
    setStatusMessage('Fetching cloud spreadsheet data for discrepancy check...');

    try {
      const cloudData = await pullDataFromSpreadsheet(activeToken, linkedSheetId);
      if (!cloudData) {
        throw new Error('Could not pull database snapshot from spreadsheet.');
      }

      const { hasDiff, diffDetails } = checkDatabaseDiff(localData, cloudData);

      if (!hasDiff) {
        setSyncStatus('success');
        setStatusMessage('✓ Local device and Cloud Sheets are in perfect harmony.');
        // Show normal overwrite modal anyway in case they want to run it anyway
        setShowPullConfirm(true);
      } else {
        setConflictData({
          local: localData,
          cloud: cloudData,
          diffDetails
        });
        setShowConflictModal(true);
        setSyncStatus('idle');
        setStatusMessage('⚠️ Discrepancy detected during pull! Resolution required.');
      }
    } catch (err: any) {
      console.error(err);
      setSyncStatus('failed');
      setStatusMessage(`Pull analysis failed: ${err.message || String(err)}`);
    }
  };

  const executeGooglePull = async () => {
    setShowPullConfirm(false);
    const activeToken = accessToken || customAccessToken;
    if (!activeToken || !linkedSheetId) return;

    setSyncStatus('syncing');
    setStatusMessage('Overwriting local state storage...');

    try {
      await onTriggerPull(activeToken, linkedSheetId);
      setSyncStatus('success');
      setStatusMessage('✓ Database pulled successfully! Current device is synced with Cloud Sheets.');
    } catch (err: any) {
      setSyncStatus('failed');
      setStatusMessage(`Pull failed: ${err.message || String(err)}`);
    }
  };

  const resolveWithCloud = () => {
    if (!conflictData) return;
    setShowConflictModal(false);

    setSyncStatus('syncing');
    setStatusMessage('Replacing local state with Cloud version...');

    try {
      const cloudWithSettings = {
        ...conflictData.cloud,
        settings: {
          ...localData.settings,
          ...conflictData.cloud.settings,
          googleDriveLinked: true,
          linkedSpreadsheetId: linkedSheetId
        }
      };

      onImportDatabase(cloudWithSettings);
      setConflictData(null);
      setSyncStatus('success');
      setStatusMessage('✓ Restored database using Cloud Sheets master version.');
    } catch (err: any) {
      setSyncStatus('failed');
      setStatusMessage(`Failed resolving with Cloud Sheets: ${err.message || String(err)}`);
    }
  };

  const resolveWithLocal = async () => {
    if (!conflictData) return;
    setShowConflictModal(false);

    const activeToken = accessToken || customAccessToken;
    if (!activeToken || !linkedSheetId) return;

    setSyncStatus('syncing');
    setStatusMessage('Pushing local device snapshot as Sovereign...');

    try {
      await pushDataToSpreadsheet(activeToken, linkedSheetId, localData);
      setConflictData(null);
      setSyncStatus('success');
      setStatusMessage('✓ Overrode Google Sheets with Local device version successfully.');
    } catch (err: any) {
      setSyncStatus('failed');
      setStatusMessage(`Failed resolving with Local: ${err.message || String(err)}`);
    }
  };

  const resolveWithSmartMerge = async () => {
    if (!conflictData) return;
    setShowConflictModal(false);

    const activeToken = accessToken || customAccessToken;
    if (!activeToken || !linkedSheetId) return;

    setSyncStatus('syncing');
    setStatusMessage('Combining local and cloud database records into unified timeline...');

    try {
      const mergedDb = smartMergeDatabases(localData, conflictData.cloud);

      // Save locally
      onImportDatabase(mergedDb);

      setStatusMessage('Writing merged database segments to linked Google Sheet...');
      await pushDataToSpreadsheet(activeToken, linkedSheetId, mergedDb);

      setConflictData(null);
      setSyncStatus('success');
      setStatusMessage('✓ Merge complete! Unified local and cloud databases. All devices fully aligned.');
    } catch (err: any) {
      console.error(err);
      setSyncStatus('failed');
      setStatusMessage(`Failed smart merging databases: ${err.message || String(err)}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Upper Preference Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <LocalizationPreferencesCard
          currency={currency}
          areaUnit={areaUnit}
          onCurrencyChange={setCurrency}
          onAreaUnitChange={setAreaUnit}
          preferencesMessage={preferencesMessage}
          onSubmit={handleSavePreferences}
        />

        <BackupRestoreCard
          backupMessage={backupMessage}
          onExport={handleJSONExport}
          onImport={handleJSONImport}
        />
      </div>

      <GoogleSheetsSyncPanel
        settings={settings}
        onSaveSettings={onSaveSettings}
        user={user}
        onLogin={onLogin}
        onLogout={onLogout}
        linkedSheetId={linkedSheetId}
        onLinkedSheetIdChange={setLinkedSheetId}
        customAccessToken={customAccessToken}
        onCustomAccessTokenChange={setCustomAccessToken}
        customFirebaseConfig={customFirebaseConfig}
        onCustomFirebaseConfigChange={setCustomFirebaseConfig}
        statusMessage={statusMessage}
        syncStatus={syncStatus}
        onSync={handleGoogleAuthAndSync}
        onPull={handleGooglePull}
      />

      <AuditLogTable auditLogs={auditLogs} />

      {/* NOTIFICATION SETTINGS */}
      {currentUserPref && members.length > 0 && (
        <div className="space-y-4">
          <NotificationPreferencesPanel
            member={members[0]}
            preference={currentUserPref}
            onSave={(prefs) => {
              if (onSaveNotificationPreferences) {
                onSaveNotificationPreferences(prefs);
              }
            }}
          />
          <NotificationDeliveryLog
            deliveries={deliveries}
            onClear={() => {
              clearNotificationDeliveries(30);
              setDeliveries(getNotificationDeliveries());
            }}
          />
        </div>
      )}

      {showPullConfirm && (
        <PullConfirmModal
          onCancel={() => setShowPullConfirm(false)}
          onConfirm={executeGooglePull}
        />
      )}

      {showConflictModal && conflictData && (
        <SheetsConflictModal
          conflictData={conflictData}
          onSmartMerge={resolveWithSmartMerge}
          onKeepCloud={resolveWithCloud}
          onKeepLocal={resolveWithLocal}
          onCancel={() => {
            setShowConflictModal(false);
            setConflictData(null);
          }}
        />
      )}
    </div>
  );
};
