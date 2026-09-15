/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Field, Season } from '../../types';
import { Grid, FileText, Pencil, Trash2 } from 'lucide-react';
import { EmptyState } from './EmptyState';

interface SeasonsListProps {
  seasons: Season[];
  fields: Field[];
  checkSeasonSettled: (seasonId: string) => boolean;
  onGoToFields: () => void;
  onAddFirst: () => void;
  onViewReport: (seasonId: string) => void;
  onEditSeason: (season: Season) => void;
  onCloseCropSeason: (id: string) => void;
  onDeleteSeason: (id: string) => void;
}

export const SeasonsList: React.FC<SeasonsListProps> = ({
  seasons,
  fields,
  checkSeasonSettled,
  onGoToFields,
  onAddFirst,
  onViewReport,
  onEditSeason,
  onCloseCropSeason,
  onDeleteSeason,
}) => {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/50">
        <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">Sown Cropping Cycles</h3>
      </div>

      {seasons.length === 0 ? (
        <EmptyState
          icon={<Grid size={22} />}
          title="No crop seasons yet"
          description={
            fields.length === 0
              ? 'Register a field first, then sow a crop season on it to start logging expenses, labour and harvest against it.'
              : 'A season tracks one crop cycle on one field, from sowing to harvest. Sow your first one to start logging activity against it.'
          }
          ctaLabel={fields.length === 0 ? 'Register a Field First' : 'Sow First Crop'}
          onCta={() => {
            if (fields.length === 0) {
              onGoToFields();
            } else {
              onAddFirst();
            }
          }}
        />
      ) : (
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="border-b border-slate-200 text-slate-400 bg-slate-50/50 font-bold text-[10px] uppercase tracking-widest">
            <th className="px-6 py-4">Sown Field</th>
            <th className="px-6 py-4">Crop Name</th>
            <th className="px-6 py-4">Sown Date</th>
            <th className="px-6 py-4 text-right">Actions / Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 text-slate-700">
          {seasons.map(s => {
            const f = fields.find(field => field.id === s.fieldId)!;
            return (
              <tr key={s.id} className="hover:bg-slate-50/50 font-medium pb-2">
                <td className="px-6 py-4 font-bold text-slate-800">{f ? f.name : 'Unknown'}</td>
                <td className="px-6 py-4 font-bold text-emerald-800">{s.cropName}</td>
                <td className="px-6 py-4 mono-num text-slate-500 font-mono">{s.startDate}</td>
                <td className="px-6 py-4 text-right flex items-center justify-end gap-2.5">
                  <button
                    onClick={() => onViewReport(s.id)}
                    className="text-[10px] text-slate-700 hover:text-emerald-800 bg-slate-100 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-250 font-bold px-3 py-1.5 rounded-lg border-slate-200 hover:border-slate-350 cursor-pointer transition-all flex items-center gap-1.5 shadow-2xs"
                  >
                    <FileText size={12} className="text-emerald-600" />
                    <span>View Report</span>
                  </button>
                  <button
                    onClick={() => onEditSeason(s)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 border border-slate-250 hover:border-emerald-150 transition-colors cursor-pointer"
                    title="Edit Season & Ownership Shares"
                  >
                    <Pencil size={13} />
                  </button>
                  {s.isClosed ? (
                    <div className="flex items-center gap-2 justify-end">
                      <span className="inline-flex items-center gap-1 text-[10px] text-slate-450 bg-slate-100 font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 uppercase tracking-wider">
                        Closed {s.endDate}
                      </span>
                      {checkSeasonSettled(s.id) ? (
                        <button
                          onClick={() => onDeleteSeason(s.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 border border-slate-250 hover:border-red-150 transition-colors cursor-pointer"
                          title="Delete Season (Fully Settled)"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : (
                        <span className="text-[9px] text-slate-400 max-w-[80px] leading-tight text-right italic font-medium">
                          Pending settlement
                        </span>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => onCloseCropSeason(s.id)}
                      className="text-[10px] text-emerald-800 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-150 font-bold px-2.5 py-1.5 rounded-lg cursor-pointer transition-all"
                    >
                      Mark Harvested
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}
    </div>
  );
};
