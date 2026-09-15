/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { MapPin, AlertTriangle } from 'lucide-react';
import { useLanguage } from '../../hooks/useLanguage';
import { geocodeLocation } from '../../utils/weather';

interface FarmLocationCardProps {
  farmLocationName?: string;
  onSaveLocation: (name: string, latitude: number, longitude: number) => void;
}

export const FarmLocationCard: React.FC<FarmLocationCardProps> = ({
  farmLocationName,
  onSaveLocation
}) => {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setIsSearching(true);
    setError(null);
    try {
      const match = await geocodeLocation(query.trim());
      if (!match) {
        setError(t("Couldn't find that place — try a nearby town or district name."));
        return;
      }
      onSaveLocation(match.name, match.latitude, match.longitude);
      setQuery('');
    } catch {
      setError(t('Location lookup failed — check your connection and try again.'));
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <h3 className="font-bold text-sm text-slate-800 mb-1.5 flex items-center gap-2">
        <MapPin size={16} className="text-emerald-600" />
        {t('Farm Location (for Weather)')}
      </h3>
      <p className="text-[11px] text-slate-400 mb-4">
        {t('Set your nearest town or village so the Home dashboard can show current weather and a short forecast.')}
      </p>

      {farmLocationName && (
        <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-[11px] font-bold text-emerald-800">
          {t('Current location:')} {farmLocationName}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-[10px] flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          placeholder={t('e.g. Vijayawada, Guntur')}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-750 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <button
          type="submit"
          disabled={isSearching}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer active:scale-95 transition-all whitespace-nowrap"
        >
          {isSearching ? t('Searching...') : t('Set Location')}
        </button>
      </form>
    </div>
  );
};
