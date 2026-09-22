import { describe, it, expect } from 'vitest';
import { parseSheetRows, toSheetRows } from '../src/utils/googleSheets';

describe('parseSheetRows', () => {
  it('parses lowercase true/false into booleans', () => {
    const rows = [
      ['id', 'isClosed'],
      ['s1', 'false'],
      ['s2', 'true'],
    ];
    const items = parseSheetRows<{ id: string; isClosed: boolean }>(rows);
    expect(items[0].isClosed).toBe(false);
    expect(items[1].isClosed).toBe(true);
  });

  it('parses uppercase TRUE/FALSE into booleans (Google Sheets FORMATTED_VALUE render option)', () => {
    // Regression test: a season freshly created with isClosed=false round-tripped through
    // a Sheets pull came back as the string "FALSE" (truthy), showing every open season as
    // "Closed" in the UI. Google Sheets renders boolean cells as uppercase TRUE/FALSE by
    // default, not the lowercase strings this app writes.
    const rows = [
      ['id', 'isClosed'],
      ['s1', 'FALSE'],
      ['s2', 'TRUE'],
    ];
    const items = parseSheetRows<{ id: string; isClosed: boolean }>(rows);
    expect(items[0].isClosed).toBe(false);
    expect(items[1].isClosed).toBe(true);
  });

  it('parses mixed-case True/False into booleans', () => {
    const rows = [
      ['id', 'isCredit'],
      ['e1', 'True'],
      ['e2', 'False'],
    ];
    const items = parseSheetRows<{ id: string; isCredit: boolean }>(rows);
    expect(items[0].isCredit).toBe(true);
    expect(items[1].isCredit).toBe(false);
  });

  it('still parses numeric strings as numbers', () => {
    const rows = [
      ['id', 'amount'],
      ['e1', '1000'],
    ];
    const items = parseSheetRows<{ id: string; amount: number }>(rows);
    expect(items[0].amount).toBe(1000);
  });

  it('still restores JSON-stringified arrays/objects', () => {
    const rows = [
      ['id', 'shares'],
      ['f1', JSON.stringify([{ memberId: 'm1', percentage: 100 }])],
    ];
    const items = parseSheetRows<{ id: string; shares: unknown }>(rows);
    expect(items[0].shares).toEqual([{ memberId: 'm1', percentage: 100 }]);
  });

  it('leaves ordinary text untouched', () => {
    const rows = [
      ['id', 'cropName'],
      ['s1', 'Rice'],
    ];
    const items = parseSheetRows<{ id: string; cropName: string }>(rows);
    expect(items[0].cropName).toBe('Rice');
  });

  it('skips rows without a valid id', () => {
    const rows = [
      ['id', 'cropName'],
      ['', 'Rice'],
      ['s1', 'Wheat'],
    ];
    const items = parseSheetRows<{ id: string; cropName: string }>(rows);
    expect(items).toHaveLength(1);
    expect(items[0].cropName).toBe('Wheat');
  });
});

describe('season shares round-trip', () => {
  // Regression test: editing the partnership split on an already-started season
  // updated the screen but reverted on reload. The Seasons push column list
  // omitted 'shares', so the override never reached the sheet and the next pull
  // returned a season without it, dropping the UI back to the field-level split.
  const SEASON_COLUMNS = ['id', 'fieldId', 'cropName', 'startDate', 'endDate', 'isClosed', 'shares'];

  it('keeps a season-level share override across a push/pull cycle', () => {
    const season = {
      id: 'season_1',
      fieldId: 'field_1',
      cropName: 'Paddy',
      startDate: '2026-06-01',
      endDate: '',
      isClosed: false,
      shares: [
        { memberId: 'mem_1', percentage: 70 },
        { memberId: 'mem_2', percentage: 30 },
      ],
    };

    const restored = parseSheetRows<typeof season>(toSheetRows([season], SEASON_COLUMNS));

    expect(restored).toHaveLength(1);
    expect(restored[0].shares).toEqual(season.shares);
    expect(restored[0].isClosed).toBe(false);
  });

  it('leaves a season with no override falling back to the field split', () => {
    const season = {
      id: 'season_2',
      fieldId: 'field_1',
      cropName: 'Cotton',
      startDate: '2026-06-01',
      endDate: '',
      isClosed: false,
    };

    const restored = parseSheetRows<any>(toSheetRows([season], SEASON_COLUMNS));

    // An absent override serialises to an empty cell. The consumers guard with
    // `season.shares && season.shares.length > 0`, which an empty string fails,
    // so the field-level split is used.
    expect(restored[0].shares).toBeFalsy();
  });
});

describe('arrays of primitives', () => {
  it('keeps an activity that has photos', () => {
    // Regression test: the parser rejected arrays whose first element was not
    // an object and discarded the WHOLE row. Activity.photos is a list of
    // URLs, so any activity logged with a photo vanished on the next pull.
    const activity = {
      id: 'act_manual_1',
      date: '2026-09-01',
      fieldId: 'field_1',
      seasonId: 'season_1',
      type: 'Spraying',
      notes: 'Sprayed the north plot',
      photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg']
    };

    const restored = parseSheetRows<typeof activity>(
      toSheetRows([activity], ['id', 'date', 'fieldId', 'seasonId', 'type', 'notes', 'photos'])
    );

    expect(restored).toHaveLength(1);
    expect(restored[0].photos).toEqual(activity.photos);
  });

  it('keeps notification preferences keyed by memberId', () => {
    // These carry no `id`, so they need the alternate identity field; their
    // enabledEvents is likewise an array of plain strings.
    const preference = {
      memberId: 'mem_1',
      channel: 'sms',
      phoneNumber: '9876543210',
      enabledEvents: ['expense_added', 'harvest_recorded']
    };

    const restored = parseSheetRows<typeof preference>(
      toSheetRows([preference], ['memberId', 'channel', 'phoneNumber', 'enabledEvents']),
      'memberId'
    );

    expect(restored).toHaveLength(1);
    expect(restored[0].enabledEvents).toEqual(preference.enabledEvents);
  });

  it('still drops a row with no identity at all', () => {
    const rows = [
      ['id', 'notes'],
      ['', 'orphan'],
      ['a1', 'kept']
    ];

    expect(parseSheetRows<any>(rows)).toHaveLength(1);
  });
});
