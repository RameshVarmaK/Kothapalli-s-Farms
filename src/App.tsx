/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { initAuth, googleSignIn, googleSignInRedirect, logout, clearGoogleAccessToken } from './utils/auth';
import {
  getInitialDatabase,
  saveDatabase,
  addAuditLog,
  LocalDatabase
} from './utils/database';
import {
  Member,
  Field,
  Season,
  Activity,
  Expense,
  Labour,
  StockItem,
  StockPurchase,
  StockUsage,
  HarvestRevenue,
  Settings,
  AuditLog,
  CreditAccount,
  CreditRepayment
} from './types';
import { DashboardTab } from './components/DashboardTab';
import { MoneyTab } from './components/MoneyTab';
import { StockTab } from './components/StockTab';
import { TimelineTab } from './components/TimelineTab';
import { SettleTab } from './components/SettleTab';
import { MembersTab } from './components/MembersTab';
import { SettingsTab } from './components/SettingsTab';
import { CreditsTab } from './components/CreditsTab';
import { pullDataFromSpreadsheet, pushDataToSpreadsheet, findExistingSpreadsheet, createSpreadsheet } from './utils/googleSheets';
import { LayoutDashboard, FileText, PackageOpen, CalendarDays, Coins, Users, Wrench, Sprout, Check, X, RefreshCw, AlertTriangle, CreditCard } from 'lucide-react';

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
          className="text-indigo-700 hover:text-indigo-900 underline font-black inline-flex items-center gap-1 bg-white border border-indigo-200 px-3 py-1.5 rounded-xl ml-1 hover:shadow-xs transition-all my-1"
        >
          Enable Google Sheets API ↗
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

export default function App() {
  const [db, setDb] = useState<LocalDatabase | null>(null);
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'money' | 'stock' | 'timeline' | 'settle' | 'members' | 'settings' | 'credits'
  >('dashboard');

  // Unified Google Firebase Authentication state
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [authError, setAuthError] = useState<{
    code: string;
    message: string;
    domain: string;
  } | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [syncingState, setSyncingState] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');
  const [syncMessage, setSyncMessage] = useState('');
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
  } | null>(null);

  const syncDatabaseAcrossCloud = async (currentDb?: LocalDatabase) => {
    const dbToSync = currentDb || db;
    if (!accessToken || !dbToSync) return;

    if (loadingData) {
      console.log('Postponing cloud sync because database is currently loading data...');
      return;
    }

    const targetSheetId = dbToSync.settings?.linkedSpreadsheetId;
    if (!targetSheetId || targetSheetId === "1r820DlxdJEOZTYhh1DxGXdyv121d6isnFXix-n_C-Ts") {
      console.log('Postponing cloud sync because spreadsheet ID is absent or placeholder. Auto-fetch will resolve this.');
      return;
    }

    setSyncingState('syncing');
    try {
      await pushDataToSpreadsheet(accessToken, targetSheetId, dbToSync);
      setSyncingState('success');
      setSyncMessage('Successfully synced with cloud Sheets!');
      setTimeout(() => setSyncingState('idle'), 3000);
    } catch (err: any) {
      console.error('Unified Auto-sync failed:', err);
      setSyncingState('failed');
      const errMsg = err.message || String(err);
      const isAuthError = errMsg.includes("401") || 
                          errMsg.toLowerCase().includes("unauthenticated") || 
                          errMsg.toLowerCase().includes("invalid credentials");
      if (isAuthError) {
        clearGoogleAccessToken();
        setSyncMessage('Your Google session has expired. Clearing session to re-authorize...');
        setTimeout(() => {
          setAccessToken(null);
        }, 2000);
      } else {
        setSyncMessage(errMsg);
      }
    }
  };

  useEffect(() => {
    // Synchronous bootstrap local database
    const loadedDb = getInitialDatabase();
    setDb(loadedDb);

    // Bootstrap continuous Firebase auth flow state listener
    const unsubscribe = initAuth(
      (currentUser, token) => {
        setUser(prevUser => {
          if (prevUser && prevUser.uid !== currentUser.uid) {
            console.log("Detected Google profile switch. Purging old database local cache...");
            localStorage.removeItem('farm_ledger_database');
            setDb(getInitialDatabase());
          }
          return currentUser;
        });
        setAccessToken(token);
      },
      () => {
        setUser(null);
        setAccessToken(null);
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (accessToken) {
      const autoFetch = async () => {
        setLoadingData(true);
        setFetchError(null);
        try {
          let targetSheetId = db?.settings?.linkedSpreadsheetId;
          const isPlaceholder = !targetSheetId || targetSheetId === "1r820DlxdJEOZTYhh1DxGXdyv121d6isnFXix-n_C-Ts";
          let sheetData = null;

          if (!isPlaceholder) {
            try {
              sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId!);
            } catch (pullError) {
              console.warn(`Could not pull from spreadsheet ${targetSheetId}. Searching for 'FarmLedger Database'...`, pullError);
              const foundId = await findExistingSpreadsheet(accessToken);
              if (foundId) {
                console.log(`Found existing spreadsheet: ${foundId}`);
                targetSheetId = foundId;
                sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId);
              } else {
                console.log("No existing spreadsheet found on Drive. Creating a new one...");
                const newId = await createSpreadsheet(accessToken);
                targetSheetId = newId;
                const localDb = db || getInitialDatabase();
                await pushDataToSpreadsheet(accessToken, targetSheetId, localDb);
                sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId);
              }
            }
          } else {
            const foundId = await findExistingSpreadsheet(accessToken);
            if (foundId) {
              console.log(`Found existing spreadsheet: ${foundId}`);
              targetSheetId = foundId;
              sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId);
            } else {
              console.log("No existing spreadsheet found on Drive. Creating a new one...");
              const newId = await createSpreadsheet(accessToken);
              targetSheetId = newId;
              const localDb = db || getInitialDatabase();
              await pushDataToSpreadsheet(accessToken, targetSheetId, localDb);
              sheetData = await pullDataFromSpreadsheet(accessToken, targetSheetId);
            }
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

            if (isSheetDataEmpty && isLocalDataNotEmpty) {
              console.log("Newly linked Google Sheet is empty, but local database has valuable offline records. Pushing local state to Sheets to prevent data clearing...");
              await pushDataToSpreadsheet(accessToken, targetSheetId!, currentLocalDb);
              sheetData = {
                ...currentLocalDb,
              };
            }

            setDb(prev => {
              const base = prev || {
                members: [],
                fields: [],
                seasons: [],
                activities: [],
                expenses: [],
                labours: [],
                stockItems: [],
                purchases: [],
                usages: [],
                revenues: [],
                auditLogs: [],
                settings: { currency: "₹", areaUnit: "acres", googleDriveLinked: true, linkedSpreadsheetId: targetSheetId },
                creditAccounts: [],
                creditRepayments: []
              };
              const finalDb: LocalDatabase = {
                members: sheetData.members ?? base.members ?? [],
                fields: sheetData.fields ?? base.fields ?? [],
                seasons: sheetData.seasons ?? base.seasons ?? [],
                activities: sheetData.activities ?? base.activities ?? [],
                expenses: sheetData.expenses ?? base.expenses ?? [],
                labours: sheetData.labours ?? base.labours ?? [],
                stockItems: sheetData.stockItems ?? base.stockItems ?? [],
                purchases: sheetData.purchases ?? base.purchases ?? [],
                usages: sheetData.usages ?? base.usages ?? [],
                revenues: sheetData.revenues ?? base.revenues ?? [],
                auditLogs: sheetData.auditLogs ?? base.auditLogs ?? [],
                creditAccounts: sheetData.creditAccounts ?? base.creditAccounts ?? [],
                creditRepayments: sheetData.creditRepayments ?? base.creditRepayments ?? [],
                settings: {
                  ...base.settings,
                  ...(sheetData.settings || {}),
                  googleDriveLinked: true,
                  linkedSpreadsheetId: targetSheetId
                }
              };
              saveDatabase(finalDb);
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

  const handleLogin = async (mode: 'popup' | 'redirect' = 'popup'): Promise<string | null> => {
    try {
      setAuthError(null);
      setFetchError(null);
      if (mode === 'redirect') {
        await googleSignInRedirect();
        return null; // Will trigger redirect, so page will unload
      }
      const result = await googleSignIn();
      if (result) {
        if (user && user.uid !== result.user.uid) {
          console.log("Logged in different user. Cleaning stale local state cache...");
          localStorage.removeItem('farm_ledger_database');
          setDb(getInitialDatabase());
        }
        setUser(result.user);
        setAccessToken(result.accessToken);
        return result.accessToken;
      }
    } catch (error: any) {
      console.error('Unified Google Auth Login error:', error);
      setAuthError({
        code: error?.code || 'auth/unknown',
        message: error?.message || String(error),
        domain: window.location.origin
      });
    }
    return null;
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setAccessToken(null);
      console.log("Logged out active slot. Removing local storage cache cleanly...");
      localStorage.removeItem('farm_ledger_database');
      setDb(getInitialDatabase());
    } catch (error) {
      console.error('Unified Google Auth Disconnect error:', error);
    }
  };

  if (!db) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 text-xs font-semibold text-gray-400">
        Starting Kothapalli's Farms Engine...
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
            Synchronizing Database
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold mt-1">
            Kothapalli's Farms Cloud
          </p>

          <p className="mt-5 text-slate-400 text-xs text-center leading-relaxed">
            Reading cells from synchronized Google Sheet spreadsheet...
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

        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-8 shadow-xl flex flex-col items-center">
          {/* Logo / App Brand Header */}
          <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-xs mb-5 border border-emerald-100">
            <Sprout size={32} />
          </div>

          <h1 className="text-2xl font-extrabold tracking-tight text-slate-800 text-center">
            Kothapalli's Farms
          </h1>
          <p className="text-xs uppercase tracking-widest text-emerald-600 font-bold mt-1.5 mb-7">
            Partnership Transparency
          </p>

          <div className="w-full border-t border-slate-100 mb-6" />

          {/* Prompt Information description */}
          <div className="text-slate-500 text-sm leading-relaxed mb-8 text-center space-y-2">
            <p>
              Welcome to the collaborative farm ledger portal for <strong>Kothapalli's Farms</strong>.
            </p>
            <p className="text-xs text-slate-405">
              Sign in with your Google account to authorize secure real-time access to our synchronized cloud database.
            </p>
          </div>

          {/* Live Auth state indicators */}
          {fetchError && (
            <div className="w-full mb-6 p-4 rounded-xl bg-red-50 border border-red-100 text-xs text-red-600 leading-relaxed font-medium">
              {fetchError === "session-expired" ? (
                <>
                  <p className="font-bold mb-1">Google Session Expired</p>
                  <p className="break-words">Your Google Authorization session has expired or was revoked. This is a standard security measure after 1 hour of inactivity.</p>
                  <p className="mt-2 text-[10px] text-emerald-600 font-bold">Please click the button below to sign in again and refresh access to your sheets.</p>
                </>
              ) : (
                <>
                  <p className="font-bold mb-1">Could not synchronize database:</p>
                  <p className="break-words">{formatErrorTextWithLinks(fetchError)}</p>
                  <p className="mt-2 text-[10px] text-slate-400">Please make sure your Google Account is permitted to access Sheet <strong>{db?.settings?.linkedSpreadsheetId || "1r820DlxdJEOZTYhh1DxGXdyv121d6isnFXix-n_C-Ts"}</strong>.</p>
                </>
              )}
            </div>
          )}

          {/* Dynamic Sign-In Trigger button */}
          <button
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-sm rounded-2xl border border-slate-250 shadow-xs hover:border-slate-350 hover:shadow-md cursor-pointer transition-all active:scale-98"
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
              <path
                fill="#EA4335"
                d="M12.24 10.285V14.4h6.887c-.275 1.565-1.88 4.604-6.887 4.604-4.33 0-7.859-3.579-7.859-8s3.53-8 7.859-8c2.46 0 4.105 1.025 5.047 1.926l3.242-3.12C18.416 1.832 15.541.97 12.24.97 6.13.97 1.13 5.97 1.13 12s5 11.03 11.11 11.03c6.38 0 10.618-4.484 10.618-10.8 0-.727-.076-1.282-.172-1.945H12.24z"
              />
            </svg>
            <span>Authorize Google Account</span>
          </button>
        </div>

        {/* Footer info lockup */}
        <p className="mt-8 text-center text-[10px] text-slate-400 font-medium">
          Secured via Google Firebase Auth & Sheets Sandbox API.
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
    creditRepayments = []
  } = db || {};

  // Persist helper
  const handleUpdateDatabase = (updatedFields: Partial<LocalDatabase>) => {
    const updatedDb = { ...db, ...updatedFields };
    setDb(updatedDb);
    saveDatabase(updatedDb);
  };

  const getAutoCategoryType = (category: string): Activity['type'] => {
    const cat = category.toLowerCase();
    if (cat.includes('seed') || cat.includes('sowing')) return 'Sowing';
    if (cat.includes('irrigation') || cat.includes('fuel') || cat.includes('water')) return 'Irrigation';
    if (cat.includes('fertilizer')) return 'Fertilizing';
    if (cat.includes('pesticide') || cat.includes('spray')) return 'Spraying';
    if (cat.includes('harvest') || cat.includes('selling')) return 'Harvesting';
    if (cat.includes('repair') || cat.includes('motor') || cat.includes('equipment')) return 'Equipment/Motor repair';
    if (cat.includes('transport')) return 'Transport';
    return 'Other';
  };

  // ACTIONS: Expenses
  const handleAddExpense = (exp: Expense) => {
    const nextList = [...expenses, exp];
    
    // Auto-generate Activity logs if no linkedActivityId
    let nextActivities = [...activities];
    if (!exp.linkedActivityId) {
      const payer = members.find(m => m.id === exp.paidByMemberId);
      const payerName = payer ? payer.name : 'Unknown';
      const type = getAutoCategoryType(exp.category);
      const suffix = exp.targetType === 'common' ? ' (Allocated across multiple seasons)' : '';
      const notes = `Logged cash expense: ${settings.currency}${exp.amount} spent on '${exp.category}'. Paid by ${payerName}.${suffix}`;

      if (exp.targetType === 'single' && exp.targetSeasonId && exp.targetFieldId) {
        const autoAct: Activity = {
          id: `act_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          date: exp.date,
          fieldId: exp.targetFieldId,
          seasonId: exp.targetSeasonId,
          type,
          notes
        };
        nextActivities.push(autoAct);
      } else if (exp.targetType === 'common' && exp.allocations && exp.allocations.length > 0) {
        exp.allocations.forEach((alloc, idx) => {
          const autoAct: Activity = {
            id: `act_auto_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
            date: exp.date,
            fieldId: alloc.fieldId,
            seasonId: alloc.seasonId,
            type,
            notes
          };
          nextActivities.push(autoAct);
        });
      }
    }

    const newDb = { ...db, expenses: nextList, activities: nextActivities };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'Expense',
      exp.id,
      `Recorded general cost expense category: "${exp.category}" of ${settings.currency}${exp.amount}`,
      exp.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleEditExpense = (updatedExp: Expense) => {
    const nextList = expenses.map(e => e.id === updatedExp.id ? updatedExp : e);
    const newDb = { ...db, expenses: nextList };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'Expense',
      updatedExp.id,
      `Updated expense charge: "${updatedExp.category}" to ${settings.currency}${updatedExp.amount}`,
      updatedExp.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleDeleteExpense = (id: string) => {
    const target = expenses.find(e => e.id === id);
    const nextList = expenses.filter(e => e.id !== id);
    const newDb = { ...db, expenses: nextList };
    if (target) {
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'Expense',
        id,
        `Deleted expense charge: "${target.category}" valued at ${settings.currency}${target.amount}`,
        target.paidByMemberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ expenses: nextList });
    }
  };

  // ACTIONS: Labour
  const handleAddLabour = (lab: Labour) => {
    const nextList = [...labours, lab];
    
    // Auto-generate Activity logs if no linkedActivityId
    let nextActivities = [...activities];
    if (!lab.linkedActivityId) {
      const payer = members.find(m => m.id === lab.paidByMemberId);
      const payerName = payer ? payer.name : 'Unknown';
      const notes = `Registered daily wage labor shift: ${lab.workersCount} worker(s) at ${settings.currency}${lab.wageRate}/worker. Total shift cost: ${settings.currency}${lab.totalCost} paid by ${payerName}.`;
      
      const autoAct: Activity = {
        id: `act_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: lab.date,
        fieldId: lab.fieldId,
        seasonId: lab.seasonId,
        type: 'Other',
        notes
      };
      nextActivities.push(autoAct);
    }

    const newDb = { ...db, labours: nextList, activities: nextActivities };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'Labour',
      lab.id,
      `Logged contract worker shift: ${lab.workersCount} people for ${settings.currency}${lab.totalCost}`,
      lab.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleEditLabour = (updatedLab: Labour) => {
    const nextList = labours.map(l => l.id === updatedLab.id ? updatedLab : l);
    const newDb = { ...db, labours: nextList };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'Labour',
      updatedLab.id,
      `Updated labour shift: ${updatedLab.workersCount} workers, cost ${settings.currency}${updatedLab.totalCost}`,
      updatedLab.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleDeleteLabour = (id: string) => {
    const target = labours.find(l => l.id === id);
    const nextList = labours.filter(l => l.id !== id);
    const newDb = { ...db, labours: nextList };
    if (target) {
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'Labour',
        id,
        `Removed labour payroll: ${target.workersCount} workers, cost ${settings.currency}${target.totalCost}`,
        target.paidByMemberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ labours: nextList });
    }
  };

  // ACTIONS: Harvest Sales
  const handleAddRevenue = (rev: HarvestRevenue) => {
    const nextList = [...revenues, rev];
    
    // Auto-generate Activity logs if no linkedActivityId
    let nextActivities = [...activities];
    if (!rev.linkedActivityId) {
      const receiver = members.find(m => m.id === rev.receivedByMemberId);
      const receiverName = receiver ? receiver.name : 'Unknown';
      const notes = `Concluded harvest sale receipt: Sold crop "${rev.crop}" of quantity ${rev.quantity} to ${rev.buyerName || 'Local Buyer'} for gross revenue of ${settings.currency}${rev.saleAmount}. Consolidated payout received by ${receiverName}.`;
      
      const autoAct: Activity = {
        id: `act_auto_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        date: rev.date,
        fieldId: rev.fieldId,
        seasonId: rev.seasonId,
        type: 'Harvesting',
        notes
      };
      nextActivities.push(autoAct);
    }

    const newDb = { ...db, revenues: nextList, activities: nextActivities };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'HarvestRevenue',
      rev.id,
      `Logged harvest product sale receipt: "${rev.crop}" of quantity ${rev.quantity} valuing ${settings.currency}${rev.saleAmount}`,
      rev.receivedByMemberId
    );
    setDb(finalDb);
  };

  const handleEditRevenue = (updatedRev: HarvestRevenue) => {
    const nextList = revenues.map(r => r.id === updatedRev.id ? updatedRev : r);
    const newDb = { ...db, revenues: nextList };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'HarvestRevenue',
      updatedRev.id,
      `Updated harvest product sale receipt: "${updatedRev.crop}" of quantity ${updatedRev.quantity} to ${settings.currency}${updatedRev.saleAmount}`,
      updatedRev.receivedByMemberId
    );
    setDb(finalDb);
  };

  const handleDeleteRevenue = (id: string) => {
    const target = revenues.find(r => r.id === id);
    const nextList = revenues.filter(r => r.id !== id);
    const newDb = { ...db, revenues: nextList };
    if (target) {
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'HarvestRevenue',
        id,
        `Excised harvest product receipt: "${target.crop}" of ${settings.currency}${target.saleAmount}`,
        target.receivedByMemberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ revenues: nextList });
    }
  };

  // ACTIONS: Credit Profiles & Repayments
  const handleAddCreditAccount = (acc: CreditAccount) => {
    const nextList = [...creditAccounts, acc];
    const newDb = { ...db, creditAccounts: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'CreditAccount' as any,
      acc.id,
      `Registered creditor profile: "${acc.name}" (${acc.type})`
    );
    setDb(finalDb);
  };

  const handleEditCreditAccount = (updatedAcc: CreditAccount) => {
    const nextList = creditAccounts.map(c => c.id === updatedAcc.id ? updatedAcc : c);
    const newDb = { ...db, creditAccounts: nextList };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'CreditAccount' as any,
      updatedAcc.id,
      `Updated creditor profile details: "${updatedAcc.name}" (${updatedAcc.type})`
    );
    setDb(finalDb);
  };

  const handleDeleteCreditAccount = (id: string) => {
    const target = creditAccounts.find(c => c.id === id);
    const nextList = creditAccounts.filter(c => c.id !== id);
    const newDb = { ...db, creditAccounts: nextList };
    if (target) {
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'CreditAccount' as any,
        id,
        `Removed creditor: "${target.name}"`
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ creditAccounts: nextList });
    }
  };

  const handleAddCreditRepayment = (rep: CreditRepayment) => {
    const nextList = [...creditRepayments, rep];
    const newDb = { ...db, creditRepayments: nextList };
    const creditor = creditAccounts.find(c => c.id === rep.creditAccountId);
    const memberName = members.find(m => m.id === rep.memberId)?.name || 'Unknown Partner';
    const finalDb = addAuditLog(
      newDb,
      'create',
      'CreditRepayment' as any,
      rep.id,
      `Paid settlement repayment of ${settings.currency}${rep.amount} to creditor "${creditor ? creditor.name : 'Unknown'}" by partner "${memberName}"`,
      rep.memberId
    );
    setDb(finalDb);
  };

  const handleDeleteCreditRepayment = (id: string) => {
    const target = creditRepayments.find(r => r.id === id);
    const nextList = creditRepayments.filter(r => r.id !== id);
    const newDb = { ...db, creditRepayments: nextList };
    if (target) {
      const creditor = creditAccounts.find(c => c.id === target.creditAccountId);
      const finalDb = addAuditLog(
        newDb,
        'delete',
        'CreditRepayment' as any,
        id,
        `Voided repayment of ${settings.currency}${target.amount} to creditor "${creditor ? creditor.name : 'Unknown'}"`,
        target.memberId
      );
      setDb(finalDb);
    } else {
      handleUpdateDatabase({ creditRepayments: nextList });
    }
  };

  // ACTIONS: Stock Items / Purchases / Usages
  const handleAddStockItem = (item: StockItem) => {
    const nextList = [...stockItems, item];
    const newDb = { ...db, stockItems: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'StockItem',
      item.id,
      `Registered new physical asset ledger category: "${item.name}" measured in "${item.unit}"`
    );
    setDb(finalDb);
  };

  const handleAddPurchase = (purc: StockPurchase) => {
    const nextList = [...purchases, purc];
    const item = stockItems.find(i => i.id === purc.stockItemId);
    const newDb = { ...db, purchases: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'StockPurchase',
      purc.id,
      `Purchased physical stock replenishment: ${purc.quantity} ${item?.unit || ''} of "${item?.name || 'materials'}" for total ${settings.currency}${purc.totalCost}`,
      purc.paidByMemberId
    );
    setDb(finalDb);
  };

  const handleAddUsage = (use: StockUsage) => {
    const nextList = [...usages, use];
    const item = stockItems.find(i => i.id === use.stockItemId);
    
    // Auto sow an activity log for tracking timeline!
    const cropSeason = seasons.find(s => s.id === use.targetSeasonId);
    let autoActivity: Activity | null = null;
    if (use.targetType === 'single' && cropSeason) {
      autoActivity = {
        id: `act_auto_${Date.now()}`,
        fieldId: use.targetFieldId!,
        seasonId: use.targetSeasonId!,
        date: use.date,
        type: item?.type === 'Seed' ? 'Sowing' : item?.type === 'Pesticide' ? 'Spraying' : 'Fertilizing',
        notes: `System-generated Activity Log: Applied ${use.quantityUsed} ${item?.unit} of ${item?.name} onto plot details.`
      };
    }

    const nextActivities = autoActivity ? [...activities, autoActivity] : activities;
    const newDb = { ...db, usages: nextList, activities: nextActivities };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'StockUsage',
      use.id,
      `Consumed physical stock out of stockroom: ${use.quantityUsed} ${item?.unit || ''} of "${item?.name || 'materials'}" as field expense input`
    );
    setDb(finalDb);
  };

  // ACTIONS: Field Plots
  const handleAddField = (field: Field) => {
    const nextList = [...fields, field];
    const newDb = { ...db, fields: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'Field',
      field.id,
      `Registered land tract: "${field.name}" size ${field.area} ${settings.areaUnit}`
    );
    setDb(finalDb);
  };

  const handleDeleteField = (id: string) => {
    const target = fields.find(f => f.id === id);
    if (!target) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Land Boundary',
      message: `Are you sure you want to permanently delete field records for "${target.name}"? This could affect historic information and everything associated with this field will also be deleted.`,
      confirmText: 'Delete Field',
      onConfirm: () => {
        const nextList = fields.filter(f => f.id !== id);
        const newDb = { ...db, fields: nextList };
        const finalDb = addAuditLog(
          newDb,
          'delete',
          'Field',
          id,
          `Removed boundary records: "${target.name}"`
        );
        setDb(finalDb);
        setConfirmDialog(null);
      }
    });
  };

  // ACTIONS: Season Crop Cycles
  const handleAddSeason = (season: Season) => {
    const nextList = [...seasons, season];
    const firstAct: Activity = {
      id: `act_init_${Date.now()}`,
      fieldId: season.fieldId,
      seasonId: season.id,
      date: season.startDate,
      type: 'Sowing',
      notes: `Registered and started crop season cycle: Sowed "${season.cropName}". Initial soil preparations accomplished.`
    };

    const newDb = { ...db, seasons: nextList, activities: [...activities, firstAct] };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'Season',
      season.id,
      `Created and sowed cropping cycle: "${season.cropName}"`
    );
    setDb(finalDb);
  };

  const handleCloseSeason = (id: string, endDate: string) => {
    const nextList = seasons.map(s => s.id === id ? { ...s, isClosed: true, endDate } : s);
    const target = seasons.find(s => s.id === id);
    if (!target) return;

    const harvestAct: Activity = {
      id: `act_harvest_${Date.now()}`,
      fieldId: target.fieldId,
      seasonId: id,
      date: endDate,
      type: 'Harvesting',
      notes: `Crop successfully harvested and cropping season closed on database. Preparing balance ledger metrics.`
    };

    const newDb = { ...db, seasons: nextList, activities: [...activities, harvestAct] };
    const finalDb = addAuditLog(
      newDb,
      'edit',
      'Season',
      id,
      `Closed cropping cycle crop season: "${target.cropName}" marked harvested`
    );
    setDb(finalDb);
  };

  const handleDeleteSeason = (id: string) => {
    const target = seasons.find(s => s.id === id);
    if (!target) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Closed Season',
      message: `Are you sure you want to permanently delete the completed cropping season: "${target.cropName}"? This action is irreversible and will fully purge this cycle from historical records.`,
      confirmText: 'Delete Season',
      onConfirm: () => {
        const nextList = seasons.filter(s => s.id !== id);
        const newDb = { ...db, seasons: nextList };
        const finalDb = addAuditLog(
          newDb,
          'delete',
          'Season',
          id,
          `Deleted completed and fully settled cropping season cycle: "${target.cropName}"`
        );
        setDb(finalDb);
        setConfirmDialog(null);
      }
    });
  };

  const handleAddActivity = (act: Activity) => {
    const nextList = [...activities, act];
    const newDb = { ...db, activities: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'Activity',
      act.id,
      `Manually logged activity: "${act.type}" - "${act.notes.slice(0, 40)}..."`
    );
    setDb(finalDb);
  };

  // ACTIONS: Partners
  const handleAddMember = (m: Member) => {
    const nextList = [...members, m];
    const newDb = { ...db, members: nextList };
    const finalDb = addAuditLog(
      newDb,
      'create',
      'Member',
      m.id,
      `Registered partner stakeholder: "${m.name}"`
    );
    setDb(finalDb);
  };

  const handleDeleteMember = (id: string) => {
    const target = members.find(m => m.id === id);
    if (!target) return;

    setConfirmDialog({
      isOpen: true,
      title: 'Delete Member Profile',
      message: `Are you sure you want to permanently delete partner profile for "${target.name}"? This could affect historic fields which reference this member's shares.`,
      confirmText: 'Delete Member',
      onConfirm: () => {
        const nextList = members.filter(m => m.id !== id);
        const newDb = { ...db, members: nextList };
        const finalDb = addAuditLog(
          newDb,
          'delete',
          'Member',
          id,
          `Expelled partner record: "${target.name}"`
        );
        setDb(finalDb);
        setConfirmDialog(null);
      }
    });
  };

  // ACTIONS: Preferences
  const handleSaveSettings = (nextSettings: Settings) => {
    handleUpdateDatabase({ settings: nextSettings });
  };

  // ACTIONS: Import Backups JSON
  const handleImportDatabase = (nextData: any) => {
    handleUpdateDatabase(nextData);
    handleAudit('edit', 'Database', `Database full restoration performed via custom JSON backup file`);
  };

  const handleAudit = (action: AuditLog['actionType'], type: string, desc: string) => {
    const finalDb = addAuditLog(db, action, type, '', desc);
    setDb(finalDb);
  };

  // ACTIONS: Google Sheets pull Trigger
  const handleTriggerPull = async (accessToken: string, spreadsheetId: string) => {
    const sheetData = await pullDataFromSpreadsheet(accessToken, spreadsheetId);
    if (sheetData) {
      const finalDb = addAuditLog(
        { ...db, ...sheetData },
        'edit',
        'Database',
        spreadsheetId,
        `Overrode local state storage by pulling data from linked Google Sheet: "${spreadsheetId}"`
      );
      setDb(finalDb);
    }
  };

  const handleTriggerSync = async (accessToken: string, spreadsheetId: string) => {
    // Synchronize spreadsheet - custom REST handler in settings itself
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 flex flex-col antialiased">
      {/* Mobile-first top navigation banner bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-6 py-4 shrink-0 shadow-xs flex justify-between items-center print:hidden">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-xs">
            <Sprout size={20} />
          </span>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-slate-800">Kothapalli's Farms</h1>
            <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-semibold">Partnership Transparency</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {accessToken && (
            <div className="flex items-center gap-2">
              {syncingState === 'syncing' && (
                <span className="text-amber-600 flex items-center gap-1.5 text-xs font-semibold">
                  <RefreshCw size={13} className="animate-spin text-amber-500" />
                  <span className="hidden sm:inline">Saving to Sheet...</span>
                </span>
              )}
              {syncingState === 'success' && (
                <span className="text-emerald-700 flex items-center gap-1.5 text-xs font-semibold" title={syncMessage}>
                  <Check size={14} className="text-emerald-500 font-bold bg-emerald-50 rounded-full border border-emerald-100 p-0.5" />
                  <span className="hidden sm:inline">Synced</span>
                </span>
              )}
              {syncingState === 'failed' && (
                <span className="text-red-600 flex items-center gap-1.5 text-xs font-semibold" title={syncMessage}>
                  <X size={13} className="text-red-500 font-bold bg-red-50 rounded-full border border-red-100 p-0.5" />
                  <span className="hidden sm:inline text-[10px]">Sync failed</span>
                </span>
              )}
              <button
                disabled={syncingState === 'syncing'}
                onClick={() => syncDatabaseAcrossCloud(db)}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer transition-all ${
                  syncingState === 'syncing'
                    ? 'bg-slate-50 text-slate-400 border-slate-150 animate-pulse'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-350 active:scale-95'
                }`}
                title="Force Synchronize with Google Sheet"
              >
                <RefreshCw size={12} className={syncingState === 'syncing' ? 'animate-spin' : ''} />
                <span>Sync Now</span>
              </button>
            </div>
          )}

          {seasons.filter(s => !s.isClosed).length > 0 && (
            <span className="hidden sm:inline-block text-[10px] bg-emerald-50 text-emerald-700 font-bold px-3 py-1.5 rounded-lg border border-emerald-100 uppercase tracking-widest">
              ● {seasons.filter(s => !s.isClosed).length} Active Seasons
            </span>
          )}
        </div>
      </header>

      {/* Main container body */}
      <main className="flex-1 w-full max-w-7xl mx-auto flex flex-col md:flex-row pb-16 md:pb-0 md:h-[calc(100vh-69px)] overflow-hidden">
        
        {/* Desktop Sidebar navigation / Mobile Bottom navigation */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-250 p-2 flex gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] justify-start md:relative md:bottom-auto md:left-auto md:right-auto md:border-t-0 md:border-r md:border-slate-200 md:w-64 md:flex-col md:justify-start md:gap-1.5 md:p-4 print:hidden shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] md:shadow-none">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'dashboard'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <LayoutDashboard size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('money')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'money'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <FileText size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Transactions</span>
          </button>

          <button
            onClick={() => setActiveTab('stock')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'stock'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <PackageOpen size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Inventory</span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'timeline'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <CalendarDays size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Farm Activity</span>
          </button>

          <button
            onClick={() => setActiveTab('settle')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'settle'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Coins size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Settle Bilateral</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'members'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Users size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Fields & Directory</span>
          </button>

          <button
            onClick={() => setActiveTab('credits')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'credits'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <CreditCard size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Credit & Payables</span>
          </button>

          <div className="hidden md:block border-t border-slate-200 my-3 pt-3" />

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex flex-col md:flex-row items-center gap-1 md:gap-3 px-2 md:px-3 py-1.5 md:py-2.5 rounded-xl text-[9px] sm:text-[10px] md:text-xs font-semibold tracking-wide transition-all shrink-0 w-[95px] md:w-full md:text-left cursor-pointer border md:border-l-4 ${
              activeTab === 'settings'
                ? 'bg-slate-100 text-slate-900 font-bold border-slate-200 md:border-l-emerald-600'
                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 border-transparent'
            }`}
          >
            <Wrench size={16} className="shrink-0" />
            <span className="truncate md:whitespace-normal">Audit & Config</span>
          </button>
        </nav>

        {/* Dynamic component contents viewport with scroll boundary */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:p-8 md:h-full pb-24 md:pb-8">
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
              onAddPurchase={handleAddPurchase}
              onAddUsage={handleAddUsage}
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
              onAddMember={handleAddMember}
              onAddField={handleAddField}
              onAddSeason={handleAddSeason}
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
              onTriggerSync={handleTriggerSync}
              onTriggerPull={handleTriggerPull}
              localData={db}
              user={user}
              accessToken={accessToken}
              onLogin={handleLogin}
              onLogout={handleLogout}
            />
          )}
        </div>
      </main>

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
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  confirmDialog.onConfirm();
                }}
                className="px-5 py-2 text-xs font-extrabold text-white bg-red-600 hover:bg-red-700 active:scale-95 rounded-xl transition-all shadow-sm cursor-pointer"
              >
                {confirmDialog.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
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
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 text-[11px] space-y-1.5 leading-relaxed font-medium">
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
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 text-[11px] space-y-1 font-medium">
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
                    <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-150 text-[11px] space-y-2 font-medium">
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
