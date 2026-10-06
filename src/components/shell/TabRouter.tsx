/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Suspense, lazy } from 'react';
import { ScreenErrorBoundary } from './ScreenErrorBoundary';
import { User } from 'firebase/auth';
import { LocalDatabase } from '../../utils/database';
import { NotificationPreferences } from '../../types';
import { useLanguage } from '../../hooks/useLanguage';
import { TabId } from '../../app/navigation';
import { createLedgerActions, ledgerCollections } from '../../app/ledgerActions';
// Lazy-load tabs for better initial load performance
const DashboardTab = lazy(() => import('../DashboardTab').then(m => ({ default: m.DashboardTab })));
const MoneyTab = lazy(() => import('../MoneyTab').then(m => ({ default: m.MoneyTab })));
const StockTab = lazy(() => import('../StockTab').then(m => ({ default: m.StockTab })));
const TimelineTab = lazy(() => import('../TimelineTab').then(m => ({ default: m.TimelineTab })));
const SettleTab = lazy(() => import('../SettleTab').then(m => ({ default: m.SettleTab })));
const MembersTab = lazy(() => import('../MembersTab').then(m => ({ default: m.MembersTab })));
const SettingsTab = lazy(() => import('../SettingsTab').then(m => ({ default: m.SettingsTab })));
const CreditsTab = lazy(() => import('../CreditsTab').then(m => ({ default: m.CreditsTab })));
const AnalyticsDashboard = lazy(() => import('../AnalyticsDashboard').then(m => ({ default: m.AnalyticsDashboard })));

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

interface TabRouterProps {
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;
  db: LocalDatabase;
  actions: ReturnType<typeof createLedgerActions>;
  accessToken: string;
  user: User | null;
  notificationPreferences: NotificationPreferences[];
  onTriggerPull: (accessToken: string, spreadsheetId: string) => Promise<void>;
  onRequestSheetSetup: () => void;
  onLogin: (mode?: 'popup' | 'redirect') => Promise<string | null>;
  onLogout: () => Promise<void>;
}

/** The active tab's screen, lazy-loaded. */
export function TabRouter({
  activeTab,
  setActiveTab,
  db,
  actions,
  accessToken,
  user,
  notificationPreferences,
  onTriggerPull,
  onRequestSheetSetup,
  onLogin,
  onLogout
}: TabRouterProps) {
  const {
    members,
    fields,
    seasons,
    expenses,
    labours,
    revenues,
    stockItems,
    purchases,
    usages,
    activities,
    settings,
    auditLogs,
    creditAccounts,
    creditRepayments,
    settlementClearances
  } = ledgerCollections(db);
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
  } = actions;

  return (
    <ScreenErrorBoundary key={activeTab}>
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
        onTriggerPull={onTriggerPull}
        onRequestSheetSetup={onRequestSheetSetup}
        localData={db}
        user={user}
        accessToken={accessToken}
        onLogin={onLogin}
        onLogout={onLogout}
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
    </ScreenErrorBoundary>
  );
}
