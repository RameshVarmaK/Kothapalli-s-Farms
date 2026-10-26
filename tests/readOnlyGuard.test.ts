import { describe, expect, it, vi } from 'vitest';
import { installReadOnlyGuard } from '../src/dev/readOnlyGuard';

function setup() {
  const real = vi.fn(async () => new Response('real', { status: 200 }));
  const target = { fetch: real as unknown as typeof fetch, location: { href: 'http://localhost:3000/?readonly' } as Location };
  const blocked = installReadOnlyGuard(target, real as unknown as typeof fetch);
  return { real, target, blocked };
}
const SHEET = 'https://sheets.googleapis.com/v4/spreadsheets/abc123';

describe('read-only guard', () => {
  it('lets reads through to Google untouched', async () => {
    const { real, target, blocked } = setup();
    await target.fetch(`${SHEET}/values:batchGet?ranges=Members!A:Z`);
    await target.fetch('https://www.googleapis.com/drive/v3/files?q=x', { method: 'GET' });
    expect(real).toHaveBeenCalledTimes(2);
    expect(blocked).toHaveLength(0);
  });

  it('simulates success for adding tabs or columns, without sending it', async () => {
    const { real, target, blocked } = setup();
    const res = await target.fetch(`${SHEET}:batchUpdate`, { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ replies: [] });
    expect(real).not.toHaveBeenCalled();
    expect(blocked.map(b => b.outcome)).toEqual(['simulated']);
  });

  it('refuses writing rows, clearing ranges and creating a spreadsheet', async () => {
    const { real, target, blocked } = setup();
    for (const url of [`${SHEET}/values:batchUpdate`, `${SHEET}/values/Expenses!A2:Z:clear`, 'https://sheets.googleapis.com/v4/spreadsheets']) {
      const res = await target.fetch(url, { method: 'POST', body: '{}' });
      expect(res.status).toBe(403);
    }
    expect(real).not.toHaveBeenCalled();
    expect(blocked.every(b => b.outcome === 'refused')).toBe(true);
  });

  it('refuses Drive uploads, folder creation and trashing', async () => {
    const { real, target } = setup();
    for (const [url, method] of [
      ['https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', 'POST'],
      ['https://www.googleapis.com/drive/v3/files', 'POST'],
      ['https://www.googleapis.com/drive/v3/files/xyz', 'PATCH'],
    ]) {
      expect((await target.fetch(url, { method })).status).toBe(403);
    }
    expect(real).not.toHaveBeenCalled();
  });

  it('leaves other hosts alone, such as Firebase sign-in', async () => {
    const { real, target, blocked } = setup();
    await target.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup', { method: 'POST', body: '{}' });
    expect(real).toHaveBeenCalledTimes(1);
    expect(blocked).toHaveLength(0);
  });
});
