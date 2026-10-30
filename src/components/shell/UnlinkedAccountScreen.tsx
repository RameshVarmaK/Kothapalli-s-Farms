/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { UserX, LogOut } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface UnlinkedAccountScreenProps {
  email: string | null | undefined;
  onLogout: () => void;
}

/**
 * The ledger uses partner roles, and this Google account matches none of
 * the partners. Shows nothing from the ledger: who the partners are, what
 * was spent, or which fields exist.
 */
export function UnlinkedAccountScreen({ email, onLogout }: UnlinkedAccountScreenProps) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-6 antialiased font-sans">
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-amber-500" />
      <div className="w-full max-w-sm bg-white rounded-3xl border border-slate-200 p-8 shadow-xl flex flex-col items-center text-center" data-testid="unlinked-account">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center border border-amber-100 mb-5">
          <UserX size={24} />
        </div>
        <h2 className="text-base font-bold tracking-tight text-slate-800">{t('This Google account is not linked to a partner')}</h2>
        {email && <p className="text-xs font-mono text-slate-500 mt-2 break-all">{email}</p>}
        <p className="mt-4 text-slate-500 text-xs leading-relaxed">
          {t('Ask the ledger owner to add this email to your partner record under Fields & Directory. Until then, nothing from the ledger is shown here.')}
        </p>
        <button
          type="button"
          onClick={() => onLogout()}
          className="mt-6 flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 rounded-xl cursor-pointer"
        >
          <LogOut size={14} />
          {t('Sign out')}
        </button>
      </div>
    </div>
  );
}
