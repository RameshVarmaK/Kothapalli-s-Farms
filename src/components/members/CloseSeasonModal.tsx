/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Season } from '../../types';
import { X } from 'lucide-react';

interface CloseSeasonModalProps {
  seasonId: string | null;
  seasons: Season[];
  date: string;
  setDate: (v: string) => void;
  onClose: () => void;
  onConfirm: (id: string, date: string) => void;
}

export const CloseSeasonModal: React.FC<CloseSeasonModalProps> = ({
  seasonId,
  seasons,
  date,
  setDate,
  onClose,
  onConfirm,
}) => {
  if (!seasonId) return null;
  const season = seasons.find(s => s.id === seasonId);
  if (!season) return null;

  return (
    <div className="fixed inset-0 z-55 bg-slate-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl p-6 border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex justify-between items-start">
          <div>
            <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-150 font-bold px-2 py-0.5 rounded-lg uppercase tracking-wider">
              Conclude Cropping Cycle
            </span>
            <h3 className="text-sm font-extrabold text-slate-800 mt-2">Mark Crop Harvested</h3>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">Conclude "{season.cropName}" cycle and freeze its ledger records.</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5">Harvesting End Date</label>
            <input
              type="date"
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full bg-slate-50 border border-slate-150 rounded-xl px-3 py-2 text-xs text-slate-750 font-medium"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-550 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(seasonId, date)}
            className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white cursor-pointer shadow-xs active:scale-95 transition-transform text-center"
          >
            Confirm Harvest
          </button>
        </div>
      </div>
    </div>
  );
};
