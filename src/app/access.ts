/**
 * Who the signed-in Google account is in the ledger, and what they may do.
 *
 * Two layers. Drive's share setting on the ledger sheet is the only real
 * enforcement: a Viewer there cannot write through the Sheets API no matter
 * what the app shows, so the app goes read-only to match. On top of that,
 * each partner record can carry a role (owner / editor / viewer) that the
 * app applies to the dangerous actions. Any sheet Editor could change that
 * column by hand, so it is a guard against mistakes between partners who
 * trust each other, not a security boundary.
 */
import { Member, MemberRole } from '../types';

export type SheetAccess = 'unknown' | 'edit' | 'view';

/**
 * Which app a signed-in account gets. 'full' is the whole ledger (read-only
 * when Drive only allows viewing). A partner whose role is viewer gets
 * 'partner': only their own spend and the fields they are part of. An email
 * the ledger does not recognise, once roles are in use, gets 'unlinked': a
 * screen saying so and nothing from the ledger.
 */
export type AppShell = 'full' | 'partner' | 'unlinked';

export type AccessAction =
  | 'write'            // add or edit day-to-day entries
  | 'delete-any'       // delete entries other partners paid for, creditors, fields, seasons
  | 'close-season'     // mark harvested
  | 'settle'           // mark transfers cleared / uncleared
  | 'manage-members'   // add, edit, delete partners; set emails and roles
  | 'manage-shares'    // change field or season ownership percentages
  | 'sheet-admin'      // link, create, pull-overwrite, disconnect the sheet
  | 'restore';         // restore a backup / import JSON over the ledger

export interface AccessInput {
  sheetAccess: SheetAccess;
  /** Drive says this account owns the sheet; always treated as owner so the
   * person who set the ledger up can never lock themselves out. */
  sheetOwnedByMe: boolean;
  members: Member[];
  email: string | null | undefined;
}

export interface Access {
  sheetAccess: SheetAccess;
  /** Nothing may be changed: Drive gave view-only access, or the role is viewer. */
  readOnly: boolean;
  /** The partner record matching the signed-in email, if any. */
  member: Member | null;
  role: MemberRole;
  isOwner: boolean;
  /** True once any partner has an email set; until then everyone is an owner,
   * so turning roles on changes nothing for a ledger that never asked for them. */
  rolesConfigured: boolean;
  shell: AppShell;
  can(action: AccessAction): boolean;
  /** Deleting a ledger entry: owners may delete any, editors only what they paid for. */
  canDeleteEntry(payerIds: Array<string | undefined>): boolean;
  reason(action: AccessAction): string;
}

const REASONS: Record<AccessAction, string> = {
  'write': 'Your access to this ledger is view-only. Ask the ledger owner for editor access on the Google Sheet.',
  'delete-any': 'Only the ledger owner can delete this. Editors can delete entries they paid for themselves.',
  'close-season': 'Only the ledger owner can mark a season harvested, because it fixes the shares every partner settles on.',
  'settle': 'Only the ledger owner can mark transfers as cleared.',
  'manage-members': 'Only the ledger owner can add, edit or remove partners and set their roles.',
  'manage-shares': 'Only the ledger owner can change ownership shares.',
  'sheet-admin': 'Only the ledger owner can change which Google Sheet this app is linked to.',
  'restore': 'Only the ledger owner can restore a backup over the live ledger.',
};

const normalizeEmail = (value: string | null | undefined) => (value || '').trim().toLowerCase();

export function memberForEmail(members: Member[], email: string | null | undefined): Member | null {
  const wanted = normalizeEmail(email);
  if (!wanted) return null;
  return members.find(m => normalizeEmail(m.email) === wanted) || null;
}

export function resolveAccess({ sheetAccess, sheetOwnedByMe, members, email }: AccessInput): Access {
  const member = memberForEmail(members, email);
  const rolesConfigured = members.some(m => normalizeEmail(m.email) !== '');

  let role: MemberRole;
  if (sheetOwnedByMe) role = 'owner';
  else if (member) role = member.role || 'editor';
  else if (!rolesConfigured) role = 'owner';
  else role = 'viewer';

  const readOnly = sheetAccess === 'view' || role === 'viewer';
  const isOwner = role === 'owner' && !readOnly;
  const shell: AppShell = role !== 'viewer' ? 'full' : member ? 'partner' : 'unlinked';

  const can = (action: AccessAction): boolean => {
    if (readOnly) return false;
    if (isOwner) return true;
    return action === 'write';
  };

  return {
    sheetAccess,
    readOnly,
    member,
    role,
    isOwner,
    rolesConfigured,
    shell,
    can,
    canDeleteEntry: (payerIds) => {
      if (readOnly) return false;
      if (isOwner) return true;
      return !!member && payerIds.some(id => id === member.id);
    },
    reason: (action) => (sheetAccess === 'view' ? REASONS.write : REASONS[action]),
  };
}

/** Everything allowed: the default outside the app shell (tests, isolated renders). */
export const FULL_ACCESS: Access = resolveAccess({ sheetAccess: 'unknown', sheetOwnedByMe: true, members: [], email: null });

export const ROLE_LABELS: Record<MemberRole, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

/** Fields or seasons: did the ownership split change between two versions? */
export function sharesChanged(
  before: { memberId: string; percentage: number }[] | undefined,
  after: { memberId: string; percentage: number }[] | undefined
): boolean {
  const norm = (shares?: { memberId: string; percentage: number }[]) =>
    JSON.stringify((shares || []).map(s => [s.memberId, Number(s.percentage)]).sort());
  return norm(before) !== norm(after);
}
