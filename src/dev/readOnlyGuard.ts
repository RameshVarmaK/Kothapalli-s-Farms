/**
 * Dev-only: makes a session read-only against Google.
 *
 * For looking at a real ledger with a new build without any chance of writing
 * to it. Switched on by adding `?readonly` to the dev server's URL, and never
 * included in a production build (main.tsx imports it only under DEV).
 *
 * Reads pass through. A write is handled in one of two ways:
 *  - Adding tabs or columns (Sheets `:batchUpdate`) gets a simulated success.
 *    Every pull makes that call first, and nothing changes in the sheet, so
 *    the pull can carry on.
 *  - Anything else that would write (pushing rows, clearing ranges, creating
 *    a spreadsheet, Drive uploads or trashing) is refused with a 403. Faking
 *    success there would make the app record its edits as synced when they
 *    were not, and lose them the next time it adopted the sheet.
 *
 * What was blocked is kept in `window.__blockedWrites` and printed to the
 * console, which shows exactly what the app tried to write.
 */

export interface BlockedWrite {
  at: string;
  method: string;
  url: string;
  outcome: 'simulated' | 'refused';
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function installReadOnlyGuard(
  target: { fetch: typeof fetch; location: Location; __blockedWrites?: BlockedWrite[] },
  realFetch: typeof fetch = target.fetch.bind(target)
): BlockedWrite[] {
  const blocked: BlockedWrite[] = [];
  target.__blockedWrites = blocked;

  target.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method || (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();
    if (READ_METHODS.has(method)) return realFetch(input, init);

    const url = new URL(href, target.location.href);
    const onSheets = url.hostname === 'sheets.googleapis.com';
    const onDrive = url.hostname.endsWith('googleapis.com') && /\/(upload\/)?drive\//.test(url.pathname);
    if (!onSheets && !onDrive) return realFetch(input, init);

    const addsStructureOnly = onSheets && /\/spreadsheets\/[^/]+:batchUpdate$/.test(url.pathname);
    const outcome = addsStructureOnly ? 'simulated' : 'refused';
    blocked.push({ at: new Date().toISOString(), method, url: `${url.origin}${url.pathname}`, outcome });
    console.warn(`[read-only] ${outcome} ${method} ${url.pathname}`);

    return addsStructureOnly
      ? new Response(JSON.stringify({ replies: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      : new Response(
          JSON.stringify({ error: { code: 403, message: 'Read-only session: this write was blocked by the dev guard.' } }),
          { status: 403, headers: { 'Content-Type': 'application/json' } }
        );
  }) as typeof fetch;

  return blocked;
}

/** Turns the guard on when the page was opened with `?readonly`, and says so on screen. */
export function startReadOnlyGuardIfAsked(): void {
  if (!new URLSearchParams(window.location.search).has('readonly')) return;
  installReadOnlyGuard(window as unknown as Parameters<typeof installReadOnlyGuard>[0]);

  const banner = document.createElement('div');
  banner.textContent = 'READ-ONLY DEV SESSION · writes to Google Sheets and Drive are blocked';
  banner.style.cssText =
    'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#7f1d1d;color:#fff;font:700 11px system-ui;text-align:center;padding:3px;pointer-events:none';
  document.body.appendChild(banner);
}
