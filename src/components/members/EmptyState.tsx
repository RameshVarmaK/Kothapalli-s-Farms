/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Plus } from 'lucide-react';

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaLabel: string;
  onCta: () => void;
}> = ({ icon, title, description, ctaLabel, onCta }) => (
  <div className="flex flex-col items-center justify-center text-center py-16 px-6">
    <span className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
      {icon}
    </span>
    <h4 className="font-bold text-slate-800 text-sm mb-1.5">{title}</h4>
    <p className="text-xs text-slate-400 max-w-xs leading-relaxed mb-5">{description}</p>
    <button
      onClick={onCta}
      className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 font-bold text-white px-4 py-2 rounded-xl text-xs active:scale-95 cursor-pointer shadow-xs"
    >
      <Plus size={14} />
      {ctaLabel}
    </button>
  </div>
);
