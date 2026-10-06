/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AlertTriangle } from 'lucide-react';
import type { AuthError } from '../../hooks/useGoogleAuth';

interface AuthErrorModalProps {
  authError: AuthError;
  onDismiss: () => void;
}

/** Deployment diagnostics for a failed Google sign-in inside the app. */
export function AuthErrorModal({ authError, onDismiss }: AuthErrorModalProps) {
  return (
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
            onClick={() => onDismiss()}
            className="px-5 py-2 text-xs font-extrabold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all shadow-sm cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
