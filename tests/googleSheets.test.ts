import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSheetRows, toSheetRows, findExistingSpreadsheet, DriveSearchError, extractSpreadsheetId, spreadsheetUrl, fetchSpreadsheetTitle, SHEET_COLUMNS, ensureSheetsExist } from '../src/utils/googleSheets';

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


describe('findExistingSpreadsheet', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch(impl: any) {
    const spy = vi.fn(impl);
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('returns the spreadsheet id when Drive finds one', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ files: [{ id: 'sheet-abc', name: 'FarmLedger Database' }] }),
    }));
    await expect(findExistingSpreadsheet('tok')).resolves.toBe('sheet-abc');
  });

  it('returns null when Drive answers successfully with no matches', async () => {
    // The only case where creating a new spreadsheet is the right move.
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ files: [] }) }));
    await expect(findExistingSpreadsheet('tok')).resolves.toBeNull();
  });

  it('asks Drive for the oldest match first so duplicates resolve consistently', async () => {
    const spy = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ files: [] }) }));
    await findExistingSpreadsheet('tok');
    expect(spy.mock.calls[0][0]).toContain('orderBy=createdTime');
  });

  it.each([
    [401, 'expired token'],
    [403, 'insufficient permissions'],
    [500, 'drive outage'],
  ])('throws on HTTP %i rather than reporting "not found"', async (status, body) => {
    // Regression: this used to return null, and the caller then created a
    // second 'FarmLedger Database', orphaning the real one.
    stubFetch(async () => ({
      ok: false,
      status,
      statusText: 'Error',
      text: async () => body,
    }));
    await expect(findExistingSpreadsheet('tok')).rejects.toBeInstanceOf(DriveSearchError);
  });

  it('carries the HTTP status on the thrown error', async () => {
    stubFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden', text: async () => 'nope' }));
    await expect(findExistingSpreadsheet('tok')).rejects.toMatchObject({ status: 403 });
  });

  it('throws when the network request itself fails', async () => {
    stubFetch(async () => { throw new TypeError('Failed to fetch'); });
    await expect(findExistingSpreadsheet('tok')).rejects.toBeInstanceOf(DriveSearchError);
  });

  it('throws when Drive returns an unreadable body', async () => {
    stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => { throw new SyntaxError('Unexpected token'); },
    }));
    await expect(findExistingSpreadsheet('tok')).rejects.toBeInstanceOf(DriveSearchError);
  });
});

describe('extractSpreadsheetId', () => {
  const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

  it.each([
    [`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`, 'full url with fragment'],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit`, 'url without fragment'],
    [`https://docs.google.com/spreadsheets/d/${ID}`, 'bare url'],
    [`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`, 'share url'],
    [ID, 'bare id'],
    [`  ${ID}  `, 'id with whitespace'],
  ])('accepts %s (%s)', input => {
    expect(extractSpreadsheetId(input as string)).toBe(ID);
  });

  it('pulls the id out of a mobile-shared link', () => {
    // What tapping "Share" in the Sheets Android app puts on the clipboard.
    expect(
      extractSpreadsheetId(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drivesdk`)
    ).toBe(ID);
  });

  it.each([
    ['', 'empty'],
    ['   ', 'whitespace'],
    ['not a sheet', 'prose'],
    ['short', 'too short to be an id'],
    ['https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit', 'a Doc, not a Sheet'],
  ])('rejects %s (%s)', input => {
    expect(extractSpreadsheetId(input as string)).toBeNull();
  });
});

describe('spreadsheetUrl', () => {
  it('builds a link that can be shared', () => {
    expect(spreadsheetUrl('abc123')).toBe('https://docs.google.com/spreadsheets/d/abc123/edit');
  });

  it('round-trips with extractSpreadsheetId', () => {
    const id = '1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';
    expect(extractSpreadsheetId(spreadsheetUrl(id))).toBe(id);
  });
});

describe('fetchSpreadsheetTitle', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the title when the user can open the sheet', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ properties: { title: 'Kothapalli Farms Ledger' } }),
    })));
    await expect(fetchSpreadsheetTitle('tok', 'id')).resolves.toBe('Kothapalli Farms Ledger');
  });

  it('reports a 403 as forbidden so the user is told to ask for access', async () => {
    // The shared-sheet case: the id is right, the account just isn't on the
    // share list yet.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 403, statusText: 'Forbidden', text: async () => 'caller lacks permission',
    })));
    await expect(fetchSpreadsheetTitle('tok', 'id')).rejects.toMatchObject({
      name: 'SpreadsheetAccessError',
      reason: 'forbidden',
    });
  });

  it('reports a 404 as not-found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false, status: 404, statusText: 'Not Found', text: async () => 'no such spreadsheet',
    })));
    await expect(fetchSpreadsheetTitle('tok', 'id')).rejects.toMatchObject({ reason: 'not-found' });
  });

  it('reports a network failure as unknown rather than a permission problem', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(fetchSpreadsheetTitle('tok', 'id')).rejects.toMatchObject({ reason: 'unknown' });
  });
});

describe('labour work description', () => {
  it('reaches the sheet and comes back on a pull', () => {
    const labour = {
      id: 'lab1', date: '2026-06-20', fieldId: 'f1', seasonId: 's1', workersCount: 4, wageRate: 500,
      totalCost: 2000, paidByMemberId: 'm1', targetType: 'single', description: 'Transplanting paddy',
    };
    const restored = parseSheetRows<any>(toSheetRows([labour], SHEET_COLUMNS.labours));
    expect(restored[0].description).toBe('Transplanting paddy');
  });

  it('is the last Labor column, so existing sheets keep their layout', () => {
    expect(SHEET_COLUMNS.labours[SHEET_COLUMNS.labours.length - 1]).toBe('description');
    expect(SHEET_COLUMNS.labours.slice(0, 14)).toEqual([
      'id', 'date', 'fieldId', 'seasonId', 'linkedActivityId', 'workersCount', 'wageRate', 'totalCost',
      'paidByMemberId', 'isCredit', 'creditAccountId', 'targetType', 'commonAllocationRule', 'allocations',
    ]);
  });
});

describe('ensureSheetsExist', () => {
  const allTabs = [
    'Members', 'Fields', 'Seasons', 'Activities', 'Expenses', 'Labor', 'StockItems', 'StockPurchases',
    'StockUsage', 'HarvestRevenue', 'AuditLogs', 'CreditAccounts', 'CreditRepayments',
    'SettlementClearances', 'NotificationPreferences',
  ];

  function stubSheets(laborColumns: number) {
    const calls: { url: string; body?: any }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (!init || init.method === 'GET') {
        return {
          ok: true,
          json: async () => ({
            sheets: allTabs.map((title, i) => ({
              properties: { title, sheetId: 100 + i, gridProperties: { columnCount: title === 'Labor' ? laborColumns : 20 } },
            })),
          }),
        } as any;
      }
      return { ok: true, json: async () => ({}), text: async () => '' } as any;
    }));
    return calls;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('widens a Labor tab made before the description column existed', async () => {
    const calls = stubSheets(14);
    await ensureSheetsExist('token', 'sheet');
    const update = calls.find(c => c.url.endsWith(':batchUpdate'))!;
    expect(update.body.requests).toEqual([
      { appendDimension: { sheetId: 105, dimension: 'COLUMNS', length: 1 } },
    ]);
  });

  it('leaves a sheet that is already wide enough untouched', async () => {
    const calls = stubSheets(15);
    await ensureSheetsExist('token', 'sheet');
    expect(calls.some(c => c.url.endsWith(':batchUpdate'))).toBe(false);
  });
});
