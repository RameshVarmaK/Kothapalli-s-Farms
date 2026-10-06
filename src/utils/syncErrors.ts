/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Why a push to the Google Sheet failed, in terms of what the user has to do
 * about it. The raw error ("Google Sheets batch update failed: {...}") means
 * nothing to a farmer on a phone; each kind maps to one plain sentence and at
 * most one action.
 */
export type SyncErrorKind =
  | 'offline' // no network — retried automatically once the phone is back online
  | 'auth' // Google sign-in expired — only signing in again fixes it
  | 'access' // this account cannot open or edit the sheet — only the owner can fix it
  | 'busy' // Google quota or a temporary outage — retried automatically
  | 'unknown'; // anything else — retried automatically

/** Kinds that clear up on their own, so retrying without asking is useful.
 * Retrying an expired session or a missing share just fails again. */
export function isRetryable(kind: SyncErrorKind): boolean {
  return kind !== 'auth' && kind !== 'access';
}

export function classifySyncError(err: unknown, online: boolean = true): SyncErrorKind {
  if (!online) return 'offline';

  const message = err instanceof Error ? err.message : String(err ?? '');
  const text = message.toLowerCase();

  if (/\b401\b/.test(text) || text.includes('unauthenticated') || text.includes('invalid credentials')) {
    return 'auth';
  }

  if (
    /\b(403|404)\b/.test(text) ||
    text.includes('permission_denied') ||
    text.includes('does not have permission') ||
    text.includes('requested entity was not found')
  ) {
    return 'access';
  }

  if (
    /\b(429|500|502|503|504)\b/.test(text) ||
    text.includes('resource_exhausted') ||
    text.includes('quota') ||
    text.includes('rate limit') ||
    text.includes('unavailable')
  ) {
    return 'busy';
  }

  // Checked after the status codes: our own messages such as "Failed to
  // fetch spreadsheet metadata: 401" also contain "failed to fetch".
  // fetch() rejects with a TypeError ("Failed to fetch", "NetworkError when
  // attempting to fetch resource", "Load failed" on Safari) when the request
  // never got an answer at all.
  if (
    (err instanceof TypeError && /fetch|network|load failed/.test(text)) ||
    text.trim() === 'failed to fetch' ||
    text.includes('networkerror')
  ) {
    return 'offline';
  }

  return 'unknown';
}

/** Waits between automatic retries: quick at first, then backing off so a
 * long outage does not burn through the Sheets quota. */
export const RETRY_DELAYS_MS = [10_000, 30_000, 60_000, 120_000, 300_000];

export function retryDelayMs(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(Math.max(attempt, 0), RETRY_DELAYS_MS.length - 1)];
}
