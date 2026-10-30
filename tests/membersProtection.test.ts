import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureMembersProtection, ROLES_PROTECTION_DESCRIPTION } from '../src/utils/googleSheets';

const meta = (protectedRanges: any[] = []) => ({
  sheets: [
    { properties: { sheetId: 11, title: 'Expenses' }, protectedRanges: [] },
    { properties: { sheetId: 22, title: 'Members' }, protectedRanges },
  ],
});

function mockFetch(metaBody: any, updateOk = true) {
  const calls: { url: string; body?: any }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (url.includes(':batchUpdate')) return new Response(updateOk ? '{}' : 'nope', { status: updateOk ? 200 : 403 });
    return new Response(JSON.stringify(metaBody), { status: 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('ensureMembersProtection', () => {
  it('adds a protected range over the whole Members tab, editable by the owners only', async () => {
    const calls = mockFetch(meta());
    const result = await ensureMembersProtection('tok', 'sheet1', ['Ramesh@Example.com', 'ramesh@example.com']);
    expect(result).toBe('added');
    const req = calls[1].body.requests[0].addProtectedRange.protectedRange;
    expect(req.range).toEqual({ sheetId: 22 });
    expect(req.description).toBe(ROLES_PROTECTION_DESCRIPTION);
    expect(req.warningOnly).toBe(false);
    expect(req.editors).toEqual({ users: ['ramesh@example.com'], domainUsersCanEdit: false });
  });

  it('leaves an up-to-date protection alone', async () => {
    const calls = mockFetch(meta([{ protectedRangeId: 7, description: ROLES_PROTECTION_DESCRIPTION, editors: { users: ['ramesh@example.com', 'ganapathi@example.com'] } }]));
    expect(await ensureMembersProtection('tok', 'sheet1', ['ramesh@example.com'])).toBe('unchanged');
    expect(calls).toHaveLength(1);
  });

  it('adds a new owner to the editor list', async () => {
    const calls = mockFetch(meta([{ protectedRangeId: 7, description: ROLES_PROTECTION_DESCRIPTION, editors: { users: ['ramesh@example.com'] } }]));
    expect(await ensureMembersProtection('tok', 'sheet1', ['ramesh@example.com', 'ganapathi@example.com'])).toBe('updated');
    const upd = calls[1].body.requests[0].updateProtectedRange;
    expect(upd.protectedRange.protectedRangeId).toBe(7);
    expect(upd.protectedRange.editors.users).toEqual(['ganapathi@example.com', 'ramesh@example.com']);
    expect(upd.fields).toBe('editors');
  });

  it('returns null, never throws, when the sheet refuses', async () => {
    mockFetch(meta(), false);
    expect(await ensureMembersProtection('tok', 'sheet1', ['ramesh@example.com'])).toBeNull();
  });
});
