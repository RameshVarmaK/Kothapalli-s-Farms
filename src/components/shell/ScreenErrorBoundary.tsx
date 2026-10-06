/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { logError } from '../../utils/errorLogging';

/**
 * Keeps a crash inside one screen (or a report opened from it) on that
 * screen. Without it, any render error unmounted the whole app and left a
 * blank page with no way back but a reload — which is how a bad value in a
 * partner ledger looked like "the app went white".
 */
export class ScreenErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    logError('screen_render_failed', error);
  }

  render() {
    if (this.state.failed) {
      return <ScreenErrorFallback onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}

const ScreenErrorFallback: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useLanguage();
  return (
    <div role="alert" className="flex items-center justify-center min-h-[50vh] p-6">
      <div className="max-w-sm w-full bg-white border border-amber-200 rounded-2xl p-6 text-center shadow-xs">
        <AlertTriangle size={24} className="text-amber-500 mx-auto" />
        <p className="mt-3 text-sm font-bold text-slate-800">{t('Something went wrong on this screen')}</p>
        <p className="mt-1 text-xs text-slate-500 leading-relaxed">
          {t('Your entries are not affected. Try again, or open another tab.')}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
        >
          <RefreshCw size={12} />
          {t('Try again')}
        </button>
      </div>
    </div>
  );
};
