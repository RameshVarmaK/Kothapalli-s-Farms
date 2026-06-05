/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Activity,
  Field,
  Season,
  Expense,
  Labour,
  StockUsage,
  StockItem,
  Member
} from '../types';
import { Calendar, Filter, Users, Package, DollarSign, CloudSun, Plus, X, Sprout } from 'lucide-react';

interface TimelineTabProps {
  activities: Activity[];
  fields: Field[];
  seasons: Season[];
  members: Member[];
  expenses: Expense[];
  labours: Labour[];
  usages: StockUsage[];
  stockItems: StockItem[];
  currency: string;
  onAddActivity?: (act: Activity) => void;
}

export const TimelineTab: React.FC<TimelineTabProps> = ({
  activities,
  fields,
  seasons,
  members,
  expenses,
  labours,
  usages,
  stockItems,
  currency,
  onAddActivity
}) => {
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('all');
  const [selectedActivityType, setSelectedActivityType] = useState<string>('all');

  // New manual, non-expense event logging state
  const [showAddForm, setShowAddForm] = useState(false);
  const [actType, setActType] = useState<'Sowing' | 'Irrigation' | 'Weeding' | 'Fertilizing' | 'Spraying' | 'Harvesting' | 'Equipment/Motor repair' | 'Transport' | 'Other'>('Irrigation');
  const [actSeasonId, setActSeasonId] = useState(seasons.filter(s => !s.isClosed)[0]?.id || seasons[0]?.id || '');
  const [actNotes, setActNotes] = useState('');
  const [actDate, setActDate] = useState(new Date().toISOString().split('T')[0]);
  const [actWeather, setActWeather] = useState('');
  const [actPhotosStr, setActPhotosStr] = useState('');
  const [formError, setFormError] = useState('');

  const handleSaveActivity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!actSeasonId) {
      setFormError('Please select a corresponding Crop Season.');
      return;
    }
    if (!actNotes.trim()) {
      setFormError('Please provide descriptive activity notes.');
      return;
    }
    
    const targetSeason = seasons.find(s => s.id === actSeasonId);
    if (!targetSeason) {
      setFormError('Invalid Season selection.');
      return;
    }
    
    const photosList = actPhotosStr
      .split(',')
      .map(p => p.trim())
      .filter(p => p.length > 0);
      
    const manualAct: Activity = {
      id: `act_manual_${Date.now()}`,
      fieldId: targetSeason.fieldId,
      seasonId: actSeasonId,
      date: actDate,
      type: actType,
      notes: actNotes.trim(),
      weatherNote: actWeather.trim() || undefined,
      photos: photosList.length > 0 ? photosList : undefined
    };
    
    if (onAddActivity) {
      onAddActivity(manualAct);
    }
    
    // Reset form
    setActNotes('');
    setActWeather('');
    setActPhotosStr('');
    setFormError('');
    setShowAddForm(false);
  };

  // Filter activities
  const filteredActivities = activities
    .filter(act => {
      const matchSeason = selectedSeasonId === 'all' || act.seasonId === selectedSeasonId;
      const matchType = selectedActivityType === 'all' || act.type === selectedActivityType;
      return matchSeason && matchType;
    })
    // Chronological order: newest activities first
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const activeSeasons = seasons.filter(s => !s.isClosed);

  return (
    <div className="space-y-6">
      {/* Tab Header Banner with Add Activity Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
        <div>
          <h2 className="text-base font-extrabold text-slate-800">Farm Activity Logs & Timeline</h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">Track field treatments, irrigation periods, weeding, harvest work, or maintenance events.</p>
        </div>
        <button
          onClick={() => {
            setActSeasonId(seasons.filter(s => !s.isClosed)[0]?.id || seasons[0]?.id || '');
            setFormError('');
            setShowAddForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95 whitespace-nowrap"
        >
          <Plus size={15} />
          <span>Record Farm Activity</span>
        </button>
      </div>

      {/* Manual Activity Creation Modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Sprout className="text-emerald-600" size={18} />
                <h3 className="font-extrabold text-slate-800 text-sm">Record Manual Activity</h3>
              </div>
              <button
                onClick={() => setShowAddForm(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveActivity} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-800 text-[11px] font-bold rounded-xl flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Activity/Operation Type</label>
                <select
                  value={actType}
                  onChange={e => setActType(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold cursor-pointer focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="Irrigation">💦 Irrigation / Watering</option>
                  <option value="Weeding">🌱 Weeding / Clearing</option>
                  <option value="Fertilizing">🍁 Fertilizing Input</option>
                  <option value="Spraying">💨 Spraying Pesticide</option>
                  <option value="Sowing">🌾 Sowing / Soil Prep</option>
                  <option value="Harvesting">🚜 Harvesting Cycle</option>
                  <option value="Equipment/Motor repair">🔧 Equipment / Motor Repair</option>
                  <option value="Transport">🚛 Transport / Logistics</option>
                  <option value="Other">📝 Other Manual Activity</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Associated Crop Cycle</label>
                <select
                  value={actSeasonId}
                  onChange={e => setActSeasonId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-semibold cursor-pointer focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="">-- Choose Crop Season --</option>
                  {seasons.map(s => {
                    const f = fields.find(field => field.id === s.fieldId);
                    return (
                      <option key={s.id} value={s.id}>
                        {s.cropName} ({f ? f.name : 'Unknown Field'}) {s.isClosed ? '• Closed' : '• Open'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date Done</label>
                  <input
                    type="date"
                    required
                    value={actDate}
                    onChange={e => setActDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Weather Condition</label>
                  <input
                    type="text"
                    placeholder="e.g. Sunny, Rain"
                    value={actWeather}
                    onChange={e => setActWeather(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-700 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Operation Description / Notes</label>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Irrigated today for 3 hours using drip system. Cleaned sprinkler filter."
                  value={actNotes}
                  onChange={e => setActNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-medium focus:ring-1 focus:ring-emerald-500 focus:outline-none min-h-[70px]"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Visual snaps / Photo URLs (Optional)</label>
                <input
                  type="text"
                  placeholder="Comma-separated image URLs"
                  value={actPhotosStr}
                  onChange={e => setActPhotosStr(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 font-mono"
                />
              </div>

              <div className="flex gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50 cursor-pointer text-center"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl text-xs font-bold text-white cursor-pointer select-none"
                >
                  Conclude Log
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Filters bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap gap-4 items-center">
        <div className="flex items-center gap-1.5 text-slate-500 text-xs font-bold uppercase tracking-wider">
          <Filter size={14} className="text-slate-400" />
          <span>Filter Feed:</span>
        </div>

        {/* Season Selector */}
        <div className="flex-1 min-w-[200px]">
          <select
            value={selectedSeasonId}
            onChange={e => setSelectedSeasonId(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-xl px-3.5 py-2.5 font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">🌾 All Active & Historic Cycles</option>
            {seasons.map(s => {
              const f = fields.find(field => field.id === s.fieldId);
              return (
                <option key={s.id} value={s.id}>
                  {s.cropName} ({f ? f.name : 'Unknown Field'}) {s.isClosed ? '• Closed' : '• Open'}
                </option>
              );
            })}
          </select>
        </div>

        {/* Activity Type Selector */}
        <div className="w-52 min-w-[150px]">
          <select
            value={selectedActivityType}
            onChange={e => setSelectedActivityType(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 text-xs text-slate-700 rounded-xl px-3.5 py-2.5 font-semibold focus:ring-1 focus:ring-emerald-500 focus:outline-none cursor-pointer"
          >
            <option value="all">🔍 All Activity Types</option>
            <option value="Sowing">Sowing</option>
            <option value="Irrigation">Irrigation</option>
            <option value="Weeding">Weeding</option>
            <option value="Fertilizing">Fertilizing</option>
            <option value="Spraying">Spraying</option>
            <option value="Harvesting">Harvesting</option>
            <option value="Equipment/Motor repair">Equipment/Motor Repair</option>
            <option value="Transport">Transport</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Vertical Timeline timeline */}
      <div className="relative border-l-2 border-slate-200 pl-6 ml-4 space-y-8 py-2">
        {filteredActivities.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 font-semibold text-xs">
            No activities logged matching the active filters.
          </div>
        ) : (
          filteredActivities.map(act => {
            const field = fields.find(f => f.id === act.fieldId);
            const season = seasons.find(s => s.id === act.seasonId);

            // Fetch nested metrics for this specific activity
            const linkedExpenses = expenses.filter(e => e.linkedActivityId === act.id);
            const linkedLabour = labours.filter(l => l.linkedActivityId === act.id);
            const linkedStockUsages = usages.filter(u => u.linkedActivityId === act.id);

            return (
              <div key={act.id} className="relative group">
                {/* Timeline ball */}
                <span className="absolute -left-[31px] top-2 p-1.5 rounded-full bg-emerald-50 text-emerald-700 border-2 border-white flex items-center justify-center transition-all group-hover:bg-emerald-600 group-hover:text-white shadow-2xs">
                  <Calendar size={11} />
                </span>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5.5 transition-all hover:border-emerald-250 hover:shadow-xs">
                  {/* Top Header info */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5 mb-3.5">
                    <div>
                      <span className="text-[9px] font-extrabold text-emerald-800 tracking-widest uppercase px-2.5 py-1 bg-emerald-50 border border-emerald-100 rounded-lg">
                        {act.type}
                      </span>
                      <h3 className="font-bold text-slate-800 text-sm mt-2 flex items-center gap-2">
                        <span>{season ? season.cropName : 'Unknown Crop'}</span>
                        <span className="text-slate-400 font-semibold text-xs bg-slate-100 px-1.5 py-0.5 rounded">
                          {field ? field.name : 'Unknown Field'}
                        </span>
                      </h3>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-slate-500 font-mono block">
                        {act.date}
                      </span>
                      {act.weatherNote && (
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-bold uppercase mt-1 justify-end">
                          <CloudSun size={12} className="text-amber-500" />
                          <span>{act.weatherNote}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Body description */}
                  <p className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed">
                    {act.notes}
                  </p>

                  {/* Nested visual photos */}
                  {act.photos && act.photos.length > 0 && (
                    <div className="mt-3.5 flex gap-2 flex-wrap">
                      {act.photos.map((ph, idx) => (
                        <img
                          key={idx}
                          src={ph}
                          referrerPolicy="no-referrer"
                          alt="Activity snap"
                          className="w-16 h-16 object-cover rounded-lg border border-slate-200 shadow-2xs"
                        />
                      ))}
                    </div>
                  )}

                  {/* Linked Financial & Material Nest Box */}
                  {(linkedExpenses.length > 0 || linkedLabour.length > 0 || linkedStockUsages.length > 0) && (
                    <div className="mt-4.5 pt-4.5 mb-1 border-t border-slate-100 grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Nested Expenses */}
                      {linkedExpenses.map(exp => {
                        const payer = members.find(m => m.id === exp.paidByMemberId);
                        return (
                          <div key={exp.id} className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-[11px] flex gap-2.5">
                            <span className="p-1 h-fit rounded-lg bg-rose-100 text-rose-700">
                              <DollarSign size={12} />
                            </span>
                            <div>
                              <p className="font-bold text-rose-950 uppercase tracking-tight text-[10px] leading-snug">{exp.category}</p>
                              <p className="text-rose-900 font-extrabold font-mono text-xs mt-1">
                                {currency}{exp.amount.toLocaleString('en-IN')}
                              </p>
                              <p className="text-rose-500 font-semibold mt-1">Paid by: {payer ? payer.name : 'Unknown'}</p>
                            </div>
                          </div>
                        );
                      })}

                      {/* Nested Labour */}
                      {linkedLabour.map(lab => {
                        const payer = members.find(m => m.id === lab.paidByMemberId);
                        return (
                          <div key={lab.id} className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-[11px] flex gap-2.5">
                            <span className="p-1 h-fit rounded-lg bg-amber-100 text-amber-700">
                              <Users size={12} />
                            </span>
                            <div>
                              <p className="font-bold text-amber-950 uppercase tracking-tight text-[10px] leading-snug">Field Labour</p>
                              <p className="text-amber-900 font-extrabold font-mono text-xs mt-1">
                                {currency}{lab.totalCost.toLocaleString('en-IN')}
                              </p>
                              <p className="text-amber-500 font-semibold mt-1">
                                {lab.workersCount} worker(s) • Paid: {payer ? payer.name : 'Unknown'}
                              </p>
                            </div>
                          </div>
                        );
                      })}

                      {/* Nested Stock Used */}
                      {linkedStockUsages.map(usage => {
                        const stockItem = stockItems.find(item => item.id === usage.stockItemId);
                        const rate = stockItem ? stockItem.weightedAverageCost : 0;
                        const valueCharged = usage.quantityUsed * rate;
                        return (
                          <div key={usage.id} className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-[11px] flex gap-2.5">
                            <span className="p-1 h-fit rounded-lg bg-emerald-100 text-emerald-700">
                              <Package size={12} />
                            </span>
                            <div>
                              <p className="font-bold text-emerald-950 uppercase tracking-tight text-[10px] leading-snug">
                                {stockItem ? stockItem.name : 'Unknown InputUsed'}
                              </p>
                              <p className="text-emerald-900 font-extrabold mt-1">
                                <span className="font-mono">{usage.quantityUsed} {stockItem?.unit}</span> used
                              </p>
                              <p className="text-emerald-600 font-bold font-mono text-[10px] uppercase mt-1">
                                Cost: {currency}{Math.round(valueCharged).toLocaleString('en-IN')}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
