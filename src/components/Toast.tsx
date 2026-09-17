/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onDismiss: () => void;
  durationMs?: number;
}

export const Toast: React.FC<ToastProps> = ({ message, onDismiss, durationMs = 2600 }) => {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] max-w-[92vw] animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-center gap-2.5 bg-slate-900 text-white pl-4 pr-3 py-3 rounded-2xl shadow-2xl">
        <CheckCircle2 size={17} className="text-emerald-400 shrink-0" />
        <span className="text-xs font-semibold">{message}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="ml-1 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          aria-label="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
};
