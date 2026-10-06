/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sprout, Check, X, RefreshCw, Menu } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { useViewMode } from '../../hooks/useViewMode';
import type { SyncingState } from '../../hooks/useSheetSync';
import type { Season } from '../../types';

interface AppHeaderProps {
  accessToken: string | null;
  syncingState: SyncingState;
  syncMessage: string;
  pendingChanges: number;
  seasons: Season[];
  onSyncNow: () => void;
  onOpenMobileNav: () => void;
}

export function AppHeader({
  accessToken,
  syncingState,
  syncMessage,
  pendingChanges,
  seasons,
  onSyncNow,
  onOpenMobileNav
}: AppHeaderProps) {
  const { mode, setMode } = useViewMode();
  const { language, setLanguage, t } = useLanguage();
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 md:px-6 py-3 md:py-4 shrink-0 shadow-xs flex justify-between items-center print:hidden">
      <button
        onClick={() => onOpenMobileNav()}
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
              onClick={() => onSyncNow()}
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
  );
}
