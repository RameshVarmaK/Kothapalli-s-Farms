import { describe, expect, it, vi } from 'vitest';
import { resolveAccess, sharesChanged, memberForEmail } from '../src/app/access';
import { createLedgerActions } from '../src/app/ledgerActions';
import type { LocalDatabase } from '../src/utils/database';
import type { Member } from '../src/types';

const owner: Member = { id: 'm1', name: 'Ramesh', email: 'ramesh@example.com', role: 'owner' };
const editor: Member = { id: 'm2', name: 'Ganapathi', email: 'ganapathi@example.com', role: 'editor' };
const viewer: Member = { id: 'm3', name: 'Subbayah', email: 'subbayah@example.com', role: 'viewer' };
const unlinked: Member = { id: 'm4', name: 'Kumari' };
const members = [owner, editor, viewer, unlinked];

const resolve = (email: string | null, extra: Partial<Parameters<typeof resolveAccess>[0]> = {}) =>
  resolveAccess({ sheetAccess: 'edit', sheetOwnedByMe: false, members, email, ...extra });

describe('resolveAccess', () => {
  it('matches the signed-in email to a partner, ignoring case', () => {
    expect(memberForEmail(members, 'Ganapathi@Example.com')?.id).toBe('m2');
    expect(resolve('GANAPATHI@example.com').member?.id).toBe('m2');
  });

  it('gives owners everything and editors only ordinary writes', () => {
    const o = resolve('ramesh@example.com');
    const e = resolve('ganapathi@example.com');
    expect(o.isOwner).toBe(true);
    for (const action of ['write', 'delete-any', 'close-season', 'settle', 'manage-members', 'manage-shares', 'sheet-admin', 'restore'] as const) {
      expect(o.can(action)).toBe(true);
      expect(e.can(action)).toBe(action === 'write');
    }
  });

  it('lets editors delete only entries they paid for', () => {
    const e = resolve('ganapathi@example.com');
    expect(e.canDeleteEntry(['m2'])).toBe(true);
    expect(e.canDeleteEntry(['m1', 'm2'])).toBe(true);
    expect(e.canDeleteEntry(['m1'])).toBe(false);
    expect(resolve('ramesh@example.com').canDeleteEntry(['m3'])).toBe(true);
  });

  it('is read-only for viewers and for accounts the ledger does not know', () => {
    expect(resolve('subbayah@example.com').readOnly).toBe(true);
    const stranger = resolve('someone@else.com');
    expect(stranger.readOnly).toBe(true);
    expect(stranger.role).toBe('viewer');
    expect(stranger.can('write')).toBe(false);
  });

  it('treats everyone as owner until any partner has an email (legacy ledgers)', () => {
    const legacy = resolveAccess({ sheetAccess: 'edit', sheetOwnedByMe: false, members: [unlinked], email: 'anyone@example.com' });
    expect(legacy.rolesConfigured).toBe(false);
    expect(legacy.isOwner).toBe(true);
  });

  it('always treats the Drive owner of the sheet as owner', () => {
    const o = resolve('someone@else.com', { sheetOwnedByMe: true });
    expect(o.isOwner).toBe(true);
  });

  it('goes read-only when Drive only allows viewing, whatever the role says', () => {
    const o = resolve('ramesh@example.com', { sheetAccess: 'view' });
    expect(o.readOnly).toBe(true);
    expect(o.can('write')).toBe(false);
    expect(o.reason('settle')).toMatch(/view-only/);
  });

  it('defaults a linked partner without a role to editor', () => {
    const e = resolveAccess({ sheetAccess: 'edit', sheetOwnedByMe: false, members: [owner, { id: 'm9', name: 'X', email: 'x@example.com' }], email: 'x@example.com' });
    expect(e.role).toBe('editor');
  });
});

describe('sharesChanged', () => {
  it('ignores order and number formatting', () => {
    expect(sharesChanged([{ memberId: 'a', percentage: 50 }, { memberId: 'b', percentage: 50 }], [{ memberId: 'b', percentage: 50 }, { memberId: 'a', percentage: 50 }])).toBe(false);
    expect(sharesChanged([{ memberId: 'a', percentage: 50 }], [{ memberId: 'a', percentage: 60 }])).toBe(true);
    expect(sharesChanged(undefined, [])).toBe(false);
  });
});

describe('ledger actions enforce the role', () => {
  const baseDb = (): LocalDatabase => ({
    members,
    fields: [{ id: 'f1', name: 'Farm A', area: 2, shares: [{ memberId: 'm1', percentage: 100 }] }],
    seasons: [{ id: 's1', fieldId: 'f1', cropName: 'Mirchi', startDate: '2026-09-01', isClosed: false, shares: [] }],
    expenses: [
      { id: 'e-mine', date: '2026-09-05', amount: 100, category: 'Seeds', paidByMemberId: 'm2', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
      { id: 'e-theirs', date: '2026-09-06', amount: 100, category: 'Seeds', paidByMemberId: 'm1', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' },
    ],
    labours: [], revenues: [], stockItems: [], purchases: [], usages: [], activities: [], auditLogs: [],
    creditAccounts: [], creditRepayments: [], settlementClearances: [], notificationPreferences: [],
    settings: { currency: '₹', areaUnit: 'acres', googleDriveLinked: false },
  } as unknown as LocalDatabase);

  const actionsFor = (email: string) => {
    const db = baseDb();
    const setDb = vi.fn();
    const setConfirmDialog = vi.fn();
    const access = resolve(email);
    const actions = createLedgerActions({ db, setDb, setConfirmDialog, notificationPreferences: [], setNotificationPreferences: vi.fn(), access });
    return { actions, setDb, setConfirmDialog, db };
  };

  it('refuses a viewer every write and explains why', () => {
    const { actions, setDb, setConfirmDialog } = actionsFor('subbayah@example.com');
    expect(actions.handleAddExpense({ id: 'e3', date: '2026-09-07', amount: 50, category: 'Fuel', paidByMemberId: 'm3', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' } as any)).toBe(false);
    expect(setDb).not.toHaveBeenCalled();
    expect(setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not allowed' }));
  });

  it('lets an editor add entries and delete their own, but not another partner\'s', () => {
    const { actions, setDb, setConfirmDialog } = actionsFor('ganapathi@example.com');
    expect(actions.handleAddExpense({ id: 'e3', date: '2026-09-07', amount: 50, category: 'Fuel', paidByMemberId: 'm2', targetType: 'single', targetFieldId: 'f1', targetSeasonId: 's1' } as any)).toBe(true);
    expect(setDb).toHaveBeenCalledTimes(1);
    actions.handleDeleteExpense('e-mine');
    expect(setDb).toHaveBeenCalledTimes(2);
    actions.handleDeleteExpense('e-theirs');
    expect(setDb).toHaveBeenCalledTimes(2);
    expect(setConfirmDialog).toHaveBeenCalledWith(expect.objectContaining({ title: 'Not allowed' }));
  });

  it('keeps closing seasons, settling and share changes for the owner', () => {
    const editorSide = actionsFor('ganapathi@example.com');
    expect(editorSide.actions.handleCloseSeason('s1', '2026-12-01')).toBe(false);
    editorSide.actions.handleUpdateClearances([], 'cleared');
    expect(editorSide.actions.handleUpdateField({ id: 'f1', name: 'Farm A', area: 2, shares: [{ memberId: 'm2', percentage: 100 }] })).toBe(false);
    // Renaming without touching shares is an ordinary write.
    expect(editorSide.actions.handleUpdateField({ id: 'f1', name: 'Farm A (north)', area: 2, shares: [{ memberId: 'm1', percentage: 100 }] })).toBe(true);
    expect(editorSide.setDb).toHaveBeenCalledTimes(1);

    const ownerSide = actionsFor('ramesh@example.com');
    expect(ownerSide.actions.handleCloseSeason('s1', '2026-12-01')).toBe(true);
    ownerSide.actions.handleUpdateClearances([], 'cleared');
    expect(ownerSide.setDb).toHaveBeenCalledTimes(2);
  });

  it('records who made each change in the audit log', () => {
    const { actions, setDb } = actionsFor('ganapathi@example.com');
    actions.handleAddActivity({ id: 'a1', fieldId: 'f1', seasonId: 's1', date: '2026-09-08', type: 'Irrigation', notes: 'rain' } as any);
    const written = setDb.mock.calls[0][0] as LocalDatabase;
    expect(written.auditLogs[written.auditLogs.length - 1].memberId).toBe('m2');
  });

  it('lets a partner edit their own details but not their role', () => {
    const { actions, setDb } = actionsFor('ganapathi@example.com');
    expect(actions.handleUpdateMember({ ...editor, phone: '999' })).toBe(true);
    expect(actions.handleUpdateMember({ ...editor, role: 'owner' })).toBe(false);
    expect(setDb).toHaveBeenCalledTimes(1);
  });
});
