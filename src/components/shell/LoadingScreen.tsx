/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sprout } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

/** Shown while the ledger is being pulled from the Google Sheet on sign-in. */
export function LoadingScreen() {
  const { t } = useLanguage();
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
