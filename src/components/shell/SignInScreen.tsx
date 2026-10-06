/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Sprout } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { PLACEHOLDER_SPREADSHEET_ID } from '../../utils/database';
import type { AuthError } from '../../hooks/useGoogleAuth';

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

interface SignInScreenProps {
  fetchError: string | null;
  authError: AuthError | null;
  pendingChanges: number;
  linkedSpreadsheetId: string | undefined;
  onLogin: () => void;
}

/** Shown whenever there is no Google access token: first visit, after
 * signing out, or when the session expired or the sign-in pull failed. */
export function SignInScreen({ fetchError, authError, pendingChanges, linkedSpreadsheetId, onLogin }: SignInScreenProps) {
  const { language, setLanguage, t } = useLanguage();
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
                <p className="mt-2 text-[10px] text-slate-400">{t('Please make sure your Google Account is permitted to access Sheet')} <strong>{linkedSpreadsheetId || PLACEHOLDER_SPREADSHEET_ID}</strong>.</p>
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
          onClick={() => onLogin()}
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
