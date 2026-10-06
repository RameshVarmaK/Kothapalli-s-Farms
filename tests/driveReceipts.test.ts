import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  uploadPendingReceipts,
  collectPendingReceipts,
  applyUploadedReceipts,
  migrateLegacyReceipts,
  stashInlineReceipts,
  stripInlineReceiptData,
  cleanupStoredReceipts,
  removedDriveFileIds,
  ORPHAN_RECEIPT_TTL_MS,
} from '../src/utils/driveReceipts';
import {
  readLedgerFolderId,
  writeLedgerFolderId,
  resolveLedgerFolder,
  checkReceiptsFolderOnSignIn,
  connectReceiptsFolder,
  shareFolderWithSheet,
  trashDriveFiles,
  getReceiptsFolderStatus,
  resetReceiptsFolderState,
  FOLDER_METADATA_KEY,
  RECEIPTS_FOLDER_NAME,
} from '../src/utils/receiptsFolder';
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
  /** Folder id already recorded in the ledger (developer metadata). */
  ledgerFolder?: string | null;
  /** Another partner's folder that shows up first after we record ours. */
  raceWinner?: string;
  /** Status of files.get on the folder (200 = this app can use it). */
  folderAccess?: number;
  ownedByMe?: boolean;
  sheetPermissionsStatus?: number;
  sheetPermissions?: { emailAddress?: string; role: string; type: string }[];
  folderPermissions?: { emailAddress?: string; role: string; type: string }[];
  uploadFails?: boolean;
}

function stubDrive(opts: DriveStubOptions = {}) {
  const calls: Call[] = [];
  let recorded: string[] = opts.ledgerFolder ? [opts.ledgerFolder] : [];
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

    if (url.startsWith('https://sheets.googleapis.com/v4/spreadsheets/sheet_1?fields=developerMetadata')) {
      return json(200, {
        developerMetadata: recorded.map((v, i) => ({ metadataId: i + 1, metadataKey: FOLDER_METADATA_KEY, metadataValue: v })),
      });
    }
    if (url === 'https://sheets.googleapis.com/v4/spreadsheets/sheet_1:batchUpdate') {
      const value = body.requests[0].createDeveloperMetadata.developerMetadata.metadataValue;
      recorded = opts.raceWinner ? [opts.raceWinner, value] : [...recorded, value];
      return json(200, {});
    }
    if (url.startsWith('https://www.googleapis.com/upload/drive/v3/files')) {
      if (opts.uploadFails) throw new TypeError('Failed to fetch');
      return json(200, { id: 'file_1', webViewLink: 'https://drive.google.com/file/d/file_1/view' });
    }
    if (url === 'https://www.googleapis.com/drive/v3/files?fields=id' && method === 'POST') {
      return json(200, { id: 'folder_new' });
    }
    if (/\/files\/sheet_1\/permissions/.test(url)) {
      return json(opts.sheetPermissionsStatus ?? 200, { permissions: opts.sheetPermissions ?? [] });
    }
    if (/\/files\/folder_[a-z]+\/permissions\?fields/.test(url)) {
      return json(200, { permissions: opts.folderPermissions ?? [] });
    }
    if (/\/files\/folder_[a-z]+\/permissions\?sendNotificationEmail=false/.test(url) && method === 'POST') {
      return json(200, { id: 'perm' });
    }
    if (/\/files\/folder_[a-z]+\?fields=id,ownedByMe/.test(url)) {
      const status = opts.folderAccess ?? 200;
      return json(status, { id: 'folder', ownedByMe: opts.ownedByMe ?? true });
    }
    if (method === 'PATCH') {
      return json(url.includes('/files/theirs') ? 403 : 200, {});
    }
    return json(404, {});
  }));
  return calls;
}

let store: ReturnType<typeof createMemoryReceiptStore>;
beforeEach(() => {
  resetReceiptsFolderState();
  store = createMemoryReceiptStore();
  setReceiptStoreBackend(store);
});
afterEach(() => setReceiptStoreBackend(undefined));
afterEach(() => vi.unstubAllGlobals());

const grantsOn = (calls: Call[], folder: string) =>
  calls.filter(c => c.method === 'POST' && c.url.includes(`/files/${folder}/permissions?sendNotificationEmail=false`));

describe('the ledger records its receipts folder', () => {
  it('reads the folder id from the spreadsheet developer metadata', async () => {
    const calls = stubDrive({ ledgerFolder: 'folder_shared' });
    expect(await readLedgerFolderId('tok', 'sheet_1')).toBe('folder_shared');
    expect(calls[0].url).toContain('fields=developerMetadata(metadataId,metadataKey,metadataValue)');
  });

  it('returns null when the ledger has no folder yet', async () => {
    stubDrive({ ledgerFolder: null });
    expect(await readLedgerFolderId('tok', 'sheet_1')).toBeNull();
  });

  it('writes the folder id as document-visible spreadsheet metadata', async () => {
    const calls = stubDrive();
    await writeLedgerFolderId('tok', 'sheet_1', 'folder_new');
    expect(calls[0].body).toEqual({
      requests: [{
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: FOLDER_METADATA_KEY,
            metadataValue: 'folder_new',
            location: { spreadsheet: true },
            visibility: 'DOCUMENT',
          },
        },
      }],
    });
  });
});

describe('creating the shared folder', () => {
  it('creates, records and shares it with the sheet people (editors as writers, no email, never public)', async () => {
    const calls = stubDrive({
      ledgerFolder: null,
      sheetPermissions: [
        { emailAddress: 'owner@x.com', role: 'owner', type: 'user' },
        { emailAddress: 'partner@x.com', role: 'writer', type: 'user' },
        { emailAddress: 'family@x.com', role: 'reader', type: 'group' },
        { role: 'reader', type: 'anyone' },
        { role: 'reader', type: 'domain' },
      ],
      folderPermissions: [{ emailAddress: 'owner@x.com', role: 'owner', type: 'user' }],
    });
    expect(await resolveLedgerFolder('tok', 'sheet_1')).toBe('folder_new');

    const create = calls.find(c => c.url.endsWith('/drive/v3/files?fields=id'))!;
    expect(create.body).toEqual({ name: RECEIPTS_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' });
    expect(calls.some(c => c.url.endsWith(':batchUpdate'))).toBe(true);
    expect(grantsOn(calls, 'folder_new').map(g => g.body)).toEqual([
      { role: 'writer', type: 'user', emailAddress: 'partner@x.com' },
      { role: 'reader', type: 'group', emailAddress: 'family@x.com' },
    ]);
    expect(getReceiptsFolderStatus()).toEqual({ state: 'ready', folderId: 'folder_new' });
  });

  it('defers to a folder another partner recorded first, trashing its own empty one', async () => {
    const calls = stubDrive({ ledgerFolder: null, raceWinner: 'folder_theirs' });
    expect(await resolveLedgerFolder('tok', 'sheet_1')).toBe('folder_theirs');
    expect(calls.some(c => c.method === 'PATCH' && c.url.includes('/files/folder_new'))).toBe(true);
    expect(grantsOn(calls, 'folder_new')).toHaveLength(0);
  });

  it('uploads into the ledger folder with no per-file sharing', async () => {
    const calls = stubDrive({ ledgerFolder: 'folder_shared' });
    const { uploaded } = await uploadPendingReceipts('tok', 'sheet_1', await collectPendingReceipts([expense([pending()])]));
    expect(uploaded.get('att_1')).toEqual({
      id: 'att_1',
      fileName: 'bill.jpg',
      mimeType: 'image/jpeg',
      size: 5,
      uploadedAt: '2026-10-01T00:00:00.000Z',
      driveFileId: 'file_1',
      webViewLink: 'https://drive.google.com/file/d/file_1/view',
    });
    const upload = calls.find(c => c.url.includes('/upload/drive/v3/files'))!;
    expect(upload.url).toContain('uploadType=multipart');
    expect(upload.headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(upload.headers.Authorization).toBe('Bearer tok');
    expect(upload.body).toContain('"parents":["folder_shared"]');
    expect(upload.body).toContain('Content-Type: image/jpeg');
    expect(upload.body).toContain('hello');
    expect(calls.some(c => c.url.includes('/files/file_1/permissions'))).toBe(false);
    expect(calls.some(c => c.url.endsWith('/drive/v3/files?fields=id'))).toBe(false);
  });
});

describe('a partner who has not connected the folder', () => {
  it('keeps receipts pending and asks to connect when the folder is not reachable', async () => {
    const calls = stubDrive({ ledgerFolder: 'folder_shared', folderAccess: 404 });
    const expenses = [expense([pending()])];
    const { uploaded, failed } = await uploadPendingReceipts('tok', 'sheet_1', await collectPendingReceipts(expenses));
    expect(uploaded.size).toBe(0);
    expect(failed).toBe(1);
    expect(calls.some(c => c.url.includes('/upload/'))).toBe(false);
    expect(getReceiptsFolderStatus()).toEqual({ state: 'needs-connect', folderId: 'folder_shared' });
  });

  it('shows the connect prompt on sign-in, and connects through the picker', async () => {
    stubDrive({ ledgerFolder: 'folder_shared', folderAccess: 403 });
    await checkReceiptsFolderOnSignIn('tok', 'sheet_1');
    expect(getReceiptsFolderStatus().state).toBe('needs-connect');

    expect(await connectReceiptsFolder('tok', async () => 'folder_other')).toBe('wrong-folder');
    expect(await connectReceiptsFolder('tok', async () => null)).toBe('cancelled');

    stubDrive({ ledgerFolder: 'folder_shared', folderAccess: 200, ownedByMe: false });
    const pick = vi.fn(async (_t: string, id: string) => id);
    expect(await connectReceiptsFolder('tok', pick)).toBe('connected');
    expect(pick).toHaveBeenCalledWith('tok', 'folder_shared');
    expect(getReceiptsFolderStatus()).toEqual({ state: 'ready', folderId: 'folder_shared' });
  });
});

describe('re-sharing on sign-in', () => {
  it('adds only people newly on the sheet, when this partner owns the folder', async () => {
    const calls = stubDrive({
      ledgerFolder: 'folder_shared',
      ownedByMe: true,
      sheetPermissions: [
        { emailAddress: 'owner@x.com', role: 'owner', type: 'user' },
        { emailAddress: 'Partner@x.com', role: 'writer', type: 'user' },
        { emailAddress: 'new@x.com', role: 'commenter', type: 'user' },
        { role: 'reader', type: 'anyone' },
      ],
      folderPermissions: [
        { emailAddress: 'owner@x.com', role: 'owner', type: 'user' },
        { emailAddress: 'partner@x.com', role: 'reader', type: 'user' },
      ],
    });
    await checkReceiptsFolderOnSignIn('tok', 'sheet_1');
    expect(grantsOn(calls, 'folder_shared').map(g => g.body)).toEqual([
      { role: 'reader', type: 'user', emailAddress: 'new@x.com' },
    ]);
    // Nobody is removed or changed.
    expect(calls.some(c => c.method === 'DELETE' || c.method === 'PATCH')).toBe(false);
  });

  it('leaves sharing alone when this partner does not own the folder', async () => {
    const calls = stubDrive({
      ledgerFolder: 'folder_shared',
      ownedByMe: false,
      sheetPermissions: [{ emailAddress: 'new@x.com', role: 'writer', type: 'user' }],
    });
    await checkReceiptsFolderOnSignIn('tok', 'sheet_1');
    expect(grantsOn(calls, 'folder_shared')).toHaveLength(0);
  });

  it('copes when the sheet permissions cannot be read', async () => {
    stubDrive({ sheetPermissionsStatus: 403 });
    expect(await shareFolderWithSheet('tok', 'folder_shared', 'sheet_1')).toBeNull();
  });
});

describe('removed receipts go to the Drive trash', () => {
  const uploadedAtt = (id: string, fileId: string): Attachment => ({
    id, fileName: `${id}.jpg`, mimeType: 'image/jpeg', size: 1, uploadedAt: 'x', driveFileId: fileId,
  });

  it('finds the files taken off an expense, or all of a deleted one', () => {
    const before = expense([uploadedAtt('a', 'f_a'), uploadedAtt('b', 'f_b'), pending('c')]);
    expect(removedDriveFileIds(before, [uploadedAtt('a', 'f_a')])).toEqual(['f_b']);
    expect(removedDriveFileIds(before, undefined)).toEqual(['f_a', 'f_b']);
    expect(removedDriveFileIds(undefined, [])).toEqual([]);
  });

  it('trashes each file and quietly skips one it cannot trash', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls = stubDrive();
    await trashDriveFiles('tok', ['mine', 'theirs']);
    const patches = calls.filter(c => c.method === 'PATCH');
    expect(patches.map(p => p.url.split('/files/')[1].split('?')[0])).toEqual(['mine', 'theirs']);
    expect(patches.every(p => p.body.trashed === true)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('offline receipts', () => {
  it('keeps a receipt pending, with its file, when the upload fails', async () => {
    stubDrive({ ledgerFolder: 'folder_old', uploadFails: true });
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
    stubDrive({ ledgerFolder: 'folder_old' });
    const expenses = [expense([pending()])];
    const { uploaded } = await uploadPendingReceipts('tok', 'sheet_1', await collectPendingReceipts(expenses));
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
    const calls = stubDrive({ ledgerFolder: 'folder_old' });
    const work = await collectPendingReceipts([expense([stored()])]);
    expect(work[0].attachment.data).toBe(DATA);

    const { uploaded } = await uploadPendingReceipts('tok', 'sheet_1', work);
    expect(uploaded.get('att_1')?.driveFileId).toBe('file_1');
    expect(calls.find(c => c.url.includes('/upload/'))!.body).toContain('hello');
    expect(store.entries.has('att_1')).toBe(false);
  });

  it('keeps the store entry when the upload fails', async () => {
    store.entries.set('att_1', { id: 'att_1', data: DATA, savedAt: Date.now() });
    stubDrive({ ledgerFolder: 'folder_old', uploadFails: true });
    await uploadPendingReceipts('tok', 'sheet_1', await collectPendingReceipts([expense([stored()])]));
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
