import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { te } from '../src/i18n/te';

const SRC = join(__dirname, '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === 'i18n' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

// Resolve the escapes a string literal can hold, so the key matches the runtime value.
const unescape = (literal: string) =>
  literal.replace(/\\(n|t|.)/g, (_, c) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));

// Matches t('literal') / t("literal"); dynamic keys can't be checked statically.
const T_CALL = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*[,)]/g;

describe('Telugu translations', () => {
  it('cover every literal t() key used in the app', () => {
    const missing = new Set<string>();
    for (const file of sourceFiles(SRC)) {
      for (const m of readFileSync(file, 'utf8').matchAll(T_CALL)) {
        const key = unescape(m[1] ?? m[2]);
        if (!(key in te)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('has no blank translations', () => {
    const blank = Object.entries(te).filter(([, v]) => !v.trim()).map(([k]) => k);
    expect(blank).toEqual([]);
  });
});
