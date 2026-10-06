import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { te } from '../src/i18n/te';

// The startup, loading and sign-in screens are AppShell's early returns,
// rendered before the main app. Every string they pass through t() must have
// a Telugu entry, or a Telugu reader sees English before they can sign in.
describe('pre-sign-in screens in Telugu', () => {
  const read = (path: string) => readFileSync(resolve(__dirname, '..', path), 'utf8');
  const app = read('src/App.tsx');
  const start = app.indexOf('  if (!db) {\n    return <StartingScreen />;');
  const end = app.indexOf('<SignInScreen', start);
  const screens = [
    'src/components/shell/StartingScreen.tsx',
    'src/components/shell/LoadingScreen.tsx',
    'src/components/shell/SignInScreen.tsx'
  ].map(read).join('\n');
  // String literals inside each t(...) call, including both arms of a ternary.
  const keys = [...screens.matchAll(/\bt\(([^)]*)\)/g)].flatMap(call =>
    [...call[1].matchAll(/(['"])((?:(?!\1).)+)\1/g)].map(m => m[2])
  );

  it('finds the screens and their strings', () => {
    // App.tsx's early returns are these three components.
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(app.slice(start, end)).toContain('return <LoadingScreen />;');
    expect(keys).toContain('Authorize Google Account');
    expect(keys).toContain("Sign in to send them. Please don't enter them again.");
  });

  it('has a Telugu translation for each string', () => {
    const missing = keys.filter(k => !te[k]);
    expect(missing).toEqual([]);
  });
});
