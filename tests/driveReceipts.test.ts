import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  findOrCreateReceiptsFolder,
  uploadPendingAttachment,
  uploadPendingReceipts,
  shareWithSheetPartners,
  collectPendingReceipts,
  applyUploadedReceipts,
  migrateLegacyReceipts,
  resetReceiptFolderCache,
  RECEIPTS_FOLDER_NAME,
  stashInlineReceipts,
  stripInlineReceiptData,
  cleanupStoredReceipts,
  ORPHAN_RECEIPT_TTL_MS,
} from '../src/utils/driveReceipts';
import { keepPendingReceiptData, normalizeAttachment, receiptCount } from '../src/utils/attachments';
import { SHEET_COLUMNS, toSheetRows, parseSheetRows, pushDataToSpreadsheet, ensureSheetsExist } from '../src/utils/googleSheets';
import { Attachment, Expense } from '../src/types';
import { createMemoryReceiptStore, setReceiptStoreBackend } from '../src/utils/receiptStore';
import { saveDatabase, LocalDatabase } from '../src/utils/database';

type Call = { url: string; method: string; body?: any; headers?: any };

// "hello" in base64
const DATA = 'aGVsbG8=';

function pending(id = 'att_1'): Attachment {
  return {
    id,
    fileName: 'bill.jpg',
    mimeType: 'image/jpeg',
    size: 5,
    uploadedAt: '2026-10-01T00:00:00.000Z',
    pending: true,
    data: DATA,
  };
}

function expense(attachments?: Attachment[], extra: Partial<Expense> = {}): Expense {
  return {
    id: 'exp_1',
    date: '2026-10-01',
    amount: 500,
    paidByMemberId: 'm1',
    category: 'Fertilizer',
    targetType: 'single',
    targetFieldId: 'f1',
    targetSeasonId: 's1',
    attachments,
    ...extra,
  };
}

interface DriveStubOptions {
  existingFolder?: string | null;
  permissionsStatus?: number;
  permissions?: { emailAddress?: string; role: string; type: string }[];
  uploadFails?: boolean;
}

function stubDrive(opts: DriveStubOptions = {}) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
    const method = init?.method || 'GET';
    let body: any = init?.body;
    if (body instanceof Blob) body = await body.text();
    else if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* raw */ }
    }
    calls.push({ url, method, body, headers: init?.headers });

    const json = (status: number, payload: any) => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    }) as any;

    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      if (opts.uploadFails) throw new TypeError('Failed to fetch');
      return json(200, { id: 'file_1', webViewLink: 'https://drive.google.com/file/d/file_1/view' });
    }
    if (url.includes('/drive/v3/files?q=')) {
      return json(200, { files: opts.existingFolder ? [{ id: opts.existingFolder }] : [] });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files?fields=id') && method === 'POST') {
      return json(200, { id: 'folder_new' });
    }
    if (url.includes('/files/sheet_1/permissions')) {
      return json(opts.permissionsStatus ?? 200, { permissions: opts.permissions ?? [] });
    }
    if (url.includes('/files/file_1/permissions') && method === 'POST') {
      return json(200, { id: 'perm' });
    }
    return json(404, {});
  }));
  return calls;
}

let store: ReturnType<typeof createMemoryReceiptStore>;
beforeEach(() => {
  resetReceiptFolderCache();
  store = createMemoryReceiptStore();
  setReceiptStoreBackend(store);
});
afterEach(() => setReceiptStoreBackend(undefined));
afterEach(() => vi.unstubAllGlobals());

describe('receipts folder', () => {
  it('reuses the folder found by name and folder mime type', async () => {
    const calls = stubDrive({ existingFolder: 'folder_old' });
    expect(await findOrCreateReceiptsFolder('tok')).toBe('folder_old');
    const q = decodeURIComponent(calls[0].url.split('q=')[1].split('&')[0]);
    expect(q).toContain(`name = '${RECEIPTS_FOLDER_NAME}'`);
    expect(q).toContain("mimeType = 'application/vnd.google-apps.folder'");
    expect(q).toContain('trashed = false');
    expect(calls.some(c => c.method === 'POST')).toBe(false);
  });

  it('creates the folder once when none exists, then remembers it', async () => {
    const calls = stubDrive({ existingFolder: null });
    expect(await findOrCreateReceiptsFolder('tok')).toBe('folder_new');
    expect(await findOrCreateReceiptsFolder('tok')).toBe('folder_new');
    const creates = calls.filter(c => c.method === 'POST');
    expect(creates).toHaveLength(1);
    expect(creates[0].body).toEqual({ name: RECEIPTS_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' });
    expect(calls.filter(c => c.url.includes('q='))).toHaveLength(1);
  });
});

describe('uploadPendingAttachment', () => {
  it('sends a multipart upload into the folder and returns metadata only', async () => {
    const calls = stubDrive({ existingFolder: 'folder_old' });
    const done = await uploadPendingAttachment('tok', null, pending());

    const upload = calls.find(c => c.url.includes('/upload/drive/v3/files'))!;
    expect(upload.url).toContain('uploadType=multipart');
    expect(upload.method).toBe('POST');
    expect(upload.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(upload.headers.Authorization).toBe('Bearer tok');
    expect(upload.body).toContain('"parents":["folder_old"]');
    expect(upload.body).toContain('"name":"bill.jpg"');
    expect(upload.body).toContain('Content-Type: image/jpeg');
    expect(upload.body).toContain('hello'); // the decoded file bytes

    expect(done).toEqual({
      id: 'att_1',
      fileName: 'bill.jpg',
      mimeType: 'image/jpeg',
      size: 5,
      uploadedAt: '2026-10-01T00:00:00.000Z',
      driveFileId: 'file_1',
      webViewLink: 'https://drive.google.com/file/d/file_1/view',
    });
  });

  it('shares the file (reader, no email) with every user and group on the ledger', async () => {
    const calls = stubDrive({
      existingFolder: 'folder_old',
      permissions: [
        { emailAddress: 'owner@x.com', role: 'owner', type: 'user' },
        { emailAddress: 'partner@x.com', role: 'writer', type: 'user' },
        { emailAddress: 'family@x.com', role: 'reader', type: 'group' },
        { role: 'reader', type: 'anyone' },
        { role: 'reader', type: 'domain' },
      ],
    });
    await uploadPendingAttachment('tok', 'sheet_1', pending());

    const list = calls.find(c => c.url.includes('/files/sheet_1/permissions'))!;
    expect(list.url).toContain('fields=permissions(emailAddress,role,type)');
    const grants = calls.filter(c => c.url.includes('/files/file_1/permissions'));
    expect(grants.every(g => g.url.includes('sendNotificationEmail=false'))).toBe(true);
    expect(grants.map(g => g.body)).toEqual([
      { role: 'reader', type: 'user', emailAddress: 'owner@x.com' },
      { role: 'reader', type: 'user', emailAddress: 'partner@x.com' },
      { role: 'reader', type: 'group', emailAddress: 'family@x.com' },
    ]);
    // Never public.
    expect(grants.some(g => g.body.type === 'anyone' || g.body.type === 'domain')).toBe(false);
  });

  it('keeps the file private and still succeeds when the ledger permissions cannot be read', async () => {
    const calls = stubDrive({ existingFolder: 'folder_old', permissionsStatus: 403 });
    const done = await uploadPendingAttachment('tok', 'sheet_1', pending());
    expect(done.driveFileId).toBe('file_1');
    expect(done.webViewLink).toContain('file_1');
    expect(calls.some(c => c.url.includes('/files/file_1/permissions'))).toBe(false);
  });

  it('reports the fallback from shareWithSheetPartners', async () => {
    stubDrive({ permissionsStatus: 404 });
    expect(await shareWithSheetPartners('tok', 'file_1', 'sheet_1')).toBe(false);
  });
});

describe('offline receipts', () => {
  it('keeps a receipt pending, with its file, when the upload fails', async () => {
    stubDrive({ existingFolder: 'folder_old', uploadFails: true });
    const expenses = [expense([pending()])];
    const work = await collectPendingReceipts(expenses);
    expect(work).toHaveLength(1);

    const { uploaded, failed } = await uploadPendingReceipts('tok', 'sheet_1', work);
    expect(failed).toBe(1);
    expect(uploaded.size).toBe(0);

    const after = applyUploadedReceipts(expenses, uploaded);
    expect(after[0].attachments![0]).toEqual(pending());
    expect(await collectPendingReceipts(after)).toHaveLength(1);
  });

  it('applies a finished upload to the latest expenses', async () => {
    stubDrive({ existingFolder: 'folder_old' });
    const expenses = [expense([pending()])];
    const { uploaded } = await uploadPendingReceipts('tok', null, await collectPendingReceipts(expenses));
    const after = applyUploadedReceipts(expenses, uploaded);
    expect(after[0].attachments![0].driveFileId).toBe('file_1');
    expect(after[0].attachments![0].data).toBeUndefined();
    expect(after[0].attachments![0].pending).toBeUndefined();
    expect(await collectPendingReceipts(after)).toHaveLength(0);
  });

  it('puts the local file back on pending receipts after a pull', () => {
    const local = [expense([pending()])];
    const pulled = parseSheetRows<Expense>(toSheetRows(local, SHEET_COLUMNS.expenses));
    expect(pulled[0].attachments![0].data).toBeUndefined();
    const merged = keepPendingReceiptData(pulled, local);
    expect(merged[0].attachments![0].data).toBe(DATA);
    expect(merged[0].attachments![0].pending).toBe(true);
  });
});

describe('receipts in the sheet', () => {
  it('adds attachments as the last Expenses column without moving the others', () => {
    const cols = SHEET_COLUMNS.expenses;
    expect(cols[cols.length - 1]).toBe('attachments');
    expect(cols.slice(0, 14)).toEqual([
      'id', 'date', 'amount', 'paidByMemberId', 'category', 'linkedActivityId', 'targetType',
      'targetFieldId', 'targetSeasonId', 'commonAllocationRule', 'allocations', 'receiptPhoto',
      'isCredit', 'creditAccountId',
    ]);
  });

  it('never writes file content (or a legacy receiptPhoto) to the sheet', async () => {
    const legacyAttachment: any = { id: 'att_old', type: 'image', fileName: 'old.jpg', size: 3, uploadedAt: 'x', base64Data: 'QUJD' };
    const exp = expense([pending(), legacyAttachment], { receiptPhoto: 'data:image/jpeg;base64,WFlaWg==' });

    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (!init || init.method === 'GET') {
        return { ok: true, json: async () => ({ sheets: [{ properties: { title: 'Expenses', sheetId: 4, gridProperties: { columnCount: 15, rowCount: 1000 } } }] }) } as any;
      }
      return { ok: true, json: async () => ({}), text: async () => '' } as any;
    }));
    await pushDataToSpreadsheet('tok', 'sheet', { expenses: [exp] } as any, ['expenses']);

    const write = calls.find(c => c.url.endsWith('/values:batchUpdate'))!;
    const text = JSON.stringify(write.body);
    expect(text).not.toContain(DATA);
    expect(text).not.toContain('QUJD');
    expect(text).not.toContain('WFlaWg');
    expect(write.body.data[0].range).toBe('Expenses!A1:O2');

    const [header, row] = write.body.data[0].values;
    const cell = row[header.indexOf('attachments')];
    expect(JSON.parse(cell)).toEqual([
      { id: 'att_1', fileName: 'bill.jpg', mimeType: 'image/jpeg', size: 5, uploadedAt: '2026-10-01T00:00:00.000Z', pending: true },
      { id: 'att_old', fileName: 'old.jpg', mimeType: 'image/jpeg', size: 3, uploadedAt: 'x', pending: true },
    ]);
    expect(row[header.indexOf('receiptPhoto')]).toBe('');
  });

  it('widens an Expenses tab too narrow for the attachments column', async () => {
    const calls: any[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: any) => {
      calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
      if (!init || init.method === 'GET') {
        const titles = ['Members', 'Fields', 'Seasons', 'Activities', 'Expenses', 'Labor', 'StockItems', 'StockPurchases', 'StockUsage', 'HarvestRevenue', 'AuditLogs', 'CreditAccounts', 'CreditRepayments', 'SettlementClearances', 'NotificationPreferences'];
        return {
          ok: true,
          json: async () => ({ sheets: titles.map((title, i) => ({ properties: { title, sheetId: i, gridProperties: { columnCount: title === 'Expenses' ? 14 : 20, rowCount: 1000 } } })) }),
        } as any;
      }
      return { ok: true, json: async () => ({}), text: async () => '' } as any;
    }));
    await ensureSheetsExist('tok', 'sheet');
    const update = calls.find(c => c.url.endsWith(':batchUpdate'))!;
    expect(update.body.requests).toEqual([{ appendDimension: { sheetId: 4, dimension: 'COLUMNS', length: 1 } }]);
  });
});

describe('legacy receipts', () => {
  it('turns receiptPhoto and old-shape attachments into pending attachments', async () => {
    const legacyAttachment: any = { id: 'att_old', type: 'document', fileName: 'bill.pdf', size: 3, uploadedAt: 'x', base64Data: 'QUJD' };
    const [migrated] = migrateLegacyReceipts([expense([legacyAttachment], { receiptPhoto: 'WFlaWg==' })]);
    expect(migrated.receiptPhoto).toBeUndefined();
    expect(migrated.attachments).toEqual([
      { id: 'att_old', fileName: 'bill.pdf', mimeType: 'application/pdf', size: 3, uploadedAt: 'x', pending: true, data: 'QUJD' },
      expect.objectContaining({ id: 'att_receipt_exp_1', mimeType: 'image/jpeg', pending: true, data: 'WFlaWg==' }),
    ]);
    expect(await collectPendingReceipts([migrated])).toHaveLength(2);
    expect(receiptCount(migrated)).toBe(2);
  });

  it('leaves current-shape expenses alone', () => {
    const list = [expense([pending()]), expense(undefined, { id: 'exp_2' })];
    expect(migrateLegacyReceipts(list)).toBe(list);
  });

  it('treats a partner-pulled pending receipt (no file here) as nothing to upload', async () => {
    const pulled = normalizeAttachment({ id: 'a', fileName: 'x.jpg', mimeType: 'image/jpeg', size: 1, uploadedAt: 'x', pending: true });
    expect(await collectPendingReceipts([expense([pulled])])).toHaveLength(0);
  });
});

describe('pending receipt bytes live outside the saved database', () => {
  function stored(id = 'att_1'): Attachment {
    const { data: _data, ...meta } = pending(id);
    return meta;
  }

  it('moves inline bytes to the receipt store so the saved JSON never holds them', async () => {
    const expenses = [expense([pending()])];
    const moved = await stashInlineReceipts(expenses);
    expect([...moved]).toEqual(['att_1']);
    expect(store.entries.get('att_1')?.data).toBe(DATA);

    const stripped = stripInlineReceiptData(expenses, moved);
    expect(stripped[0].attachments![0]).toEqual(stored());

    expect(saveDatabase({ expenses: stripped } as unknown as LocalDatabase)).toBe(true);
    const saved = localStorage.getItem('farm_ledger_database')!;
    expect(saved).toContain('att_1');
    expect(saved).not.toContain(DATA);
  });

  it('reads the bytes back from the store for the upload, then clears the entry', async () => {
    store.entries.set('att_1', { id: 'att_1', data: DATA, savedAt: Date.now() });
    const calls = stubDrive({ existingFolder: 'folder_old' });
    const work = await collectPendingReceipts([expense([stored()])]);
    expect(work[0].attachment.data).toBe(DATA);

    const { uploaded } = await uploadPendingReceipts('tok', null, work);
    expect(uploaded.get('att_1')?.driveFileId).toBe('file_1');
    expect(calls.find(c => c.url.includes('/upload/'))!.body).toContain('hello');
    expect(store.entries.has('att_1')).toBe(false);
  });

  it('keeps the store entry when the upload fails', async () => {
    store.entries.set('att_1', { id: 'att_1', data: DATA, savedAt: Date.now() });
    stubDrive({ existingFolder: 'folder_old', uploadFails: true });
    await uploadPendingReceipts('tok', null, await collectPendingReceipts([expense([stored()])]));
    expect(store.entries.get('att_1')?.data).toBe(DATA);
  });

  it('clears entries of removed receipts and stale unsaved ones, keeping the rest', async () => {
    const now = Date.now();
    store.entries.set('kept', { id: 'kept', data: DATA, savedAt: now });
    store.entries.set('removed', { id: 'removed', data: DATA, savedAt: now });
    store.entries.set('form_open', { id: 'form_open', data: DATA, savedAt: now });
    store.entries.set('abandoned', { id: 'abandoned', data: DATA, savedAt: now - ORPHAN_RECEIPT_TTL_MS - 1 });

    const removed = await cleanupStoredReceipts([expense([stored('kept')])], new Set(['kept', 'removed']), now);
    expect(removed.sort()).toEqual(['abandoned', 'removed']);
    expect([...store.entries.keys()].sort()).toEqual(['form_open', 'kept']);
  });

  it('keeps bytes inline when there is no receipt store', async () => {
    setReceiptStoreBackend(null);
    const expenses = [expense([pending()])];
    expect((await stashInlineReceipts(expenses)).size).toBe(0);
    expect(stripInlineReceiptData(expenses, new Set())).toBe(expenses);
    expect((await collectPendingReceipts(expenses))[0].attachment.data).toBe(DATA);
  });
});
