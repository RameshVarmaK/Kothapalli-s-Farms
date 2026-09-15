/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, GitMerge, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';

interface ConflictData {
  local: any;
  cloud: any;
  diffDetails: { [key: string]: { localCount: number; cloudCount: number } };
}

interface SheetsConflictModalProps {
  conflictData: ConflictData;
  onSmartMerge: () => void;
  onKeepCloud: () => void;
  onKeepLocal: () => void;
  onCancel: () => void;
}

export const SheetsConflictModal: React.FC<SheetsConflictModalProps> = ({
  conflictData,
  onSmartMerge,
  onKeepCloud,
  onKeepLocal,
  onCancel
}) => {
  return (
    <div className="fixed inset-0 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in duration-100">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-5 bg-amber-50 border-b border-amber-100 flex items-start gap-4">
          <div className="p-2 bg-amber-100 rounded-2xl text-amber-600 shrink-0">
            <AlertTriangle size={24} className="stroke-[2.5]" />
          </div>
          <div>
            <h3 className="font-extrabold text-slate-900 text-base">Google Sheets Conflict Detected</h3>
            <p className="text-slate-650 text-xs font-semibold mt-1 leading-relaxed">
              The local database on this device differs from the version saved in your linked Google Sheet. Select a synchronization strategy to resolve this inconsistency.
            </p>
          </div>
        </div>

        {/* Content: DB Comparison */}
        <div className="p-6 space-y-6 max-h-[50vh] overflow-y-auto">
          {/* Columns Side by Side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Local DB */}
            <div className="p-4 rounded-2xl border border-slate-150 bg-slate-50/50">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-blue-600" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-700">This Device (Local)</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600 font-semibold text-[11px]">
                <p className="flex justify-between gap-2">
                  <span className="text-slate-400">Latest Action:</span>
                  <span className="text-slate-800 text-right max-w-[150px] truncate" title={conflictData.local.auditLogs?.[0]?.description || 'Initial Database State'}>
                    {conflictData.local.auditLogs?.[0]?.description || 'Initial Database State'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Action Type:</span>
                  <span className="text-slate-800 font-mono text-[10px] uppercase bg-slate-100 px-1.5 rounded">
                    {conflictData.local.auditLogs?.[0]?.actionType || 'none'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="text-slate-800 font-mono text-[10px]">
                    {conflictData.local.auditLogs?.[0]?.timestamp
                      ? new Date(conflictData.local.auditLogs[0].timestamp).toLocaleTimeString() + ' ' + new Date(conflictData.local.auditLogs[0].timestamp).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </p>
              </div>
            </div>

            {/* Cloud DB */}
            <div className="p-4 rounded-2xl border border-emerald-150 bg-emerald-50/10">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
                <span className="font-bold text-xs uppercase tracking-wider text-slate-750">Google Sheet (Cloud)</span>
              </div>
              <div className="space-y-1.5 text-xs text-slate-600 font-semibold text-[11px]">
                <p className="flex justify-between gap-2">
                  <span className="text-slate-400">Latest Action:</span>
                  <span className="text-slate-800 text-right max-w-[150px] truncate" title={conflictData.cloud.auditLogs?.[0]?.description || 'Initial Database State'}>
                    {conflictData.cloud.auditLogs?.[0]?.description || 'Initial Database State'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Action Type:</span>
                  <span className="text-slate-800 font-mono text-[10px] uppercase bg-slate-100 px-1.5 rounded">
                    {conflictData.cloud.auditLogs?.[0]?.actionType || 'none'}
                  </span>
                </p>
                <p className="flex justify-between">
                  <span className="text-slate-400">Timestamp:</span>
                  <span className="text-slate-800 font-mono text-[10px]">
                    {conflictData.cloud.auditLogs?.[0]?.timestamp
                      ? new Date(conflictData.cloud.auditLogs[0].timestamp).toLocaleTimeString() + ' ' + new Date(conflictData.cloud.auditLogs[0].timestamp).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </p>
              </div>
            </div>
          </div>

          {/* Difference breakdown checklist */}
          <div className="space-y-2">
            <h4 className="font-bold text-[10px] text-slate-450 uppercase tracking-widest">Detail Discrepancies</h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(conflictData.diffDetails).map(([key, value]) => {
                const typedVal = value as { localCount: number; cloudCount: number };
                const isDiff = typedVal.localCount !== typedVal.cloudCount;
                return (
                  <div
                    key={key}
                    className={`p-2 rounded-xl border flex flex-col justify-between text-xs transition-colors ${
                      isDiff ? 'border-amber-200 bg-amber-50/20' : 'border-slate-100 bg-slate-50/30'
                    }`}
                  >
                    <span className="font-bold text-slate-500 capitalize text-[10px]">{key.replace(/([A-Z])/g, ' $1')}</span>
                    <div className="flex items-baseline gap-1 mt-1 font-mono text-xs">
                      <span className={`font-bold ${isDiff ? 'text-amber-700' : 'text-slate-700'}`}>
                        {typedVal.localCount}
                      </span>
                      <span className="text-[9px] text-slate-400">vs</span>
                      <span className={`font-bold ${isDiff ? 'text-amber-700' : 'text-slate-700'}`}>
                        {typedVal.cloudCount}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Buttons styled as cards to make it intuitive and clear */}
        <div className="px-6 py-6 bg-slate-50 border-t border-slate-100 space-y-3">
          {/* Option 1: Smart Merge (Recommended) */}
          <button
            type="button"
            onClick={onSmartMerge}
            className="w-full text-left p-4 bg-white hover:bg-emerald-50/10 border-2 border-emerald-600/30 hover:border-emerald-600 rounded-2xl flex gap-4 transition-all group shadow-sm cursor-pointer"
          >
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-105 transition-transform shrink-0">
              <GitMerge size={20} className="stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-extrabold text-slate-900 text-xs sm:text-sm">Smart Merge Histories (Highly Recommended)</span>
                <span className="px-2 py-0.5 rounded-full text-[9px] bg-emerald-100 text-emerald-800 font-extrabold uppercase">Safe Sync</span>
              </div>
              <p className="text-slate-500 text-[10px] leading-relaxed mt-1 font-semibold">
                Merges conflict items by their unique tracking IDs. Preserves non-overlapping changes from both this device and Google Sheets.
              </p>
            </div>
          </button>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Option 2: Cloud Wins */}
            <button
              type="button"
              onClick={onKeepCloud}
              className="text-left p-4 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-slate-400 rounded-2xl flex gap-3 transition-all group cursor-pointer"
            >
              <div className="p-2 bg-slate-50 text-slate-500 group-hover:text-slate-950 rounded-xl shrink-0">
                <ArrowDownCircle size={18} />
              </div>
              <div>
                <span className="font-extrabold text-slate-900 text-xs">Keep Cloud (Overwrite Local)</span>
                <p className="text-slate-500 text-[10px] leading-normal mt-1 font-medium">
                  Replaces this device database with the version on Google Sheets. Discards local edits.
                </p>
              </div>
            </button>

            {/* Option 3: Local Wins */}
            <button
              type="button"
              onClick={onKeepLocal}
              className="text-left p-4 bg-white hover:bg-slate-100/50 border border-slate-200 hover:border-slate-400 rounded-2xl flex gap-3 transition-all group cursor-pointer"
            >
              <div className="p-2 bg-slate-50 text-slate-500 group-hover:text-slate-950 rounded-xl shrink-0">
                <ArrowUpCircle size={18} />
              </div>
              <div>
                <span className="font-extrabold text-slate-900 text-xs">Keep Local (Overwrite Cloud)</span>
                <p className="text-slate-500 text-[10px] leading-normal mt-1 font-medium">
                  Pushes this device's state to Google Sheets, completely overwriting the spreadsheet.
                </p>
              </div>
            </button>
          </div>

          {/* Close Footer links */}
          <div className="flex justify-end pt-3 text-xs">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              Cancel & Postpone Resolution
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
