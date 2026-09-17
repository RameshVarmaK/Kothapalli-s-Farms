/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  StockItem,
  Field,
  Season,
  Member,
  Activity,
  CommonAllocationType
} from '../../types';
import { AlertTriangle, Check } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';

interface StockEntryModalProps {
  modalType: 'item' | 'purchase' | 'usage';
  setModalType: (type: 'item' | 'purchase' | 'usage') => void;
  errorMessage: string;
  setErrorMessage: (msg: string) => void;
  activeSeasons: Season[];
  setUsageSeasonId: (id: string) => void;
  onClose: () => void;
  isEditingItem: boolean;
  isEditingPurchase: boolean;
  isEditingUsage: boolean;

  // Item form state
  itemName: string;
  setItemName: (v: string) => void;
  itemType: StockItem['type'];
  setItemType: (v: StockItem['type']) => void;
  itemUnit: string;
  setItemUnit: (v: string) => void;
  onSubmitItem: (e: React.FormEvent) => void;

  // Purchase form state
  stockItems: StockItem[];
  members: Member[];
  currency: string;
  selectedItemId: string;
  setSelectedItemId: (v: string) => void;
  purchaseQty: string;
  setPurchaseQty: (v: string) => void;
  purchaseCost: string;
  setPurchaseCost: (v: string) => void;
  purchaseDate: string;
  setPurchaseDate: (v: string) => void;
  purchasePayer: string;
  setPurchasePayer: (v: string) => void;
  onSubmitPurchase: (e: React.FormEvent) => void;

  // Usage form state
  computedStockList: StockItem[];
  seasons: Season[];
  fields: Field[];
  activities: Activity[];
  usageQty: string;
  setUsageQty: (v: string) => void;
  usageDate: string;
  setUsageDate: (v: string) => void;
  usageTargetType: 'single' | 'common';
  setUsageTargetType: (v: 'single' | 'common') => void;
  usageSeasonId: string;
  usageAllocationRule: CommonAllocationType;
  setUsageAllocationRule: (v: CommonAllocationType) => void;
  usageParticipatingSeasons: string[];
  setUsageParticipatingSeasons: React.Dispatch<React.SetStateAction<string[]>>;
  manualUsageAllocations: { [key: string]: string };
  setManualUsageAllocations: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  usageLinkedActivityId: string;
  setUsageLinkedActivityId: (v: string) => void;
  usageAllocationRuleHelp: Record<CommonAllocationType, string>;
  usageAllocationPreview: { fieldId: string; seasonId: string; amount: number }[];
  usageAllocationTotal: number;
  usageAllocationDiff: number;
  previewUsageQty: number;
  onSubmitUsage: (e: React.FormEvent) => void;
}

export const StockEntryModal: React.FC<StockEntryModalProps> = ({
  modalType,
  setModalType,
  errorMessage,
  setErrorMessage,
  activeSeasons,
  setUsageSeasonId,
  onClose,
  isEditingItem,
  isEditingPurchase,
  isEditingUsage,
  itemName,
  setItemName,
  itemType,
  setItemType,
  itemUnit,
  setItemUnit,
  onSubmitItem,
  stockItems,
  members,
  currency,
  selectedItemId,
  setSelectedItemId,
  purchaseQty,
  setPurchaseQty,
  purchaseCost,
  setPurchaseCost,
  purchaseDate,
  setPurchaseDate,
  purchasePayer,
  setPurchasePayer,
  onSubmitPurchase,
  computedStockList,
  seasons,
  fields,
  activities,
  usageQty,
  setUsageQty,
  usageDate,
  setUsageDate,
  usageTargetType,
  setUsageTargetType,
  usageSeasonId,
  usageAllocationRule,
  setUsageAllocationRule,
  usageParticipatingSeasons,
  setUsageParticipatingSeasons,
  manualUsageAllocations,
  setManualUsageAllocations,
  usageLinkedActivityId,
  setUsageLinkedActivityId,
  usageAllocationRuleHelp,
  usageAllocationPreview,
  usageAllocationTotal,
  usageAllocationDiff,
  previewUsageQty,
  onSubmitUsage
}) => {
  const { t } = useLanguage();
  return (
    <div className="fixed inset-0 z-50 bg-gray-900/60 backdrop-blur-subtle flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header switcher */}
        <div className="border-b border-gray-150 bg-gray-50/50 p-2 flex">
          <button
            type="button"
            onClick={() => setModalType('purchase')}
            className={`flex-1 text-center py-2 px-1.5 rounded-xl text-xs font-bold transition-all ${
              modalType === 'purchase' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-450 hover:text-gray-600'
            }`}
          >
            {t('Log Input Purchase (Asset)')}
          </button>
          <button
            type="button"
            onClick={() => {
              setModalType('usage');
              setUsageSeasonId(activeSeasons[0]?.id || seasons[0]?.id || '');
            }}
            className={`flex-1 text-center py-2 px-1.5 rounded-xl text-xs font-bold transition-all ${
              modalType === 'usage' ? 'bg-white text-emerald-700 shadow-2xs' : 'text-gray-450 hover:text-gray-600'
            }`}
          >
            {t('Log Field Usage (Expense)')}
          </button>
        </div>

        {errorMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-amber-50 border border-amber-100 text-amber-800 text-[10px] flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* ITEM CREATION FORM */}
        {modalType === 'item' && (
          <form onSubmit={onSubmitItem} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-800">{isEditingItem ? t('Edit Material / Input Type') : t('Add Sown Material / Input Type')}</h3>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Item Name')}</label>
              <input
                type="text"
                required
                placeholder="e.g. NPK Fertilizer / Hybrid Corn Seed"
                value={itemName}
                onChange={e => setItemName(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Category Type')}</label>
                <select
                  value={itemType}
                  onChange={e => setItemType(e.target.value as StockItem['type'])}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-750"
                >
                  <option value="Seed">{t('Seed')}</option>
                  <option value="Fertilizer">{t('Fertilizer')}</option>
                  <option value="Pesticide">{t('Pesticide')}</option>
                  <option value="Fuel">{t('Fuel')}</option>
                  <option value="Other">{t('Other')}</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Unit of Measure')}</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. bags, kg, litres"
                  value={itemUnit}
                  onChange={e => setItemUnit(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
              >
                {isEditingItem ? t('Save Changes') : t('Create Material')}
              </button>
            </div>
          </form>
        )}

        {/* LOG PURCHASE FORM */}
        {modalType === 'purchase' && (
          <form onSubmit={onSubmitPurchase} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-800">{isEditingPurchase ? t('Edit Input Intake Purchase (Asset)') : t('Record Input Intake Purchase (Asset)')}</h3>

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Sown Stock Item type')}</label>
              <select
                value={selectedItemId}
                required
                onChange={e => setSelectedItemId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
              >
                {stockItems.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Quantity Purchased')}</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 20"
                  value={purchaseQty}
                  onChange={e => setPurchaseQty(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Total Bill Cost')} ({currency})</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 7000"
                  value={purchaseCost}
                  onChange={e => setPurchaseCost(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Purchase Date')}</label>
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  onChange={e => setPurchaseDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Funder (Who Funded?)')}</label>
                <select
                  value={purchasePayer}
                  onChange={e => setPurchasePayer(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50 bg-white border border-gray-100"
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700"
              >
                {isEditingPurchase ? t('Save Changes') : t('Save Purchase')}
              </button>
            </div>
          </form>
        )}

        {/* LOG USAGE FORM */}
        {modalType === 'usage' && (
          <form onSubmit={onSubmitUsage} className="p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <h3 className="font-bold text-sm text-gray-800">{isEditingUsage ? t('Edit Crop Field Stock Usage (Expense)') : t('Log Crop Field Stock Usage (Expense)')}</h3>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Select Material')}</label>
                <select
                  value={selectedItemId}
                  required
                  onChange={e => {
                    setSelectedItemId(e.target.value);
                    setErrorMessage('');
                  }}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                >
                  {stockItems.map(i => {
                    const level = computedStockList.find(c => c.id === i.id);
                    return (
                      <option key={i.id} value={i.id}>
                        {i.name} ({level?.quantityOnHand} remaining)
                      </option>
                    );
                  })}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Quantity Sown/Used')}</label>
                <input
                  type="number"
                  required
                  placeholder="Input qty"
                  value={usageQty}
                  onChange={e => {
                    setUsageQty(e.target.value);
                    setErrorMessage('');
                  }}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Date Sown/Used')}</label>
                <input
                  type="date"
                  required
                  value={usageDate}
                  onChange={e => setUsageDate(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Target Type')}</label>
                <select
                  value={usageTargetType}
                  onChange={e => setUsageTargetType(e.target.value as 'single' | 'common')}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                >
                  <option value="single">{t('Single Field Crop')}</option>
                  <option value="common">{t('Commonly Consumed')}</option>
                </select>
              </div>
            </div>

            {usageTargetType === 'single' ? (
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Crop Cycle Destination')}</label>
                <select
                  value={usageSeasonId}
                  required
                  onChange={e => setUsageSeasonId(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
                >
                  {seasons.map(s => {
                    const f = fields.find(field => field.id === s.fieldId);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.cropName} ({f ? f.name : t('Unknown')})
                      </option>
                    );
                  })}
                </select>
              </div>
            ) : (
              <div className="space-y-3 bg-gray-50 p-4 rounded-2xl border border-gray-150">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-bold text-gray-500 uppercase">{t('Division Rule')}</span>
                  <select
                    value={usageAllocationRule}
                    onChange={e => setUsageAllocationRule(e.target.value as CommonAllocationType)}
                    className="bg-white border border-gray-100 rounded-lg text-[10px] px-2 py-1"
                  >
                    <option value="equal">{t('Equal Split')}</option>
                    <option value="area">{t('Area Proportional (Acres)')}</option>
                    <option value="manual">{t('Manual Quantities')}</option>
                  </select>
                </div>
                <p className="text-[10px] text-gray-400 leading-relaxed -mt-1">{usageAllocationRuleHelp[usageAllocationRule]}</p>

                <div className="space-y-2">
                  <span className="text-[10px] font-bold text-gray-400 uppercase block">{t('Fields Participating')}</span>
                  {activeSeasons.map(s => {
                    const f = fields.find(field => field.id === s.fieldId)!;
                    const isChecked = usageParticipatingSeasons.includes(s.id);
                    return (
                      <div key={s.id} className="flex justify-between items-center text-xs">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setUsageParticipatingSeasons(prev => prev.filter(id => id !== s.id));
                              } else {
                                setUsageParticipatingSeasons(prev => [...prev, s.id]);
                              }
                            }}
                            className="rounded text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="font-semibold text-gray-700">{s.cropName} ({f?.name})</span>
                        </label>
                        {isChecked && (
                          <div className="flex items-center gap-1">
                            {usageAllocationRule === 'manual' ? (
                              <input
                                type="number"
                                placeholder={t('Qty used')}
                                value={manualUsageAllocations[`${s.fieldId}_${s.id}`] || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setManualUsageAllocations(prev => ({
                                    ...prev,
                                    [`${s.fieldId}_${s.id}`]: val
                                  }));
                                }}
                                className="w-20 bg-white border border-gray-100 rounded-md px-1.5 py-0.5 text-right text-[10px]"
                              />
                            ) : (
                              <span className="text-[10px] text-gray-500 font-semibold mono-num">
                                {isChecked && usageQty ? (
                                  <>
                                    {Math.round(usageAllocationPreview.find(al => al.seasonId === s.id)?.amount || 0)}{' '}
                                    {stockItems.find(i => i.id === selectedItemId)?.unit}
                                  </>
                                ) : '-'}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Running total — makes the split fully transparent before saving,
                    instead of only failing the manual-rule check on submit. */}
                {usageParticipatingSeasons.length > 0 && (
                  <div
                    className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-[11px] font-bold ${
                      !usageQty
                        ? 'bg-white border-gray-150 text-gray-400'
                        : Math.abs(usageAllocationDiff) <= 0.001
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-700'
                        : 'bg-amber-50 border-amber-150 text-amber-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {usageQty && (
                        Math.abs(usageAllocationDiff) <= 0.001
                          ? <Check size={12} />
                          : <AlertTriangle size={12} />
                      )}
                      Allocated {Math.round(usageAllocationTotal * 1000) / 1000} of {previewUsageQty} {stockItems.find(i => i.id === selectedItemId)?.unit}
                    </span>
                    {usageQty && Math.abs(usageAllocationDiff) > 0.001 && (
                      <span className="mono-num">
                        {Math.abs(usageAllocationDiff)} {usageAllocationDiff > 0 ? 'unallocated' : 'over'}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{t('Link to Diary Event (Optional)')}</label>
              <select
                value={usageLinkedActivityId}
                onChange={e => setUsageLinkedActivityId(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 rounded-xl px-3 py-2 text-xs text-gray-700"
              >
                <option value="">{t('Do not link to activity')}</option>
                {activities.filter(a => usageTargetType === 'single' ? a.seasonId === usageSeasonId : true).map(a => (
                  <option key={a.id} value={a.id}>
                    {a.date} - {a.type} ({a.notes.substring(0,30)}...)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-50">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 bg-white border border-gray-100 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
              >
                {t('Cancel')}
              </button>
              <button
                type="submit"
                className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white shadow-sm"
              >
                {isEditingUsage ? t('Save Changes') : t('Log Usage')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
