/**
 * Sandbox: the app's real screens and ledger logic, on made-up data, with no
 * sign-in, no sync and no network. For trying changes by hand without going
 * near a real ledger. Open /dev/sandbox.html on the dev server, and use a
 * port other than the real app's so browser storage stays separate.
 */
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/index.css';
import { LocalDatabase } from '../src/utils/database';
import { NotificationPreferences } from '../src/types';
import { AppHeader } from '../src/components/shell/AppHeader';
import { MobileBottomNav, DesktopSidebarNav, GroupTabSwitcher } from '../src/components/shell/AppNavigation';
import { TabRouter } from '../src/components/shell/TabRouter';
import { ConfirmDialog } from '../src/components/shell/ConfirmDialog';
import { MobileNavDrawer } from '../src/components/MobileNavDrawer';
import { ViewModeProvider } from '../src/hooks/useViewMode';
import { LanguageProvider } from '../src/hooks/useLanguage';
import { createLedgerActions, ledgerCollections, ConfirmDialogState } from '../src/app/ledgerActions';
import { TabId, TAB_GROUPS } from '../src/app/navigation';
import { sandboxSeed } from './seed';

// Nothing may leave this machine: any request to another host fails.
const realFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, window.location.href);
  if (url.hostname !== window.location.hostname) {
    return Promise.reject(new TypeError(`Network is off in the sandbox (${url.hostname})`));
  }
  return realFetch(input, init);
}) as typeof window.fetch;

function SandboxShell() {
  const [db, setDb] = useState<LocalDatabase | null>(sandboxSeed);
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences[]>([]);

  if (!db) return null;
  const { seasons } = ledgerCollections(db);
  const actions = createLedgerActions({ db, setDb, setConfirmDialog, notificationPreferences, setNotificationPreferences });
  const offline = async () => { throw new Error('No Google in the sandbox'); };

  return (
    <div className="min-h-screen md:h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      <div className="bg-amber-100 text-amber-900 text-[11px] font-bold text-center py-1">SANDBOX · made-up data · nothing is saved or sent anywhere</div>
      <AppHeader
        accessToken="sandbox"
        syncingState="idle"
        syncMessage=""
        pendingChanges={0}
        seasons={seasons}
        onSyncNow={() => {}}
        onOpenMobileNav={() => setMobileNavOpen(true)}
      />
      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col md:flex-row pb-20 sm:pb-16 md:pb-0 md:min-h-0 overflow-hidden">
        <MobileNavDrawer isOpen={mobileNavOpen} onClose={() => setMobileNavOpen(false)} groups={TAB_GROUPS} activeTab={activeTab} onSelectTab={tab => setActiveTab(tab as TabId)} />
        <MobileBottomNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <DesktopSidebarNav activeTab={activeTab} setActiveTab={setActiveTab} />
        <div className="flex-1 overflow-y-auto px-6 py-6 md:p-8 md:h-full pb-24 md:pb-8">
          <GroupTabSwitcher activeTab={activeTab} setActiveTab={setActiveTab} />
          <TabRouter
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            db={db}
            actions={actions}
            accessToken="sandbox"
            user={null}
            notificationPreferences={notificationPreferences}
            onTriggerPull={offline}
            onRequestSheetSetup={() => {}}
            onLogin={async () => null}
            onLogout={async () => {}}
          />
        </div>
      </main>
      {confirmDialog && confirmDialog.isOpen && <ConfirmDialog confirmDialog={confirmDialog} onCancel={() => setConfirmDialog(null)} />}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ViewModeProvider>
    <LanguageProvider>
      <SandboxShell />
    </LanguageProvider>
  </ViewModeProvider>
);
