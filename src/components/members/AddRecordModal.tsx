/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Field, Member } from '../../types';
import { AlertTriangle } from 'lucide-react';

interface AddRecordModalProps {
  isOpen: boolean;
  activeTab: 'directory' | 'fields' | 'seasons';
  members: Member[];
  fields: Field[];
  isEditingField: boolean;
  isEditingSeason: boolean;
  onClose: () => void;

  memberName: string;
  setMemberName: (v: string) => void;
  memberPhone: string;
  setMemberPhone: (v: string) => void;
  onSubmitMember: (e: React.FormEvent) => void;

  fieldName: string;
  setFieldName: (v: string) => void;
  fieldArea: string;
  setFieldArea: (v: string) => void;
  fieldLocation: string;
  setFieldLocation: (v: string) => void;
  fieldShares: { [memberId: string]: string };
  setFieldShares: React.Dispatch<React.SetStateAction<{ [memberId: string]: string }>>;
  fieldSharesError: string;
  setFieldSharesError: (v: string) => void;
  onSubmitField: (e: React.FormEvent) => void;

  seasonFieldId: string;
  setSeasonFieldId: (v: string) => void;
  seasonCrop: string;
  setSeasonCrop: (v: string) => void;
  seasonStartDate: string;
  setSeasonStartDate: (v: string) => void;
  seasonShares: { [memberId: string]: string };
  setSeasonShares: React.Dispatch<React.SetStateAction<{ [memberId: string]: string }>>;
  seasonSharesError: string;
  setSeasonSharesError: (v: string) => void;
  onSubmitSeason: (e: React.FormEvent) => void;
}

export const AddRecordModal: React.FC<AddRecordModalProps> = ({
  isOpen,
  activeTab,
  members,
  fields,
  isEditingField,
  isEditingSeason,
  onClose,
  memberName,
  setMemberName,
  memberPhone,
  setMemberPhone,
  onSubmitMember,
  fieldName,
  setFieldName,
  fieldArea,
  setFieldArea,
  fieldLocation,
  setFieldLocation,
  fieldShares,
  setFieldShares,
  fieldSharesError,
  setFieldSharesError,
  onSubmitField,
  seasonFieldId,
  setSeasonFieldId,
  seasonCrop,
  setSeasonCrop,
  seasonStartDate,
  setSeasonStartDate,
  seasonShares,
  setSeasonShares,
  seasonSharesError,
  setSeasonSharesError,
  onSubmitSeason,
}) => {
  if (!isOpen) return null;

  const sumOfShares = Object.keys(fieldShares).reduce((total: number, mId: string) => {
    return total + (parseFloat(fieldShares[mId]) || 0);
  }, 0);

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {activeTab === 'directory' && (
          <form onSubmit={onSubmitMember} className="p-6 space-y-4">
            <h3 className="font-bold text-sm text-gray-800">Add Sown Partner Record</h3>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Partner Human Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Shyam Naik"
                value={memberName}
                onChange={e => setMemberName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Phone Number (Optional)</label>
              <input
                type="text"
                placeholder="e.g. +91 98452 11002"
                value={memberPhone}
                onChange={e => setMemberPhone(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
              />
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white"
              >
                Save Partner Profile
              </button>
            </div>
          </form>
        )}

        {activeTab === 'fields' && (
          <form onSubmit={onSubmitField} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-800">{isEditingField ? 'Edit Field & Ownership Shares' : 'Register Sown Plot Boundary'}</h3>

            {fieldSharesError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[10px] flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{fieldSharesError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Field Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. North Ridge Orchard"
                  value={fieldName}
                  onChange={e => setFieldName(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Area size (Acres)</label>
                <input
                  type="number"
                  required
                  step="0.1"
                  placeholder="e.g. 12"
                  value={fieldArea}
                  onChange={e => setFieldArea(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Location description</label>
              <input
                type="text"
                placeholder="e.g. Behind electric sub-station road"
                value={fieldLocation}
                onChange={e => setFieldLocation(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
              />
            </div>

            {/* Ownership configuration list */}
            <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <div className="flex justify-between items-center text-[10px] text-gray-400 font-bold uppercase">
                <span>Partner Name</span>
                <span>Ratio Split (%)</span>
              </div>

              <div className="divide-y divide-gray-150 space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex justify-between items-center pt-2 text-xs text-gray-700">
                    <span>{m.name}</span>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="0"
                        value={fieldShares[m.id] || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setFieldSharesError('');
                          setFieldShares(prev => ({
                            ...prev,
                            [m.id]: val
                          }));
                        }}
                        className="bg-white border border-gray-100 rounded-lg text-xs w-24 pr-6 py-1 text-right"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-gray-400">%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Validate on board live counter */}
              <div className="flex justify-between items-center text-[10px] uppercase font-semibold text-gray-500 pt-2 border-t border-gray-150">
                <span>Total share ratio allocation</span>
                <span className={`font-bold text-xs ${Math.abs(sumOfShares - 100) < 0.1 ? 'text-emerald-600' : 'text-amber-500'}`}>
                  {sumOfShares}% / 100%
                </span>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white"
              >
                {isEditingField ? 'Save Changes' : 'Add Field Plot'}
              </button>
            </div>
          </form>
        )}

        {activeTab === 'seasons' && (
          <form onSubmit={onSubmitSeason} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-800">{isEditingSeason ? 'Edit Season & Ownership Shares' : 'Sow New Crop Cycle Season'}</h3>

            {seasonSharesError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[10px] flex items-start gap-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>{seasonSharesError}</span>
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Target field Plot</label>
              <select
                value={seasonFieldId}
                onChange={e => setSeasonFieldId(e.target.value)}
                disabled={isEditingSeason}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700 font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {fields.map(f => (
                  <option key={f.id} value={f.id}>{f.name} ({f.area} acres)</option>
                ))}
              </select>
              {isEditingSeason && (
                <p className="text-[10px] text-gray-400 mt-1">A season's target field can't be changed after sowing.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sown Crop Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Sona Masuri Paddy"
                  value={seasonCrop}
                  onChange={e => setSeasonCrop(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sowing Date</label>
                <input
                  type="date"
                  required
                  value={seasonStartDate}
                  onChange={e => setSeasonStartDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
            </div>

            {/* Season-level custom partner shares configuration */}
            <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex justify-between items-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest block">Season Partner Shares (%)</span>
                <span className="text-[9px] text-emerald-800 bg-emerald-50 border border-emerald-150 font-bold px-2 py-0.5 rounded-md">Customizable per Cycle</span>
              </div>

              <div className="divide-y divide-slate-150 space-y-2">
                {members.map(m => (
                  <div key={m.id} className="flex justify-between items-center pt-2 text-xs text-slate-700">
                    <span className="font-semibold">{m.name}</span>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="0"
                        value={seasonShares[m.id] || ''}
                        onChange={e => {
                          const val = e.target.value;
                          setSeasonSharesError('');
                          setSeasonShares(prev => ({
                            ...prev,
                            [m.id]: val
                          }));
                        }}
                        className="bg-white border border-slate-205 rounded-lg text-xs w-24 pr-6 py-1 text-right font-semibold"
                      />
                      <span className="absolute right-2 top-1.5 text-[10px] text-slate-400">%</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Validate total share ratio */}
              {(() => {
                const totalSharesSum = Object.keys(seasonShares).reduce((acc, mId) => acc + (parseFloat(seasonShares[mId]) || 0), 0);
                return (
                  <div className="flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 pt-2 border-t border-slate-200">
                    <span>Total shares sum</span>
                    <span className={`font-extrabold text-xs ${Math.abs(totalSharesSum - 100) < 0.1 ? 'text-emerald-600' : 'text-amber-500'}`}>
                      {totalSharesSum}% / 100%
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white cursor-pointer"
              >
                {isEditingSeason ? 'Save Changes' : 'Sow Crop'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
