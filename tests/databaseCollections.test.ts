import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { DATABASE_COLLECTIONS } from '../src/utils/database';

/**
 * Two production bugs came from hand-maintained lists drifting away from
 * LocalDatabase: season shares never reached the Sheets push because the
 * Seasons column list was missing a field, and a conflict "merge" silently
 * dropped notification preferences because they were absent from its table
 * list. These tests fail when a collection is added to the interface without
 * being wired into the places that walk them.
 */
const readSrc = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', 'src', relativePath), 'utf8');

const collectionsOnInterface = (): string[] => {
  const source = readSrc('utils/database.ts');
  const body = source.split('export interface LocalDatabase {')[1].split('}')[0];

  return body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('//'))
    .map(line => line.match(/^([A-Za-z0-9_]+)\??:\s*(.+);$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    // Array-typed members only; `settings` is a single object handled separately.
    .filter(match => match[2].trim().endsWith('[]'))
    .map(match => match[1]);
};

describe('DATABASE_COLLECTIONS', () => {
  it('lists every array collection on LocalDatabase', () => {
    expect([...DATABASE_COLLECTIONS].sort()).toEqual(collectionsOnInterface().sort());
  });

  it('is used by the settings sync merge rather than a hand-copied list', () => {
    const settingsTab = readSrc('components/SettingsTab.tsx');

    expect(settingsTab).toContain('DATABASE_COLLECTIONS');
    // A literal table list here is what drifted before.
    expect(settingsTab).not.toMatch(/const tables = \[/);
  });

  it('round-trips every collection through the Sheets push and pull', () => {
    const sheets = readSrc('utils/googleSheets.ts');
    // Audit logs and deliveries aside, each collection needs a push range and
    // a matching pull tab, or an edit made on one device never reaches another.
    const notSynced = ['notificationDeliveries'];

    DATABASE_COLLECTIONS.filter(name => !notSynced.includes(name)).forEach(name => {
      expect(sheets, `${name} is missing from the Sheets push`).toContain(`data.${name}`);
    });
  });
});
