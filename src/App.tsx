/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, Suspense, lazy } from 'react';
import {
  LocalDatabase,
  PLACEHOLDER_SPREADSHEET_ID
} from './utils/database';
import { NotificationPreferences } from './types';
// Lazy-load tabs for better initial load performance
const DashboardTab = lazy(() => import('./components/DashboardTab').then(m => ({ default: m.DashboardTab })));
const MoneyTab = lazy(() => import('./components/MoneyTab').then(m => ({ default: m.MoneyTab })));
const StockTab = lazy(() => import('./components/StockTab').then(m => ({ default: m.StockTab })));
const TimelineTab = lazy(() => import('./components/TimelineTab').then(m => ({ default: m.TimelineTab })));
const SettleTab = lazy(() => import('./components/SettleTab').then(m => ({ default: m.SettleTab })));
const MembersTab = lazy(() => import('./components/MembersTab').then(m => ({ default: m.MembersTab })));
const SettingsTab = lazy(() => import('./components/SettingsTab').then(m => ({ default: m.SettingsTab })));
const CreditsTab = lazy(() => import('./components/CreditsTab').then(m => ({ default: m.CreditsTab })));
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));
import { Sprout, Check, X, RefreshCw, AlertTriangle, Menu } from 'lucide-react';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { SheetSetupModal } from './components/SheetSetupModal';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { LocalSaveBanner } from './components/LocalSaveBanner';
import { isPickerAvailable } from './utils/googlePicker';
import { MobileNavDrawer } from './components/MobileNavDrawer';
import { ViewModeProvider, useViewMode } from './hooks/useViewMode';
import { LanguageProvider, useLanguage } from './hooks/useLanguage';
import { useReceiptUploads } from './hooks/useReceiptUploads';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useSheetSync } from './hooks/useSheetSync';
import { createLedgerActions, ConfirmDialogState } from './app/ledgerActions';
import { TabId, TAB_GROUPS, groupForTab } from './app/navigation';
import { rememberLedgerChoice } from './app/ledgerChoice';

/** A plain-language reason for a failed Google sign-in, as a translation key. */
function signInErrorMessage(code: string): string {
  switch (code) {
    case 'auth/popup-blocked':
      return 'Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'The Google sign-in window was closed before it finished. Try again.';
    case 'auth/network-request-failed':
      return 'No internet connection. Connect and try again.';
    case 'auth/unauthorized-domain':
      return "This web address isn't approved for Google sign-in yet. Ask whoever set up the app to add it.";
    default:
      return 'Google sign-in failed. Try again, or open the app in a new browser tab.';
  }
}

const formatErrorTextWithLinks = (text: string, t: (s: string) => string) => {
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
          className="text-indigo-700 hover:text-indigo-900 underline font-black inline-flex items-center gap-1 bg-white border border-indigo-200 px-3 py-1.5 rounded-xl ml-1 hover:shadow-xs transition-all my-1"
        >
          {t('Enable Google Sheets API')} ↗
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

const TabLoadingFallback = () => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-[60vh] text-sm font-semibold text-slate-400">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
        {t('Loading tab...')}
      </div>
    </div>
  );
};

function AppShell() {
  const { mode, setMode } = useViewMode();
  const { language, setLanguage, t } = useLanguage();
  const [db, setDb] = useState<LocalDatabase | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const activeGroup = groupForTab(activeTab);

  const {
    user,
    accessToken,
    setAccessToken,
    authError,
    setAuthError,
    fetchError,
    setFetchError,
    handleLogin,
    handleLogout
  } = useGoogleAuth(setDb);
  useReceiptUploads(db, setDb, accessToken);
  const {
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
  } = useSheetSync({ db, setDb, accessToken, setAccessToken, setFetchError });
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences[]>(
    db?.notificationPreferences || []
  );

  useEffect(() => {
    // Sync notification preferences when db changes
    if (db?.notificationPreferences) {
      setNotificationPreferences(db.notificationPreferences);
    }
  }, [db?.notificationPreferences]);

  if (!db) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 text-xs font-semibold text-gray-400">
        {t("Starting Kothapalli's Farms Engine...")}
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 antialiased font-sans">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-600" />

        <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 p-8 shadow-xl flex flex-col items-center">
          {/* Animated Loader Circle */}
          <div className="relative w-16 h-16 flex items-center justify-center mb-6">
            <span className="animate-ping absolute inline-flex h-12 w-12 rounded-full bg-emerald-100 opacity-75"></span>
            <div className="relative w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-xs border border-emerald-100">
              <Sprout size={24} className="animate-spin" />
            </div>
          </div>

          <h2 className="text-base font-bold tracking-tight text-slate-800 text-center">
            {t('Synchronizing Database')}
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold mt-1">
            {t("Kothapalli's Farms Cloud")}
          </p>

          <p className="mt-5 text-slate-400 text-xs text-center leading-relaxed">
            {t('Reading cells from synchronized Google Sheet spreadsheet...')}
          </p>

          <div className="w-32 h-1 bg-slate-100 rounded-full overflow-hidden mt-6">
            <div className="h-full bg-emerald-600 animate-pulse rounded-full w-2/3" />
          </div>
        </div>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 antialiased font-sans">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-emerald-600" />

        {/* Language switch, so a Telugu reader can switch before signing in */}
        <div
          className="absolute top-4 right-4 flex bg-slate-100 p-0.5 rounded-lg border border-slate-200"
          title={t("Switch the app's language between English and Telugu")}
        >
          {(['en', 'te'] as const).map(lng => (
            <button
              key={lng}
              onClick={() => setLanguage(lng)}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase cursor-pointer transition-all ${
                language === lng ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {lng}
            </button>
          ))}
        </div>

        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-8 shadow-xl flex flex-col items-center">
          {/* Logo / App Brand Header */}
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-xs mb-5 border border-emerald-100">
            <Sprout size={32} />
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 text-center">
            {t("Kothapalli's Farms")}
          </h1>
          <p className="text-xs uppercase tracking-widest text-emerald-600 font-bold mt-1.5 mb-7">
            {t('Partnership Transparency')}
          </p>

          <div className="w-full border-t border-slate-100 mb-6" />

          {/* Prompt Information description */}
          <div className="text-slate-500 text-sm leading-relaxed mb-8 text-center space-y-2">
            <p>
              {t('Welcome to the collaborative farm ledger portal for')} <strong>{t("Kothapalli's Farms")}</strong>.
            </p>
            <p className="text-xs text-slate-400">
              {t('Sign in with your Google account to authorize secure real-time access to our synchronized cloud database.')}
            </p>
          </div>

          {/* Live Auth state indicators */}
          {fetchError && (
            <div className="w-full mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 leading-relaxed font-medium">
              {fetchError === "session-expired" ? (
                <>
                  <p className="font-bold mb-1">{t('Google Session Expired')}</p>
                  <p className="break-words">{t('Your Google Authorization session has expired or was revoked. This is a standard security measure after 1 hour of inactivity.')}</p>
                  <p className="mt-2 text-[10px] text-emerald-600 font-bold">{t('Please click the button below to sign in again and refresh access to your sheets.')}</p>
                </>
              ) : (
                <>
                  <p className="font-bold mb-1">{t('Could not synchronize database:')}</p>
                  <p className="break-words">{formatErrorTextWithLinks(fetchError, t)}</p>
                  <p className="mt-2 text-[10px] text-slate-400">{t('Please make sure your Google Account is permitted to access Sheet')} <strong>{db?.settings?.linkedSpreadsheetId || PLACEHOLDER_SPREADSHEET_ID}</strong>.</p>
                </>
              )}
            </div>
          )}

          {/* Entries made before the session ran out are still on this device
              and go to the sheet on sign-in — say so, so nobody re-enters them. */}
          {pendingChanges > 0 && (
            <div className="w-full mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 leading-relaxed font-medium">
              <p className="font-bold mb-1">
                {pendingChanges} {t(pendingChanges === 1 ? 'change is saved on this device but not yet in the Google Sheet' : 'changes are saved on this device but not yet in the Google Sheet')}
              </p>
              <p>{t(pendingChanges === 1 ? "Sign in to send it. Please don't enter it again." : "Sign in to send them. Please don't enter them again.")}</p>
            </div>
          )}

          {/* The detailed diagnostics modal only exists inside the signed-in
              app, so without this a failed sign-in here (blocked popup,
              closed window, no network) showed nothing at all. */}
          {authError && (
            <div role="alert" className="w-full mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700 leading-relaxed font-medium">
              <p className="font-bold mb-1">{t("Sign-in didn't complete")}</p>
              <p>{t(signInErrorMessage(authError.code))}</p>
              <p className="mt-1.5 text-[10px] text-red-400 font-mono">{authError.code}</p>
            </div>
          )}

          {/* Dynamic Sign-In Trigger button */}
          <button
            onClick={() => handleLogin()}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-300 shadow-xs hover:border-slate-400 hover:shadow-md cursor-pointer transition-all active:scale-98"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.242-3.12C18.416 1.832 15.541.97 12.24.97 6.13.97 1.13 5.97 1.13 12s5 11.03 11.11 11.03c6.38 0 10.618-4.484 10.618-10.8 0-.727-.076-1.282-.172-1.945H12.24z"
              />
            </svg>
            <span>{t('Authorize Google Account')}</span>
          </button>
        </div>

        {/* Footer info lockup */}
        <p className="mt-8 text-center text-[10px] text-slate-400 font-medium">
          {t('Secured via Google Firebase Auth & Sheets Sandbox API.')}
        </p>
      </div>
    );
  }


  const {
    members = [],
    fields = [],
    seasons = [],
    expenses = [],
    labours = [],
    revenues = [],
    stockItems = [],
    purchases = [],
    usages = [],
    activities = [],
    settings = { currency: '₹', areaUnit: 'acres', googleDriveLinked: false },
    auditLogs = [],
    creditAccounts = [],
    creditRepayments = [],
    settlementClearances = []
  } = db || {};

  const {
    handleAddExpense,
    handleEditExpense,
    handleDeleteExpense,
    handleAddLabour,
    handleEditLabour,
    handleDeleteLabour,
    handleAddRevenue,
    handleEditRevenue,
    handleDeleteRevenue,
    handleAddCreditAccount,
    handleEditCreditAccount,
    handleDeleteCreditAccount,
    handleAddCreditRepayment,
    handleUpdateCreditRepayment,
    handleDeleteCreditRepayment,
    handleSaveNotificationPreferences,
    handleAddStockItem,
    handleAddPurchase,
    handleUpdateStockItem,
    handleUpdatePurchase,
    handleAddUsage,
    handleUpdateUsage,
    handleAddField,
    handleUpdateField,
    handleDeleteField,
    handleAddSeason,
    handleUpdateSeason,
    handleCloseSeason,
    handleDeleteSeason,
    handleUpdateClearances,
    handleAddActivity,
    handleAddMember,
    handleUpdateMember,
    handleDeleteMember,
    handleSaveSettings,
    handleImportDatabase
  } = createLedgerActions({
    db,
    setDb,
    setConfirmDialog,
    notificationPreferences,
    setNotificationPreferences
  });

  return (
    <div className="min-h-screen md:h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      {/* Mobile-first top navigation banner bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 shrink-0 shadow-xs flex justify-between items-center print:hidden">
        <button
          onClick={() => setMobileNavOpen(true)}
          className="md:hidden p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors"
        >
          <Menu size={24} className="text-slate-700" />
        </button>

        <div className="flex items-center gap-2 md:gap-3 flex-1 md:flex-none">
          <span className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-xs shrink-0">
            <Sprout size={20} />
          </span>
          <div className="min-w-0">
            <h1 className="text-base md:text-lg font-bold tracking-tight text-slate-800 truncate">{t("Kothapalli's Farms")}</h1>
            <p className="text-[9px] md:text-[10px] uppercase tracking-widest text-emerald-600 font-semibold hidden sm:block">{t('Partnership Transparency')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {accessToken && (
            <div className="flex items-center gap-2">
              {syncingState === 'syncing' && (
                <span className="text-amber-600 flex items-center gap-1.5 text-xs font-semibold">
                  <RefreshCw size={13} className="animate-spin text-amber-500" />
                  <span className="hidden sm:inline">{t('Saving to Sheet...')}</span>
                </span>
              )}
              {syncingState === 'success' && (
                <span className="text-emerald-700 flex items-center gap-1.5 text-xs font-semibold" title={syncMessage}>
                  <Check size={14} className="text-emerald-500 font-bold bg-emerald-50 rounded-full border border-emerald-100 p-0.5" />
                  <span className="hidden sm:inline">{t('Synced')}</span>
                </span>
              )}
              {syncingState === 'failed' && (
                <span className="text-red-600 flex items-center gap-1.5 text-xs font-semibold" title={syncMessage}>
                  <X size={13} className="text-red-500 font-bold bg-red-50 rounded-full border border-red-100 p-0.5" />
                  <span className="hidden sm:inline text-[10px]">{t('Sync failed')}</span>
                </span>
              )}
              <button
                disabled={syncingState === 'syncing'}
                onClick={() => syncDatabaseAcrossCloud(db)}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                  syncingState === 'syncing'
                    ? 'bg-slate-50 text-slate-400 border-slate-200 animate-pulse'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-400 active:scale-95'
                }`}
                title={t('Force Synchronize with Google Sheet')}
              >
                <RefreshCw size={12} className={syncingState === 'syncing' ? 'animate-spin' : ''} />
                <span>{t('Sync Now')}</span>
                {pendingChanges > 0 && syncingState !== 'syncing' && (
                  <span
                    className="bg-amber-500 text-white rounded-full px-1.5 min-w-[18px] text-center text-[10px] leading-[18px]"
                    title={`${pendingChanges} ${t(pendingChanges === 1 ? 'change not yet in the Google Sheet' : 'changes not yet in the Google Sheet')}`}
                  >
                    {pendingChanges}
                  </span>
                )}
              </button>
            </div>
          )}

          <div
            className="hidden md:flex bg-slate-100 p-0.5 rounded-lg border border-slate-200"
            title={t('Basic mode groups tools into 4 hubs. Power mode shows every tool at once.')}
          >
            {(['basic', 'power'] as const).map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3 py-1 rounded-md text-[10px] font-bold capitalize cursor-pointer transition-all ${
                  mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {t(m)}
              </button>
            ))}
          </div>

          <div
            className="hidden md:flex bg-slate-100 p-0.5 rounded-lg border border-slate-200"
            title={t("Switch the app's language between English and Telugu")}
          >
            {(['en', 'te'] as const).map(lng => (
              <button
                key={lng}
                onClick={() => setLanguage(lng)}
                className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase cursor-pointer transition-all ${
                  language === lng ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {lng}
              </button>
            ))}
          </div>

          {seasons.filter(s => !s.isClosed).length > 0 && (
            <span className="hidden sm:inline-block text-[10px] bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded-lg border border-emerald-100 uppercase tracking-widest">
              ● {seasons.filter(s => !s.isClosed).length} {t('Active Seasons')}
            </span>
          )}
        </div>
      </header>

      <LocalSaveBanner />

      {/* Stays up through a retry (syncing) and clears only once a sync
          succeeds, so it doesn't flicker away and back on every attempt. */}
      {accessToken && syncErrorKind && (syncingState === 'failed' || syncingState === 'syncing') && (
        <SyncStatusBanner
          kind={syncErrorKind}
          pendingChanges={pendingChanges}
          nextRetryAt={nextRetryAt}
          isSyncing={syncingState === 'syncing'}
          details={syncMessage}
          onRetry={() => retrySyncNowRef.current()}
          onSignIn={() => handleLogin()}
        />
      )}

      {/* Main container body */}
      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col md:flex-row pb-20 sm:pb-16 md:pb-0 md:min-h-0 overflow-hidden">

        {/* Mobile Navigation Drawer — full grouped list, one tap away from the 4-hub bottom bar */}
        <MobileNavDrawer
          isOpen={mobileNavOpen}
          onClose={() => setMobileNavOpen(false)}
          groups={TAB_GROUPS}
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab as TabId)}
        />

        {/* Mobile bottom bar: always the 4 hubs, regardless of Basic/Power mode.
            Tapping a hub with several tools jumps to its first tool; the drawer
            (hamburger button in the header) gives full access to every tab. */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-300 p-2 flex gap-1.5 justify-around md:hidden print:hidden shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
          {TAB_GROUPS.map(group => (
            <button
              key={group.id}
              onClick={() => setActiveTab(group.tabs[0].id)}
              className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl text-[10px] font-semibold tracking-wide transition-all flex-1 min-h-12 justify-center border ${
                activeGroup.id === group.id
                  ? 'bg-slate-100 text-slate-900 font-bold border-slate-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
              }`}
            >
              {group.icon}
              <span>{t(group.label)}</span>
            </button>
          ))}
        </nav>

        {/* Desktop Sidebar navigation */}
        <nav className="hidden md:flex md:flex-col md:w-64 md:border-r md:border-slate-200 md:gap-1.5 md:p-4 print:hidden shrink-0">
          {mode === 'basic' ? (
            TAB_GROUPS.map(group => (
              <button
                key={group.id}
                onClick={() => setActiveTab(group.tabs[0].id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all w-full text-left cursor-pointer border border-l-4 ${
                  activeGroup.id === group.id
                    ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 border-l-emerald-600'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
                }`}
              >
                {group.icon}
                <span>{t(group.label)}</span>
              </button>
            ))
          ) : (
            TAB_GROUPS.map((group, idx) => (
              <div key={group.id}>
                {idx > 0 && <div className="border-t border-slate-200 my-3 pt-3" />}
                <div className="px-3 pb-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {t(group.label)}
                </div>
                {group.tabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold tracking-wide transition-all w-full text-left cursor-pointer border border-l-4 ${
                      activeTab === tab.id
                        ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 border-l-emerald-600'
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    {tab.icon}
                    <span>{t(tab.label)}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </nav>

        {/* Dynamic component contents viewport with scroll boundary */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:p-8 md:h-full pb-24 md:pb-8">

          {/* Basic mode + multi-tool hub: progressive-disclosure pills to reach
              siblings without leaving the simplified nav or opening the drawer.
              These matter most on a phone: the bottom bar navigates by group
              and lands on group.tabs[0], so without them the second tab in a
              group (Audit & Config, Fields & Directory, Inventory) is
              reachable only through the drawer. They were `hidden md:flex`,
              i.e. shown only where the full sidebar already lists every tab
              and hidden exactly where they were needed. */}
          {mode === 'basic' && activeGroup.tabs.length > 1 && (
            <div data-testid="group-tab-switcher" className="flex flex-wrap gap-2 mb-5">
              {activeGroup.tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}
                >
                  {t(tab.label)}
                </button>
              ))}
            </div>
          )}

          <Suspense fallback={<TabLoadingFallback />}>
            {activeTab === 'dashboard' && (
              <DashboardTab
              fields={fields}
              seasons={seasons}
              members={members}
              expenses={expenses}
              labours={labours}
              revenues={revenues}
              usages={usages}
              purchases={purchases}
              stockItems={stockItems}
              currency={settings.currency}
              areaUnit={settings.areaUnit}
              creditAccounts={creditAccounts}
              creditRepayments={creditRepayments}
              onSelectTab={(tab) => setActiveTab(tab as any)}
            />
          )}

          {activeTab === 'money' && (
            <MoneyTab
              expenses={expenses}
              labours={labours}
              revenues={revenues}
              fields={fields}
              seasons={seasons}
              members={members}
              activities={activities}
              currency={settings.currency}
              creditAccounts={creditAccounts}
              accessToken={accessToken}
              onAddExpense={handleAddExpense}
              onEditExpense={handleEditExpense}
              onDeleteExpense={handleDeleteExpense}
              onAddLabour={handleAddLabour}
              onEditLabour={handleEditLabour}
              onDeleteLabour={handleDeleteLabour}
              onAddRevenue={handleAddRevenue}
              onEditRevenue={handleEditRevenue}
              onDeleteRevenue={handleDeleteRevenue}
            />
          )}

          {activeTab === 'stock' && (
            <StockTab
              stockItems={stockItems}
              purchases={purchases}
              usages={usages}
              fields={fields}
              seasons={seasons}
              members={members}
              activities={activities}
              currency={settings.currency}
              onAddStockItem={handleAddStockItem}
              onUpdateStockItem={handleUpdateStockItem}
              onAddPurchase={handleAddPurchase}
              onUpdatePurchase={handleUpdatePurchase}
              onAddUsage={handleAddUsage}
              onUpdateUsage={handleUpdateUsage}
            />
          )}

          {activeTab === 'timeline' && (
            <TimelineTab
              activities={activities}
              fields={fields}
              seasons={seasons}
              members={members}
              expenses={expenses}
              labours={labours}
              usages={usages}
              stockItems={stockItems}
              currency={settings.currency}
              onAddActivity={handleAddActivity}
            />
          )}

          {activeTab === 'settle' && (
            <SettleTab
              fields={fields}
              seasons={seasons}
              members={members}
              expenses={expenses}
              labours={labours}
              revenues={revenues}
              usages={usages}
              stockItems={stockItems}
              purchases={purchases}
              currency={settings.currency}
              creditAccounts={creditAccounts}
              creditRepayments={creditRepayments}
              settlementClearances={settlementClearances}
              onUpdateClearances={handleUpdateClearances}
            />
          )}

          {activeTab === 'members' && (
            <MembersTab
              fields={fields}
              seasons={seasons}
              members={members}
              expenses={expenses}
              labours={labours}
              revenues={revenues}
              usages={usages}
              stockItems={stockItems}
              purchases={purchases}
              activities={activities}
              currency={settings.currency}
              creditAccounts={creditAccounts}
              creditRepayments={creditRepayments}
              settlementClearances={settlementClearances}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onAddField={handleAddField}
              onUpdateField={handleUpdateField}
              onAddSeason={handleAddSeason}
              onUpdateSeason={handleUpdateSeason}
              onCloseSeason={handleCloseSeason}
              onDeleteMember={handleDeleteMember}
              onDeleteField={handleDeleteField}
              onDeleteSeason={handleDeleteSeason}
            />
          )}

          {activeTab === 'credits' && (
            <CreditsTab
              creditAccounts={creditAccounts}
              creditRepayments={creditRepayments}
              members={members}
              expenses={expenses}
              labours={labours}
              seasons={seasons}
              fields={fields}
              currency={settings.currency}
              onAddCreditAccount={handleAddCreditAccount}
              onEditCreditAccount={handleEditCreditAccount}
              onDeleteCreditAccount={handleDeleteCreditAccount}
              onAddCreditRepayment={handleAddCreditRepayment}
              onUpdateCreditRepayment={handleUpdateCreditRepayment}
              onDeleteCreditRepayment={handleDeleteCreditRepayment}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsTab
              settings={settings}
              auditLogs={auditLogs}
              members={members}
              onSaveSettings={handleSaveSettings}
              onImportDatabase={handleImportDatabase}
              onTriggerPull={handleTriggerPull}
              onRequestSheetSetup={() => setNeedsSheetSetup(true)}
              localData={db}
              user={user}
              accessToken={accessToken}
              onLogin={handleLogin}
              onLogout={handleLogout}
              notificationPreferences={notificationPreferences}
              onSaveNotificationPreferences={handleSaveNotificationPreferences}
            />
          )}

          {activeTab === 'analytics' && db && (
            <AnalyticsDashboard
              db={db}
              currency={settings.currency}
            />
          )}
          </Suspense>
        </div>
      </main>

      {needsSheetSetup && (
        <SheetSetupModal
          onLinkExisting={handleLinkExistingSheet}
          onCreateNew={handleCreateNewSheet}
          onSkip={() => {
            rememberLedgerChoice();
            setNeedsSheetSetup(false);
          }}
          onBrowseDrive={isPickerAvailable() ? handleBrowseDrive : undefined}
        />
      )}

      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-600 mb-3">
                <AlertTriangle size={24} className="stroke-[2.5]" />
                <h3 className="font-extrabold text-slate-900 text-base">{confirmDialog.title}</h3>
              </div>
              <p className="text-slate-600 text-xs leading-relaxed font-medium">{confirmDialog.message}</p>
            </div>
            <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                {t('Cancel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                }}
                className="px-5 py-2 text-xs font-extrabold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {confirmDialog.confirmText ? t(confirmDialog.confirmText) : t('Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {conflictData.isOpen && conflictData.cloudData && db && (
        <ConflictResolutionModal
          isOpen={conflictData.isOpen}
          localData={db}
          cloudData={conflictData.cloudData}
          onResolve={handleResolveConflict}
          onCancel={() => setConflictData({ isOpen: false, cloudData: null })}
        />
      )}

      {authError && (
        <div id="auth-error-modal" className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-55 animate-in fade-in duration-100">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-6">
              <div className="flex items-center gap-3 text-red-600 mb-4 animate-pulse">
                <AlertTriangle size={28} className="stroke-[2.5] shrink-0" />
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base leading-tight">Google Authorization Mismatch</h3>
                  <p className="text-slate-400 text-[9px] uppercase font-mono tracking-wider mt-0.5">Deployment Diagnostics</p>
                </div>
              </div>

              <div className="bg-rose-50 border border-rose-100 rounded-xl p-4 mb-4">
                <div className="text-[11px] font-bold text-rose-800 mb-1">
                  Error Code: <span className="font-mono text-xs select-all bg-rose-100 px-1.5 py-0.5 rounded">{authError.code}</span>
                </div>
                <p className="text-rose-700 text-[11px] leading-relaxed font-semibold">{authError.message}</p>
              </div>

              <div className="space-y-3.5">
                <h4 className="font-extrabold text-slate-800 text-xs">How to resolve this in your deployment:</h4>
                
                {authError.code === 'auth/unauthorized-domain' ? (
                  <div className="space-y-2.5 text-slate-600 text-xs font-medium">
                    <p className="leading-relaxed">
                      The domain <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded select-all font-bold text-slate-800">{authError.domain}</span> has not been whitelisted under Authorized Domains in your Firebase/Google Cloud platform yet.
                    </p>
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-[11px] space-y-1.5 leading-relaxed font-medium">
                      <div className="font-bold text-slate-800">Step-by-Step Whitelisting:</div>
                      <div>1. Log in to your <span className="font-semibold text-slate-800">Firebase Console</span>.</div>
                      <div>2. Navigate to your project, then click <strong>Authentication &gt; Settings &gt; Authorized Domains</strong>.</div>
                      <div>3. Click "Add Domain" and add: <span className="font-mono bg-white px-1.5 py-0.5 border rounded font-bold text-[10px] select-all">{window.location.hostname}</span>.</div>
                      <div className="pt-1.5 text-[9.5px] text-slate-400 leading-snug">
                        * Note: If you have custom domains, make sure this exact domain is approved in your Google Cloud OAuth Consent screen and Web Client Credentials.
                      </div>
                    </div>
                  </div>
                ) : authError.code === 'auth/popup-blocked' ? (
                  <div className="space-y-2 text-slate-600 text-xs font-medium leading-relaxed">
                    <p>
                      Your web browser blocked the Google authentication popup window entirely.
                    </p>
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-[11px] space-y-1 font-medium">
                      <div className="font-bold text-slate-800">Quick Fix:</div>
                      <div>• Look for a "popup blocked" badge in your browser's address bar and select <strong>Always Allow Popups</strong>.</div>
                      <div>• Temporarily turn off adblockers, Brave Shields, or privacy extensions on this page.</div>
                      <div>• Retry clicking the sign-in button again.</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-slate-600 text-xs font-medium leading-relaxed">
                    <p>
                      When run inside sandboxed or cross-origin iframes (like the AI Studio internal development preview), major browsers frequently block cookie storage or popup communications.
                    </p>
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-[11px] space-y-2 font-medium">
                      <div className="font-bold text-slate-800">Try these easy options:</div>
                      <div>
                        <span className="font-bold text-slate-800">Option A: Open in a New Tab</span>
                        <div className="text-slate-400 text-[10px] mt-0.5">Run the app in a standalone tab where popup browsers don't hit sandboxing blocks.</div>
                      </div>
                      <div>
                        <span className="font-bold text-slate-800">Option B: Temporary Manual Override</span>
                        <div className="text-slate-400 text-[10px] mt-0.5">Use the "Manual Access Token Override" accordion directly in the Settings tab using a token from the Google OAuth Playground.</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-2.5 px-6 py-4 bg-slate-50 border-t border-slate-100 justify-end">
              <button
                type="button"
                onClick={() => setAuthError(null)}
                className="px-5 py-2 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ViewModeProvider>
      <LanguageProvider>
        <AppShell />
      </LanguageProvider>
    </ViewModeProvider>
  );
}
