/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
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
import { UnlinkedAccountScreen } from './components/shell/UnlinkedAccountScreen';
import { PartnerHomeTab } from './components/PartnerHomeTab';
import { seasonsOfPartner } from './utils/partnerScope';
import { ViewModeProvider } from './hooks/useViewMode';
import { LanguageProvider } from './hooks/useLanguage';
import { AccessProvider, useSheetAccess, useRolesProtection } from './hooks/useAccess';
import { resolveAccess } from './app/access';
import { useReceiptUploads } from './hooks/useReceiptUploads';
import { useGoogleAuth } from './hooks/useGoogleAuth';
import { useSheetSync } from './hooks/useSheetSync';
import { createLedgerActions, ledgerCollections, ConfirmDialogState } from './app/ledgerActions';
import { TabId, TAB_GROUPS } from './app/navigation';
import { rememberLedgerChoice } from './app/ledgerChoice';

const TAB_IDS = new Set<string>(TAB_GROUPS.flatMap(g => g.tabs.map(tab => tab.id)));

/** The tab named in the URL hash (#settle), or the dashboard. */
function tabFromHash(): TabId {
  if (typeof window === 'undefined') return 'dashboard';
  const name = window.location.hash.replace(/^#\/?/, '');
  return TAB_IDS.has(name) ? (name as TabId) : 'dashboard';
}

function AppShell() {
  const [db, setDb] = useState<LocalDatabase | null>(null);
  // The tab lives in the URL hash so a refresh stays put, the phone's back
  // button steps back through tabs, and a partner can be sent a link
  // straight to Settle. Every tab used to be the bare "/".
  const [activeTab, setActiveTabState] = useState<TabId>(tabFromHash);
  const setActiveTab = (tab: TabId) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined' && tabFromHash() !== tab) {
      window.location.hash = tab;
    }
  };
  useEffect(() => {
    const onHashChange = () => setActiveTabState(tabFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

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
  // Who this Google account is in the ledger and what it may do. Drive's
  // share setting on the sheet is the enforced part; the partner's role on
  // the Members tab refines it.
  const linkedSpreadsheetId = db?.settings?.linkedSpreadsheetId;
  const { sheetAccess, ownedByMe } = useSheetAccess(accessToken, linkedSpreadsheetId);
  const access = useMemo(
    () => resolveAccess({ sheetAccess, sheetOwnedByMe: ownedByMe, members: db?.members || [], email: user?.email }),
    [sheetAccess, ownedByMe, db?.members, user?.email]
  );
  // Once roles are in use, the sheet's Members tab is locked to the owners,
  // so the role column cannot be edited by hand by a sheet Editor. Anyone
  // who is not an owner then leaves that tab out of their pushes.
  const ownerEmails = useMemo(
    () => [user?.email || '', ...(db?.members || []).filter(m => m.role === 'owner' && m.email).map(m => m.email as string)],
    [db?.members, user?.email]
  );
  useRolesProtection({
    accessToken,
    spreadsheetId: linkedSpreadsheetId,
    enabled: ownedByMe && access.rolesConfigured && sheetAccess === 'edit',
    ownerEmails,
  });
  const skipCollections = useMemo(() => (access.isOwner ? [] : ['members']), [access.isOwner]);
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
  } = useSheetSync({ db, setDb, accessToken, setAccessToken, setFetchError, canWriteSheet: !access.readOnly, skipCollections });
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

  // Roles are in use and this Google account is none of the partners:
  // show nothing from the ledger.
  if (access.shell === 'unlinked') {
    return <UnlinkedAccountScreen email={user?.email} onLogout={handleLogout} />;
  }

  // A partner with the viewer role gets only their own spend and the fields
  // they are part of. No navigation, no other partners' balances, no
  // inventory, creditors, reports or settings.
  if (access.shell === 'partner' && access.member) {
    const c = ledgerCollections(db);
    return (
      <AccessProvider value={access}>
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
          <AppHeader
            accessToken={accessToken}
            syncingState={syncingState}
            syncMessage={syncMessage}
            pendingChanges={pendingChanges}
            seasons={seasonsOfPartner(access.member.id, c.fields, c.seasons)}
            onSyncNow={() => undefined}
          />
          <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6 md:p-8">
            <PartnerHomeTab
              member={access.member}
              email={user?.email}
              members={c.members}
              fields={c.fields}
              seasons={c.seasons}
              expenses={c.expenses}
              labours={c.labours}
              revenues={c.revenues}
              usages={c.usages}
              stockItems={c.stockItems}
              purchases={c.purchases}
              creditAccounts={c.creditAccounts}
              creditRepayments={c.creditRepayments}
              settlementClearances={c.settlementClearances}
              currency={c.settings.currency}
              areaUnit={c.settings.areaUnit}
              onLogout={handleLogout}
            />
          </main>
          {authError && <AuthErrorModal authError={authError} onDismiss={() => setAuthError(null)} />}
        </div>
      </AccessProvider>
    );
  }

  const { seasons } = ledgerCollections(db);
  const ledgerActions = createLedgerActions({
    db,
    setDb,
    setConfirmDialog,
    notificationPreferences,
    setNotificationPreferences,
    access
  });

  return (
    <AccessProvider value={access}>
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
    </AccessProvider>
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
