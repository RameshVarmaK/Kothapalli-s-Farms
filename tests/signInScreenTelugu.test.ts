import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { te } from '../src/i18n/te';

// The startup, loading and sign-in screens are early returns in App.tsx,
// rendered before the main app. Every string they pass through t() must have
// a Telugu entry, or a Telugu reader sees English before they can sign in.
describe('pre-sign-in screens in Telugu', () => {
  const source = readFileSync(resolve(__dirname, '../src/App.tsx'), 'utf8');
  const start = source.indexOf('  if (!db) {\n    return (');
  const end = source.indexOf('  const {\n    members = []', start);
  const screens = source.slice(start, end);
  // String literals inside each t(...) call, including both arms of a ternary.
  const keys = [...screens.matchAll(/\bt\(([^)]*)\)/g)].flatMap(call =>
    [...call[1].matchAll(/(['"])((?:(?!\1).)+)\1/g)].map(m => m[2])
  );

  it('finds the screens and their strings', () => {
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(keys).toContain('Authorize Google Account');
    expect(keys).toContain("Sign in to send them. Please don't enter them again.");
  });

  it('has a Telugu translation for each string', () => {
    const missing = keys.filter(k => !te[k]);
    expect(missing).toEqual([]);
  });
});
