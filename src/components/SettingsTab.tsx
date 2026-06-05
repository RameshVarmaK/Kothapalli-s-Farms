/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { Settings, AuditLog, Member } from '../types';
import { exportDatabaseJSON } from '../utils/database';
import { findExistingSpreadsheet, createSpreadsheet, pushDataToSpreadsheet, pullDataFromSpreadsheet } from '../utils/googleSheets';
import { Cloud, CheckCircle, ExternalLink, RefreshCw, Key, Download, Upload, Eye, FileText, AlertTriangle } from 'lucide-react';

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
  onLogin: () => Promise<string | null>;
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
  const [areaUnit, setAreaUnit] = useState(settings.areaUnit);
  const [customClientId, setCustomClientId] = useState('');
  const [customAccessToken, setCustomAccessToken] = useState('');
  const [linkedSheetId, setLinkedSheetId] = useState('1r820DlxdJEOZTYhh1DxGXdyv121d6isnFXix-n_C-Ts');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'authorizing' | 'syncing' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    // Attempt to read custom credentials stored in localstorage
    const cid = localStorage.getItem('farmledger_custom_client_id') || '';
    const token = localStorage.getItem('farmledger_custom_access_token') || '';
    setCustomClientId(cid);
    setCustomAccessToken(token);
  }, []);

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

  const handleGooglePull = () => {
    const activeToken = accessToken || customAccessToken;
    if (!activeToken || !linkedSheetId) {
      alert('Requires an active Access Token (or active Google Sign-In) and linked Spreadsheet ID to pull data.');
      return;
    }

    setShowPullConfirm(true);
  };

  const executeGooglePull = async () => {
    setShowPullConfirm(false);
    const activeToken = accessToken || customAccessToken;
    if (!activeToken || !linkedSheetId) return;

    setSyncStatus('syncing');
    setStatusMessage('Reading spreadsheet cells...');

    try {
      await onTriggerPull(activeToken, linkedSheetId);
      setSyncStatus('success');
      setStatusMessage('✓ Database pulled successfully! Current device is synced with Cloud Sheets.');
    } catch (err: any) {
      setSyncStatus('failed');
      setStatusMessage(`Pull failed: ${err.message || String(err)}`);
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
            <span>{statusMessage}</span>
            {syncStatus === 'success' && <CheckCircle size={16} className="text-emerald-700 shrink-0" />}
          </div>
        )}

        <div id="google-sheets-sync-dashboard" className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-5 border-t border-slate-100">
          {/* Cloud configuration */}
          <div className="space-y-4 text-xs text-slate-700">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">GCP OAuth Configuration</span>
            
            <div className="space-y-4">
              <div id="spreadsheet-id-panel">
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Spreadsheet ID (Hardcoded)</label>
                <input
                  id="spreadsheet-id-input"
                  type="text"
                  readOnly
                  value={linkedSheetId}
                  className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-500 font-semibold focus:outline-none cursor-not-allowed select-all"
                />
                <p className="mt-1 text-[10px] text-slate-400 font-medium leading-normal">
                  Hardcoded to Kothapalli's Farms master Google Sheets database sheet.
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
                  <div id="auth-login-action" className="space-y-2">
                    <p className="text-[10px] text-slate-400 leading-normal mb-1">
                      Integrate your Google Account directly to sync with Drive and Sheets safely:
                    </p>
                    <button
                      id="google-signin-btn"
                      onClick={onLogin}
                      className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold text-slate-700 active:scale-95 transition-all shadow-3xs cursor-pointer"
                    >
                      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 shrink-0">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                      <span>Sign in with Google</span>
                    </button>
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
                <h3 className="font-extrabold text-slate-900 text-sm">Overwrite Local Database?</h3>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed font-semibold mt-2">
                Pulling will <span className="text-red-600 font-bold">OVERWRITE</span> your current local database with the values from Google Sheets. This action is irreversible.
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
                Pull & Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
