import { describe, it, expect } from 'vitest';
import { classifySyncError, isRetryable, retryDelayMs } from '../src/utils/syncErrors';

describe('classifySyncError', () => {
  it('reads a browser that reports itself offline as offline, whatever the error', () => {
    expect(classifySyncError(new Error('anything'), false)).toBe('offline');
  });

  it('reads a fetch that never got an answer as offline', () => {
    expect(classifySyncError(new TypeError('Failed to fetch'))).toBe('offline');
    expect(classifySyncError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe('offline');
    expect(classifySyncError(new TypeError('Load failed'))).toBe('offline');
  });

  it('reads an expired Google session as auth, even inside a "Failed to fetch ..." message', () => {
    expect(classifySyncError(new Error('Failed to fetch spreadsheet metadata: 401'))).toBe('auth');
    expect(
      classifySyncError(new Error('Google Sheets batch update failed: 401 {"error":{"status":"UNAUTHENTICATED"}}'))
    ).toBe('auth');
  });

  it('reads a missing share or a deleted sheet as access', () => {
    expect(
      classifySyncError(new Error('Google Sheets batch update failed: 403 {"error":{"status":"PERMISSION_DENIED"}}'))
    ).toBe('access');
    expect(classifySyncError(new Error('Failed to fetch spreadsheet metadata: 404'))).toBe('access');
  });

  it('reads quota and Google outages as busy', () => {
    expect(classifySyncError(new Error('Google Sheets batch update failed: 429 {"status":"RESOURCE_EXHAUSTED"}'))).toBe('busy');
    expect(classifySyncError(new Error('Failed to batchGet spreadsheet data: 503'))).toBe('busy');
  });

  it('falls back to unknown', () => {
    expect(classifySyncError(new Error('Something odd'))).toBe('unknown');
    expect(classifySyncError(new Error('Failed to fetch spreadsheet metadata: 400'))).toBe('unknown');
  });
});

describe('retrying', () => {
  it('retries only the kinds that can clear up on their own', () => {
    expect(isRetryable('offline')).toBe(true);
    expect(isRetryable('busy')).toBe(true);
    expect(isRetryable('unknown')).toBe(true);
    expect(isRetryable('auth')).toBe(false);
    expect(isRetryable('access')).toBe(false);
  });

  it('backs off and then holds at the longest wait', () => {
    expect(retryDelayMs(0)).toBe(10_000);
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(4)).toBe(300_000);
    expect(retryDelayMs(40)).toBe(300_000);
  });
});
