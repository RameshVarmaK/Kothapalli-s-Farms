/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface GeocodedLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface DailyForecast {
  date: string;
  weatherCode: number;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbability: number;
}

export interface WeatherSnapshot {
  currentTempC: number;
  currentWeatherCode: number;
  currentPrecipitationMm: number;
  daily: DailyForecast[];
}

// Open-Meteo requires no API key/signup, which keeps this feature usable
// without asking the user to obtain and paste in a key.
export async function geocodeLocation(query: string): Promise<GeocodedLocation | null> {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Location lookup failed: ${res.status}`);
  }
  const data = await res.json();
  const match = data.results?.[0];
  if (!match) return null;
  return {
    name: [match.name, match.admin1, match.country].filter(Boolean).join(', '),
    latitude: match.latitude,
    longitude: match.longitude
  };
}

export async function fetchWeather(latitude: number, longitude: number): Promise<WeatherSnapshot> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,precipitation&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=4&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Weather fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return {
    currentTempC: data.current.temperature_2m,
    currentWeatherCode: data.current.weather_code,
    currentPrecipitationMm: data.current.precipitation,
    daily: data.daily.time.map((date: string, i: number) => ({
      date,
      weatherCode: data.daily.weather_code[i],
      tempMaxC: data.daily.temperature_2m_max[i],
      tempMinC: data.daily.temperature_2m_min[i],
      precipitationProbability: data.daily.precipitation_probability_max[i]
    }))
  };
}

// Simplified WMO weather-code groups (https://open-meteo.com/en/docs) — the
// `label` is passed through the app's t() translator by the caller, so it
// must exactly match a key in the i18n dictionary.
export function describeWeatherCode(code: number): { emoji: string; label: string } {
  if (code === 0) return { emoji: '☀️', label: 'Clear sky' };
  if ([1, 2, 3].includes(code)) return { emoji: '⛅', label: 'Partly cloudy' };
  if ([45, 48].includes(code)) return { emoji: '🌫️', label: 'Fog' };
  if ([51, 53, 55, 56, 57].includes(code)) return { emoji: '🌦️', label: 'Drizzle' };
  if ([61, 63, 65, 66, 67].includes(code)) return { emoji: '🌧️', label: 'Rain' };
  if ([71, 73, 75, 77].includes(code)) return { emoji: '🌨️', label: 'Snow' };
  if ([80, 81, 82].includes(code)) return { emoji: '🌧️', label: 'Rain showers' };
  if ([95, 96, 99].includes(code)) return { emoji: '⛈️', label: 'Thunderstorm' };
  return { emoji: '🌡️', label: 'Weather' };
}
