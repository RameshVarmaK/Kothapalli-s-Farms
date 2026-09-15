/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Member, SettlementSummary } from '../../types';
import { Users, Pencil, Trash2 } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useLanguage } from '../../hooks/useLanguage';

interface PartnersDirectoryProps {
  members: Member[];
  summary: SettlementSummary;
  currency: string;
  onAddFirst: () => void;
  onEditMember: (member: Member) => void;
  onDeleteMember: (id: string, name: string) => void;
}

export const PartnersDirectory: React.FC<PartnersDirectoryProps> = ({
  members,
  summary,
  currency,
  onAddFirst,
  onEditMember,
  onDeleteMember,
}) => {
  const { t } = useLanguage();
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4.5 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center">
          <h3 className="font-bold text-xs uppercase tracking-widest text-slate-400">{t('Collaborating Partners')}</h3>
          <span className="text-[10px] text-slate-450 bg-slate-100 font-bold px-2.5 py-1 rounded-full uppercase">{members.length} partners registered</span>
        </div>

        <div className="divide-y divide-slate-100">
          {members.length === 0 && (
            <EmptyState
              icon={<Users size={22} />}
              title={t('No partners yet')}
              description={t("Add the people who share this farm's costs and profits — you'll assign their ownership percentage when you register a field.")}
              ctaLabel={t('Add First Partner')}
              onCta={onAddFirst}
            />
          )}
          {members.map(member => {
            const totalStatement = summary.membersTotalStatements[member.id];
            const profitPos = totalStatement ? totalStatement.netPosition : 0;
            const isUnderDetail = expandedMemberId === member.id;

            return (
              <div key={member.id} className="transition-all">
                {/* Header profile banner */}
                <div
                  onClick={() => setExpandedMemberId(isUnderDetail ? null : member.id)}
                  className="p-5 flex justify-between items-center hover:bg-slate-50/60 cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3.5">
                    <span className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold text-sm tracking-wide border border-emerald-100">
                      {member.name.substring(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <h4 className="font-bold text-slate-800 text-sm leading-snug">{member.name}</h4>
                      <p className="text-[11px] text-slate-400 font-bold mt-1 uppercase tracking-wide">{member.phone || t('No phone recorded')}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-right">
                    <div>
                      <span className="text-[9px] uppercase tracking-widest text-slate-400 block font-bold">{t('Net Standing')}</span>
                      <span className={`text-sm font-bold font-mono tracking-tight ${profitPos >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {profitPos >= 0 ? t('Receives') : t('Owes')} {currency}{Math.abs(Math.round(profitPos)).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onEditMember(member); }}
                      className="p-2.5 rounded-lg text-slate-350 hover:text-emerald-600 hover:bg-emerald-50 hover:border hover:border-emerald-100 transition-colors cursor-pointer"
                      title={t('Edit Partner Details')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteMember(member.id, member.name); }}
                      className="p-2.5 rounded-lg text-slate-350 hover:text-red-500 hover:bg-red-50 hover:border hover:border-red-100 transition-colors cursor-pointer"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Detailed sub-ledgers on click */}
                {isUnderDetail && totalStatement && (
                  <div className="bg-slate-50/50 p-5 border-t border-slate-100 text-xs text-slate-600 grid grid-cols-3 gap-4 text-center animate-in slide-in-from-top-1">
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">{t('Entitled Profit')}</span>
                      <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                        {currency}{Math.round(totalStatement.entitledAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">{t('Funded Outlay')}</span>
                      <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                        {currency}{Math.round(totalStatement.paidAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-widest">{t('Harvest pocketed')}</span>
                      <span className="text-sm font-bold text-slate-800 font-mono mt-1 block">
                        {currency}{Math.round(totalStatement.receivedAmount).toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
