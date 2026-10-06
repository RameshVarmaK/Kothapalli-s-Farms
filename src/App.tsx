/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { LocalDatabase } from './utils/database';
import { NotificationPreferences } from './types';
import { ConflictResolutionModal } from './components/ConflictResolutionModal';
import { SheetSetupModal } from './components/SheetSetupModal';
import { SyncStatusBanner } from './components/SyncStatusBanner';
import { LocalSaveBanner } from './components/LocalSaveBanner';
import { isPickerAvailable } from './utils/googlePicker';
import { MobileNavDrawer } from './components/MobileNavDrawer';
import { StartingScreen } from './components/shell/StartingScreen';
import { LoadingScreen } from './components/shell/LoadingScreen';
import { SignInScreen } from './components/shell/SignInScreen';
import { AppHeader } from './components/shell/AppHeader';
import { MobileBottomNav, DesktopSidebarNav, GroupTabSwitcher } from './components/shell/AppNavigation';
import { TabRouter } from './components/shell/TabRouter';
import { ConfirmDialog } from './components/shell/ConfirmDialog';
import { AuthErrorModal } from './components/shell/AuthErrorModal';
import { ViewModeProvider } from './hooks/useViewMode';
import { LanguageProvider } from './hooks/useLanguage';
import { useReceiptUploads } from './hooks/useReceiptUploads';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useSheetSync } from './hooks/useSheetSync';
import { createLedgerActions, ledgerCollections, ConfirmDialogState } from './app/ledgerActions';
import { TabId, TAB_GROUPS } from './app/navigation';
import { rememberLedgerChoice } from './app/ledgerChoice';

function AppShell() {
  const [db, setDb] = useState<LocalDatabase | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

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
    return <StartingScreen />;
  }

  if (loadingData) {
    return <LoadingScreen />;
  }

  if (!accessToken) {
    return (
      <SignInScreen
        fetchError={fetchError}
        authError={authError}
        pendingChanges={pendingChanges}
        linkedSpreadsheetId={db?.settings?.linkedSpreadsheetId}
        onLogin={() => handleLogin()}
      />
    );
  }

  const { seasons } = ledgerCollections(db);
  const ledgerActions = createLedgerActions({
    db,
    setDb,
    setConfirmDialog,
    notificationPreferences,
    setNotificationPreferences
  });

  return (
    <div className="min-h-screen md:h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      {/* Mobile-first top navigation banner bar */}
      <AppHeader
        accessToken={accessToken}
        syncingState={syncingState}
        syncMessage={syncMessage}
        pendingChanges={pendingChanges}
        seasons={seasons}
        onSyncNow={() => syncDatabaseAcrossCloud(db)}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />

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
        <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} />

        {/* Desktop Sidebar navigation */}
        <DesktopSidebarNav activeTab={activeTab} setActiveTab={setActiveTab} />

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
          <GroupTabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} />

          <TabRouter
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            db={db}
            actions={ledgerActions}
            accessToken={accessToken}
            user={user}
            notificationPreferences={notificationPreferences}
            onTriggerPull={handleTriggerPull}
            onRequestSheetSetup={() => setNeedsSheetSetup(true)}
            onLogin={handleLogin}
            onLogout={handleLogout}
          />
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
        <ConfirmDialog confirmDialog={confirmDialog} onCancel={() => setConfirmDialog(null)} />
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
        <AuthErrorModal authError={authError} onDismiss={() => setAuthError(null)} />
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
