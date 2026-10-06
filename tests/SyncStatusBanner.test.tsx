import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SyncStatusBanner } from '../src/components/SyncStatusBanner';
import { LanguageProvider } from '../src/hooks/useLanguage';

function renderBanner(overrides: Partial<React.ComponentProps<typeof SyncStatusBanner>> = {}) {
  const props = {
    kind: 'offline' as const,
    pendingChanges: 0,
    nextRetryAt: null,
    isSyncing: false,
    onRetry: vi.fn(),
    onSignIn: vi.fn(),
    ...overrides,
  };
  render(
    <LanguageProvider>
      <SyncStatusBanner {...props} />
    </LanguageProvider>
  );
  return props;
}

describe('SyncStatusBanner', () => {
  it('says offline in plain words and that entries are safe', () => {
    renderBanner({ kind: 'offline', pendingChanges: 3 });
    expect(screen.getByText('Not saved to Google Sheet — no internet')).toBeTruthy();
    expect(screen.getByText(/safe on this device/)).toBeTruthy();
    expect(screen.getByText(/3 changes not yet in the Google Sheet/)).toBeTruthy();
  });

  it('offers sign-in, not retry, when the session expired', () => {
    const props = renderBanner({ kind: 'auth' });
    expect(screen.queryByText('Retry')).toBeNull();
    fireEvent.click(screen.getByText('Sign in again'));
    expect(props.onSignIn).toHaveBeenCalled();
  });

  it('tells a partner without access to ask the owner, and lets them retry', () => {
    const props = renderBanner({ kind: 'access', details: '403 PERMISSION_DENIED' });
    expect(screen.getByText(/share it with you as an Editor/)).toBeTruthy();
    expect(screen.getByText('403 PERMISSION_DENIED')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(props.onRetry).toHaveBeenCalled();
  });

  it('counts down to the next automatic retry', () => {
    renderBanner({ kind: 'busy', nextRetryAt: Date.now() + 30_000 });
    expect(screen.getByText(/Retrying in 30s/)).toBeTruthy();
  });

  it('uses the singular for one pending change', () => {
    renderBanner({ pendingChanges: 1 });
    expect(screen.getByText(/1 change not yet in the Google Sheet/)).toBeTruthy();
  });
});
