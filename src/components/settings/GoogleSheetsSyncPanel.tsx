/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { User } from 'firebase/auth';
import { Settings } from '../../types';
import { safeStorageSet, safeStorageRemove } from '../../utils/database';
import { Cloud, CheckCircle, ExternalLink, RefreshCw, Download, Eye } from 'lucide-react';

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

interface GoogleSheetsSyncPanelProps {
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
  user: User | null;
  onLogin: (mode?: 'popup' | 'redirect') => Promise<string | null>;
  onLogout: () => Promise<void>;
  linkedSheetId: string;
  onLinkedSheetIdChange: (value: string) => void;
  customAccessToken: string;
  onCustomAccessTokenChange: (value: string) => void;
  customFirebaseConfig: string;
  onCustomFirebaseConfigChange: (value: string) => void;
  statusMessage: string;
  syncStatus: 'idle' | 'authorizing' | 'syncing' | 'success' | 'failed';
  onSync: () => void;
  onPull: () => void;
}

export const GoogleSheetsSyncPanel: React.FC<GoogleSheetsSyncPanelProps> = ({
  settings,
  onSaveSettings,
  user,
  onLogin,
  onLogout,
  linkedSheetId,
  onLinkedSheetIdChange,
  customAccessToken,
  onCustomAccessTokenChange,
  customFirebaseConfig,
  onCustomFirebaseConfigChange,
  statusMessage,
  syncStatus,
  onSync,
  onPull
}) => {
  return (
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
                  onLinkedSheetIdChange(nextId);
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
                      onCustomAccessTokenChange(e.target.value.trim());
                      safeStorageSet('farmledger_custom_access_token', e.target.value.trim());
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
                      onCustomFirebaseConfigChange(val);
                      safeStorageSet('farmledger_custom_firebase_config', val.trim());
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
                            onCustomFirebaseConfigChange('');
                            safeStorageRemove('farmledger_custom_firebase_config');
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
              onClick={onSync}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/10 active:scale-95 cursor-pointer transition-all"
            >
              <RefreshCw size={14} className={syncStatus === 'syncing' ? 'animate-spin' : ''} />
              <span>Synchronize (Push Local to Sheets)</span>
            </button>

            <button
              onClick={onPull}
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
  );
};
