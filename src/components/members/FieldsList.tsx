/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Field, Member } from '../../types';
import { Sprout, Pencil, Trash2 } from 'lucide-react';
import { EmptyState } from './EmptyState';
import { useLanguage } from '../../hooks/useLanguage';

interface FieldsListProps {
  fields: Field[];
  members: Member[];
  onGoToPartners: () => void;
  onAddFirst: () => void;
  onEditField: (field: Field) => void;
  onDeleteField: (id: string, name: string) => void;
}

export const FieldsList: React.FC<FieldsListProps> = ({
  fields,
  members,
  onGoToPartners,
  onAddFirst,
  onEditField,
  onDeleteField,
}) => {
  const { t } = useLanguage();
  if (fields.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <EmptyState
          icon={<Sprout size={22} />}
          title={t('No fields registered')}
          description={
            members.length === 0
              ? t('Add your partners first, then register a field to split its ownership between them.')
              : t("Register your farm's plots and each partner's ownership share to start tracking activity and costs per field.")
          }
          ctaLabel={members.length === 0 ? t('Add Partners First') : t('Register First Field')}
          onCta={() => members.length === 0 ? onGoToPartners() : onAddFirst()}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {fields.map(field => (
        <div key={field.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:border-slate-350 hover:shadow-md transition-all">
          <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex justify-between items-start">
            <div>
              <h3 className="font-bold text-slate-850 text-sm leading-snug">{field.name}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">{t('Area size:')} <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-1.5 py-0.5 rounded-md">{field.area} {t('acres')}</span></p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEditField(field)}
                className="p-2.5 rounded-lg text-slate-350 hover:text-emerald-600 hover:bg-emerald-50 hover:border hover:border-emerald-100 transition-colors cursor-pointer"
                title={t('Edit Field & Ownership Shares')}
              >
                <Pencil size={14} />
              </button>
              <button
                onClick={() => onDeleteField(field.id, field.name)}
                className="p-2.5 rounded-lg text-slate-350 hover:text-red-500 hover:bg-red-50 hover:border hover:border-red-100 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="p-5 flex-1 space-y-4">
            {field.locationNote && (
              <p className="text-[11px] text-slate-500 font-medium italic">📍 Location: {field.locationNote}</p>
            )}

            {/* Sown shares details */}
            <div>
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-widest">{t('Ownership shares')}</h4>
              <div className="space-y-2">
                {field.shares.map(sh => {
                  const m = members.find(member => member.id === sh.memberId);
                  return (
                    <div key={sh.memberId} className="flex justify-between items-center text-xs">
                      <span className="text-slate-600 font-medium">{m ? m.name : t('Unknown')}</span>
                      <span className="font-bold font-mono text-slate-800 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-md">{sh.percentage}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
