/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { CloudRain, MapPin } from 'lucide-react';
import { useLanguage } from '../hooks/useLanguage';
import { fetchWeather, describeWeatherCode, WeatherSnapshot } from '../utils/weather';

interface WeatherCardProps {
  farmLocationName?: string;
  farmLatitude?: number;
  farmLongitude?: number;
  onGoToSettings: () => void;
}

export const WeatherCard: React.FC<WeatherCardProps> = ({
  farmLocationName,
  farmLatitude,
  farmLongitude,
  onGoToSettings
}) => {
  const { t } = useLanguage();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (farmLatitude === undefined || farmLongitude === undefined) return;
    let cancelled = false;
    setFailed(false);
    fetchWeather(farmLatitude, farmLongitude)
      .then(snapshot => {
        if (!cancelled) setWeather(snapshot);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [farmLatitude, farmLongitude]);

  if (farmLatitude === undefined || farmLongitude === undefined) {
    return (
      <button
        onClick={onGoToSettings}
        className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3 text-left hover:border-emerald-300 transition-colors cursor-pointer"
      >
        <span className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 text-sky-500 flex items-center justify-center shrink-0">
          <CloudRain size={20} />
        </span>
        <div>
          <p className="text-sm font-bold text-slate-800">{t('Set your farm location to see weather')}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">{t('Tap to open Audit & Config → Farm Location')}</p>
        </div>
      </button>
    );
  }

  if (failed) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-[11px] text-slate-400">
        {t('Weather unavailable right now — check your connection.')}
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-[11px] text-slate-400 animate-pulse">
        {t('Loading weather...')}
      </div>
    );
  }

  const current = describeWeatherCode(weather.currentWeatherCode);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-5 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl">{current.emoji}</span>
          <div>
            <p className="text-2xl font-bold text-slate-900">{Math.round(weather.currentTempC)}°C</p>
            <p className="text-[11px] text-slate-500 font-semibold">{t(current.label)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
          <MapPin size={12} />
          {farmLocationName}
        </div>
      </div>

      <div className="grid grid-cols-4 border-t border-slate-100 divide-x divide-slate-100">
        {weather.daily.slice(1).map(day => {
          const desc = describeWeatherCode(day.weatherCode);
          const dayLabel = new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' });
          return (
            <div key={day.date} className="p-3 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase">{dayLabel}</p>
              <p className="text-lg my-1">{desc.emoji}</p>
              <p className="text-xs font-bold text-slate-700">{Math.round(day.tempMaxC)}°/{Math.round(day.tempMinC)}°</p>
              {day.precipitationProbability > 30 && (
                <p className="text-[9px] text-sky-500 font-bold mt-0.5">💧{day.precipitationProbability}%</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
