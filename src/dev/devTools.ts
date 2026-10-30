/**
 * Whether the developer-only panels (manual access-token override, custom
 * Firebase config) are shown. They used to sit in Settings for every partner,
 * where one pasted value could point the whole app at a different backend.
 *
 * On in a dev build. In production, turn on with `?devtools` on the URL once
 * (it is remembered on this device) or by setting the localStorage key.
 */
const DEV_TOOLS_KEY = 'farm_ledger_devtools';

export function devToolsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('devtools')) {
      const on = params.get('devtools') !== '0';
      localStorage.setItem(DEV_TOOLS_KEY, on ? '1' : '0');
      return on;
    }
    return localStorage.getItem(DEV_TOOLS_KEY) === '1';
  } catch {
    return false;
  }
}
