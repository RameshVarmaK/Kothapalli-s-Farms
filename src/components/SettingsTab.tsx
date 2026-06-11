/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Settings, AuditLog, Member } from '../types';
import { exportDatabaseJSON } from '../utils/database';
import { findExistingSpreadsheet, createSpreadsheet, pushDataToSpreadsheet, pullDataFromSpreadsheet } from '../utils/googleSheets';
import { Cloud, CheckCircle, ExternalLink, RefreshCw, Key, Download, Upload, Eye, FileText, AlertTriangle, GitMerge, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

const formatErrorTextWithLinks = (text: string) => {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      const hrefValue = part.replace(/[.,;"]$/, '');
      return (
        <a
          key={index}
          href={hrefValue}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-950 hover:text-black underline font-black inline-flex items-center gap-1 bg-white border border-indigo-200 px-2 py-1 rounded ml-1 hover:shadow-xs transition-all animate-bounce"
        >
          Enable Sheets API ↗
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

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
  onLogout
}) => {
  const [currency, setCurrency] = useState(settings.currency);
  const [showPullConfirm, setShowPullConfirm] = useState(false);
  const [conflictData, setConflictData] = useState<{
    local: any;
    cloud: any;
    diffDetails: { [key: string]: { localCount: number; cloudCount: number } };
  } | null>(null);
  const [showConflictModal, setShowConflictModal] = useState(false);

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
  const [linkedSheetId, setLinkedSheetId] = useState(settings.linkedSpreadsheetId || '1r820DlxdJEOZTYhh1DxGXdyv121d6isnFXix-n_C-Ts');
  const [customFirebaseConfig, setCustomFirebaseConfig] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'authorizing' | 'syncing' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    // Attempt to read custom credentials stored in localstorage
    const cid = localStorage.getItem('farmledger_custom_client_id') || '';
    const token = localStorage.getItem('farmledger_custom_access_token') || '';
    const fconf = localStorage.getItem('farmledger_custom_firebase_config') || '';
    setCustomClientId(cid);
    setCustomAccessToken(token);
    setCustomFirebaseConfig(fconf);
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
    alert('General preferences updated successfully!');
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
          alert('Database restored successfully from backup JSON! All calculations updated.');
        } else {
          alert('Invalid file format. Ensure it is a valid FarmLedger backup JSON.');
        }
      } catch (err) {
        alert('Could not parse JSON. Check the file content.');
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
      localStorage.setItem('farmledger_custom_access_token', customAccessToken);
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
      alert('Requires an active Access Token (or active Google Sign-In) and linked Spreadsheet ID to pull data.');
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
        {/* Unit and Currency Preference */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-4">Localization Preferences</h3>
          <form onSubmit={handleSavePreferences} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Currency Indicator</label>
                <select
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-750 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="₹">₹ INR (Rupees)</option>
                  <option value="$">$ USD (Dollars)</option>
                  <option value="€">€ EUR (Euro)</option>
                  <option value="£">£ GBP (Pence)</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Plot Area unit</label>
                <select
                  value={areaUnit}
                  onChange={e => setAreaUnit(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-750 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="acres">Acres</option>
                  <option value="hectares">Hectares</option>
                  <option value="bighas">Bighas</option>
                  <option value="cents">Cents</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer active:scale-95 transition-all"
            >
              Update Preferences
            </button>
          </form>
        </div>

        {/* Offline Backup file Operations */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold text-sm text-slate-800 mb-4">Offline Data Maintenance</h3>
          <p className="text-[11px] text-slate-400 leading-relaxed mb-5 font-medium">
            None of your financial records leave your device by default. Export local databases to save snapshots or import files to switch devices.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleJSONExport}
              className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-slate-250 text-xs font-bold text-slate-600 hover:bg-slate-50 bg-white shadow-2xs cursor-pointer"
            >
              <Download size={14} className="text-slate-400" />
              <span>Backup JSON</span>
            </button>

            <label className="flex items-center justify-center gap-1.5 p-3 rounded-xl border border-dashed border-emerald-300 text-xs font-bold text-emerald-800 bg-emerald-50/20 hover:bg-emerald-50/40 cursor-pointer text-center">
              <Upload size={14} />
              <span>Restore Backup</span>
              <input
                type="file"
                accept=".json"
                onChange={handleJSONImport}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* GOOGLE SHEETS LIVE STORAGE SYNC HUB */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <span className="p-3 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
            <Cloud size={24} />
          </span>
          <div>
            <h3 className="font-bold text-slate-800 text-sm leading-snug">
              Google Sheets Database Sync
            </h3>
            <p className="text-[10px] text-slate-400 mt-1 font-bold uppercase tracking-wider">
              Maintains full bookkeeping rows on Google Sheets. Share a spreadsheet to facilitate multi-partner audit tracking.
            </p>
          </div>
        </div>

        {statusMessage && (
          <div className={`p-4 rounded-xl text-[11px] flex items-center justify-between font-bold border ${
            syncStatus === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-100' :
            syncStatus === 'failed' ? 'bg-red-50 text-red-800 border-red-100' : 'bg-blue-50 text-blue-700 border-blue-100'
          }`}>
            <span>{formatErrorTextWithLinks(statusMessage)}</span>
            {syncStatus === 'success' && <CheckCircle size={16} className="text-emerald-700 shrink-0" />}
          </div>
        )}

        <div id="google-sheets-sync-dashboard" className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-100">
          {/* Cloud configuration */}
          <div className="space-y-4 text-xs text-slate-700">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">GCP OAuth Configuration</span>
            
            <div className="space-y-4">
              <div id="spreadsheet-id-panel">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Spreadsheet ID</label>
                <input
                  id="spreadsheet-id-input"
                  type="text"
                  value={linkedSheetId}
                  onChange={e => {
                    const nextId = e.target.value.trim();
                    setLinkedSheetId(nextId);
                    onSaveSettings({
                      ...settings,
                      linkedSpreadsheetId: nextId
                    });
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 font-semibold focus:outline-none select-all focus:border-emerald-500"
                />
                <p className="mt-1 text-[10px] text-slate-400 font-medium leading-normal">
                  Enter your custom Google Sheet ID to sync with your private Google Drive database.
                </p>
              </div>

              {/* Google Sign-In Active State */}
              <div id="google-auth-status-container" className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Google Authorization State</span>
                  <span className={`h-1.5 w-1.5 rounded-full ${user ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                </div>

                {user ? (
                  <div id="auth-user-profile" className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="Google Avatar" className="w-9 h-9 rounded-full border border-slate-200 shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                          {user.displayName?.charAt(0) || user.email?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-slate-800 truncate text-[11px]">{user.displayName || 'Authorised User'}</div>
                        <div className="text-slate-400 text-[10px] truncate font-mono">{user.email}</div>
                      </div>
                    </div>
                    <button
                      id="google-signout-btn"
                      onClick={onLogout}
                      className="px-2.5 py-1 text-[9px] bg-white border border-slate-250 hover:bg-slate-50 text-slate-600 font-bold rounded-lg cursor-pointer transition-colors shrink-0"
                    >
                      Disconnect
                    </button>
                  </div>
                ) : (
                  <div id="auth-login-action" className="space-y-4">
                    <p className="text-[10px] text-slate-400 leading-normal mb-1">
                      Integrate your Google Account directly to sync with Drive and Sheets safely:
                    </p>
                    <div className="flex flex-col gap-2.5">
                      <button
                        id="google-signin-btn"
                        onClick={() => onLogin('popup')}
                        className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 active:scale-95 transition-all shadow-3xs cursor-pointer"
                      >
                        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                        </svg>
                        <span>Sign in with Google (Popup Window)</span>
                      </button>

                      <button
                        id="google-signin-redirect-btn"
                        onClick={() => onLogin('redirect')}
                        className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold active:scale-95 transition-all shadow-3xs cursor-pointer"
                      >
                        <RefreshCw size={14} className="text-emerald-700 animate-spin-hover shrink-0" />
                        <span>Sign in with Google (Full-Page Redirect)</span>
                      </button>
                    </div>
                    <p className="text-[9.5px] text-slate-400 leading-normal mt-1 font-medium bg-slate-50 p-3 rounded-lg border border-slate-150">
                      💡 <strong>Vercel & Safari Note:</strong> If the popup dialog closes immediately, use <strong>Full-Page Redirect</strong>. Popups on custom domains frequently hit browser cookie-sandbox blocks.
                    </p>
                  </div>
                )}
              </div>

              {/* Collapsible Manual Access Token Override */}
              <div id="manual-token-override" className="pt-2 border-t border-slate-100">
                <details className="group">
                  <summary className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer list-none flex items-center justify-between select-none">
                    <span>Manual Access Token Override</span>
                    <span className="transition-transform group-open:rotate-180">↓</span>
                  </summary>
                  <div className="pt-3 space-y-2">
                    <label className="block text-[9px] font-bold text-slate-400 mb-1 flex justify-between uppercase tracking-widest">
                      <span>Google APIs Access Token</span>
                      <a href="https://developers.google.com/oauthplayground" target="_blank" rel="noreferrer" className="text-[9px] text-emerald-700 font-bold inline-flex items-center gap-0.5 hover:underline">
                        Get temporary Token <ExternalLink size={10} />
                      </a>
                    </label>
                    <input
                      id="manual-access-token-input"
                      type="password"
                      placeholder="Paste ya_29_... temporary tokens"
                      value={customAccessToken}
                      onChange={e => {
                        setCustomAccessToken(e.target.value.trim());
                        localStorage.setItem('farmledger_custom_access_token', e.target.value.trim());
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-705 font-mono"
                    />
                    <p className="text-[9px] text-slate-400 leading-normal font-medium">
                      If popups are disabled or blockages exist in sandbox layers, paste a temporary Google OAuth access token to override.
                    </p>
                  </div>
                </details>
              </div>

              {/* Collapsible Custom Firebase Config Override */}
              <div id="custom-firebase-override" className="pt-2 border-t border-slate-100">
                <details className="group">
                  <summary className="text-[10px] font-bold text-slate-400 hover:text-slate-600 cursor-pointer list-none flex items-center justify-between select-none">
                    <span>Custom Firebase Configuration Override</span>
                    <span className="transition-transform group-open:rotate-180">↓</span>
                  </summary>
                  <div className="pt-3 space-y-3">
                    <label className="block text-[9px] font-bold text-slate-400 mb-1 flex justify-between uppercase tracking-widest">
                      <span>Firebase Config JSON Object</span>
                    </label>
                    <textarea
                      id="custom-firebase-json-input"
                      rows={5}
                      placeholder='{&#10;  "apiKey": "...",&#10;  "authDomain": "...",&#10;  "projectId": "...",&#10;  "storageBucket": "...",&#10;  "messagingSenderId": "...",&#10;  "appId": "..."&#10;}'
                      value={customFirebaseConfig}
                      onChange={e => {
                        const val = e.target.value;
                        setCustomFirebaseConfig(val);
                        localStorage.setItem('farmledger_custom_firebase_config', val.trim());
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-705 font-mono leading-relaxed"
                    />
                    <p className="text-[9px] text-slate-400 leading-normal font-medium">
                      If you deploy this application standalone to your own server or Vercel, paste your own Firebase Config JSON above. 
                      This allows you to bypass the shared AI Studio sandbox limits, whitelisting your custom domain in your own Firebase project.
                    </p>
                    {customFirebaseConfig ? (
                       <div className="flex gap-2">
                         <button
                           type="button"
                           onClick={() => {
                             if (confirm("Apply custom Firebase configuration? The page will reload.")) {
                               window.location.reload();
                             }
                           }}
                           className="px-3 py-1.5 text-[9px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer transition-colors"
                         >
                           Apply & Reload App
                         </button>
                         <button
                           type="button"
                           onClick={() => {
                             if (confirm("Reset to default AI Studio Firebase project settings? The page will reload.")) {
                               setCustomFirebaseConfig('');
                               localStorage.removeItem('farmledger_custom_firebase_config');
                               window.location.reload();
                             }
                           }}
                           className="px-3 py-1.5 text-[9px] bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-bold rounded-lg cursor-pointer transition-colors"
                         >
                           Reset to Default
                         </button>
                       </div>
                    ) : null}
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* Cloud synchronization operations */}
          <div className="space-y-4 text-xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Trigger Cloud Operations</span>

            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <button
                onClick={handleGoogleAuthAndSync}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 active:scale-95 cursor-pointer transition-all"
              >
                <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
                <span>Synchronize (Push Local to Sheets)</span>
              </button>

              <button
                onClick={handleGooglePull}
                className="w-full py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-250 font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer shadow-3xs transition-all"
              >
                <Download size={14} />
                <span>Pull Spreadsheet (Overwrite Local)</span>
              </button>
            </div>

            {linkedSheetId && (
              <a
                href={`https://docs.google.com/spreadsheets/d/${linkedSheetId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 hover:underline"
              >
                <Eye size={12} />
                <span>Open Linked Spreadsheet on Google Sheets</span>
              </a>
            )}
          </div>
        </div>
      </div>

      {/* AUDIT LOG TRAIL TABLE */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-slate-400" />
            <h3 className="font-bold text-sm text-slate-800">Transactional Audit Logs</h3>
          </div>
          <span className="text-[10px] text-slate-450 font-bold bg-slate-100 px-2.5 py-1 rounded-full uppercase tracking-wider">Bookkeeping Log Trail</span>
        </div>

        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 font-bold text-[9px] uppercase tracking-widest bg-slate-50/50">
                <th className="px-6 py-3">Timestamp</th>
                <th className="px-6 py-3">Action</th>
                <th className="px-6 py-3">EntityType</th>
                <th className="px-6 py-3">Change Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
              {auditLogs.map(log => {
                const dateClean = new Date(log.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' ' + new Date(log.timestamp).toLocaleDateString('en-IN');
                return (
                  <tr key={log.id} className="hover:bg-slate-50/10">
                    <td className="px-6 py-3.5 font-bold text-[10px] text-slate-400 font-mono whitespace-nowrap">{dateClean}</td>
                    <td className="px-6 py-3.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        log.actionType === 'create' ? 'bg-emerald-50 text-emerald-850 border-emerald-100' :
                        log.actionType === 'edit' ? 'bg-blue-50 text-blue-800 border-blue-100' :
                        'bg-red-50 text-red-800 border-red-100'
                      }`}>
                        {log.actionType}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 font-bold text-[10px] text-slate-700">{log.entityType}</td>
                    <td className="px-6 py-3.5 text-slate-500 leading-relaxed text-[11px]">{log.description}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showPullConfirm && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl max-w-sm w-full shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3 text-amber-605 mb-3">
                <AlertTriangle size={24} className="stroke-[2.5] text-amber-500" />
                <h3 className="font-extrabold text-slate-900 text-sm">Force Overwrite Local Database?</h3>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed font-semibold mt-2">
                We analyzed Google Sheets and found no differences, but you can still run a manual refresh. This will <span className="text-red-600 font-bold">OVERWRITE</span> your local database.
              </p>
            </div>
            <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => setShowPullConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeGooglePull}
                className="px-5 py-2 text-xs font-extrabold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Force Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {showConflictModal && conflictData && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-100">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-5 bg-amber-50 border-b border-amber-100 flex items-start gap-4">
              <div className="p-2 bg-amber-100 rounded-2xl text-amber-600 shrink-0">
                <AlertTriangle size={24} className="stroke-[2.5]" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-900 text-base">Google Sheets Conflict Detected</h3>
                <p className="text-slate-650 text-xs font-semibold mt-1 leading-relaxed">
                  The local database on this device differs from the version saved in your linked Google Sheet. Select a synchronization strategy to resolve this inconsistency.
                </p>
              </div>
            </div>

            {/* Content: DB Comparison */}
            <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
              {/* Columns Side by Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Local DB */}
                <div className="p-4 rounded-2xl border border-slate-150 bg-slate-50/50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-700">This Device (Local)</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 font-semibold text-[11px]">
                    <p className="flex justify-between gap-2">
                      <span className="text-slate-400">Latest Action:</span>
                      <span className="text-slate-800 text-right max-w-[150px] truncate" title={conflictData.local.auditLogs?.[0]?.description || 'Initial Database State'}>
                        {conflictData.local.auditLogs?.[0]?.description || 'Initial Database State'}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">Action Type:</span>
                      <span className="text-slate-800 font-mono text-[10px] uppercase bg-slate-100 px-1.5 rounded">
                        {conflictData.local.auditLogs?.[0]?.actionType || 'none'}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">Timestamp:</span>
                      <span className="text-slate-800 font-mono text-[10px]">
                        {conflictData.local.auditLogs?.[0]?.timestamp 
                          ? new Date(conflictData.local.auditLogs[0].timestamp).toLocaleTimeString() + ' ' + new Date(conflictData.local.auditLogs[0].timestamp).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Cloud DB */}
                <div className="p-4 rounded-2xl border border-emerald-150 bg-emerald-50/10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-750">Google Sheet (Cloud)</span>
                  </div>
                  <div className="space-y-1.5 text-xs text-slate-600 font-semibold text-[11px]">
                    <p className="flex justify-between gap-2">
                      <span className="text-slate-400">Latest Action:</span>
                      <span className="text-slate-800 text-right max-w-[150px] truncate" title={conflictData.cloud.auditLogs?.[0]?.description || 'Initial Database State'}>
                        {conflictData.cloud.auditLogs?.[0]?.description || 'Initial Database State'}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">Action Type:</span>
                      <span className="text-slate-800 font-mono text-[10px] uppercase bg-slate-100 px-1.5 rounded">
                        {conflictData.cloud.auditLogs?.[0]?.actionType || 'none'}
                      </span>
                    </p>
                    <p className="flex justify-between">
                      <span className="text-slate-400">Timestamp:</span>
                      <span className="text-slate-800 font-mono text-[10px]">
                        {conflictData.cloud.auditLogs?.[0]?.timestamp 
                          ? new Date(conflictData.cloud.auditLogs[0].timestamp).toLocaleTimeString() + ' ' + new Date(conflictData.cloud.auditLogs[0].timestamp).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Difference breakdown checklist */}
              <div className="space-y-2">
                <h4 className="font-bold text-[10px] text-slate-450 uppercase tracking-widest">Detail Discrepancies</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {Object.entries(conflictData.diffDetails).map(([key, value]) => {
                    const typedVal = value as { localCount: number; cloudCount: number };
                    const isDiff = typedVal.localCount !== typedVal.cloudCount;
                    return (
                      <div 
                        key={key} 
                        className={`p-2 rounded-xl border flex flex-col justify-between text-xs transition-colors ${
                          isDiff ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100 bg-slate-50/30'
                        }`}
                      >
                        <span className="font-bold text-slate-500 capitalize text-[10px]">{key.replace(/([A-Z])/g, ' $1')}</span>
                        <div className="flex items-baseline gap-1 mt-1 font-mono text-xs">
                          <span className={`font-bold ${isDiff ? 'text-amber-700' : 'text-slate-700'}`}>
                            {typedVal.localCount}
                          </span>
                          <span className="text-[9px] text-slate-400">vs</span>
                          <span className={`font-bold ${isDiff ? 'text-amber-700' : 'text-slate-700'}`}>
                            {typedVal.cloudCount}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Action Buttons styled as cards to make it intuitive and clear */}
            <div className="px-6 py-6 bg-slate-50 border-t border-slate-100 space-y-3">
              {/* Option 1: Smart Merge (Recommended) */}
              <button
                type="button"
                onClick={resolveWithSmartMerge}
                className="w-full text-left p-4 bg-white hover:bg-emerald-50/10 border-2 border-emerald-600/30 hover:border-emerald-600 rounded-2xl flex gap-4 transition-all group shadow-sm cursor-pointer"
              >
                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-105 transition-transform shrink-0">
                  <GitMerge size={20} className="stroke-[2.5]" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-slate-900 text-xs sm:text-sm">Smart Merge Histories (Highly Recommended)</span>
                    <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-100 text-emerald-800 font-extrabold uppercase">Safe Sync</span>
                  </div>
                  <p className="text-slate-500 text-[10px] leading-relaxed mt-1 font-semibold">
                    Merges conflict items by their unique tracking IDs. Preserves non-overlapping changes from both this device and Google Sheets.
                  </p>
                </div>
              </button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Option 2: Cloud Wins */}
                <button
                  type="button"
                  onClick={resolveWithCloud}
                  className="text-left p-4 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-slate-400 rounded-2xl flex gap-3 transition-all group cursor-pointer"
                >
                  <div className="p-2 bg-slate-50 text-slate-500 group-hover:text-slate-950 rounded-xl shrink-0">
                    <ArrowDownCircle size={18} />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs">Keep Cloud (Overwrite Local)</span>
                    <p className="text-slate-500 text-[10px] leading-normal mt-1 font-medium">
                      Replaces this device database with the version on Google Sheets. Discards local edits.
                    </p>
                  </div>
                </button>

                {/* Option 3: Local Wins */}
                <button
                  type="button"
                  onClick={resolveWithLocal}
                  className="text-left p-4 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-slate-400 rounded-2xl flex gap-3 transition-all group cursor-pointer"
                >
                  <div className="p-2 bg-slate-50 text-slate-500 group-hover:text-slate-950 rounded-xl shrink-0">
                    <ArrowUpCircle size={18} />
                  </div>
                  <div>
                    <span className="font-extrabold text-slate-900 text-xs">Keep Local (Overwrite Cloud)</span>
                    <p className="text-slate-500 text-[10px] leading-normal mt-1 font-medium">
                      Pushes this device's state to Google Sheets, completely overwriting the spreadsheet.
                    </p>
                  </div>
                </button>
              </div>

              {/* Close Footer links */}
              <div className="flex justify-end pt-3 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setShowConflictModal(false);
                    setConflictData(null);
                  }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  Cancel & Postpone Resolution
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
