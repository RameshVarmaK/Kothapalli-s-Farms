/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The ledger's shared "FarmLedger Receipts" folder.
 *
 * One folder per ledger, shared with the same people as the ledger sheet;
 * every partner uploads into it and files inherit its sharing.
 *
 * Its id is kept in the spreadsheet itself as developer metadata
 * (key FOLDER_METADATA_KEY, DOCUMENT visibility). Every partner can read it
 * under the spreadsheets scope they already hold, it is invisible in the
 * sheet so nobody edits or deletes it by accident, and it stays out of the
 * tab push/pull and the sync fingerprint entirely — a Config tab would have
 * had to be threaded through all three.
 *
 * The first partner to upload when the ledger has no folder creates it,
 * records it, and copies the sheet's users and groups onto it (sheet
 * editors → folder writers so they can upload, everyone else → readers).
 * Under drive.file a partner's app can't use a folder someone else created
 * until they pick it once in Google Picker ("Connect the shared receipts
 * folder"); until then their receipts wait on the device.
 */

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
export const RECEIPTS_FOLDER_NAME = 'FarmLedger Receipts';
export const FOLDER_METADATA_KEY = 'farmledger.receiptsFolderId';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** A Drive or Sheets call that came back with an HTTP error. */
export class DriveRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveRequestError';
    this.status = status;
  }
}

/** The ledger has a receipts folder, but this account's app can't use it
 * yet: the partner has to connect it once through Picker. */
export class FolderNotConnectedError extends Error {
  readonly folderId: string;
  constructor(folderId: string) {
    super('The shared receipts folder is not connected on this account yet.');
    this.name = 'FolderNotConnectedError';
    this.folderId = folderId;
  }
}

export async function driveFailure(res: Response, what: string): Promise<DriveRequestError> {
  let detail = '';
  try { detail = await res.text(); } catch { /* body unreadable */ }
  return new DriveRequestError(`${what} failed: ${res.status} ${detail}`.trim(), res.status);
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const jsonAuth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

// --- Status shared with the UI (connect prompt) -----------------------------

export type ReceiptsFolderState =
  | { state: 'unknown' }
  | { state: 'ready'; folderId: string | null }
  | { state: 'needs-connect'; folderId: string };

let status: ReceiptsFolderState = { state: 'unknown' };
const listeners = new Set<(s: ReceiptsFolderState) => void>();

export function getReceiptsFolderStatus(): ReceiptsFolderState {
  return status;
}

export function onReceiptsFolderStatus(listener: (s: ReceiptsFolderState) => void): () => void {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

function setStatus(next: ReceiptsFolderState): void {
  status = next;
  listeners.forEach(l => l(next));
}

// One resolved folder per token + ledger, not one lookup per file.
let resolved: { key: string; folderId: string } | null = null;

/** Test hook: forget the resolved folder and status. */
export function resetReceiptsFolderState(): void {
  resolved = null;
  status = { state: 'unknown' };
}

// --- The folder id in the ledger --------------------------------------------

/** The ledger's receipts folder id, or null when it has none yet. If two
 * partners raced to create one, the earliest record wins. */
export async function readLedgerFolderId(accessToken: string, spreadsheetId: string): Promise<string | null> {
  const res = await fetch(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}?fields=developerMetadata(metadataId,metadataKey,metadataValue)`,
    { headers: auth(accessToken) }
  );
  if (!res.ok) throw await driveFailure(res, 'Reading the receipts folder from the ledger');
  const entries: { metadataId?: number; metadataKey?: string; metadataValue?: string }[] =
    (await res.json())?.developerMetadata || [];
  const match = entries
    .filter(m => m.metadataKey === FOLDER_METADATA_KEY && m.metadataValue)
    .sort((a, b) => (a.metadataId ?? 0) - (b.metadataId ?? 0))[0];
  return match?.metadataValue || null;
}

export async function writeLedgerFolderId(accessToken: string, spreadsheetId: string, folderId: string): Promise<void> {
  const res = await fetch(`${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: 'POST',
    headers: jsonAuth(accessToken),
    body: JSON.stringify({
      requests: [{
        createDeveloperMetadata: {
          developerMetadata: {
            metadataKey: FOLDER_METADATA_KEY,
            metadataValue: folderId,
            location: { spreadsheet: true },
            visibility: 'DOCUMENT',
          },
        },
      }],
    }),
  });
  if (!res.ok) throw await driveFailure(res, 'Recording the receipts folder in the ledger');
}

// --- Folder and sharing ------------------------------------------------------

export async function createReceiptsFolder(accessToken: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: 'POST',
    headers: jsonAuth(accessToken),
    body: JSON.stringify({ name: RECEIPTS_FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  if (!res.ok) throw await driveFailure(res, 'Receipts folder creation');
  const id = (await res.json())?.id;
  if (!id) throw new DriveRequestError('Receipts folder creation returned no id', 0);
  return id;
}

type Permission = { emailAddress?: string; role?: string; type?: string };

async function listPermissions(accessToken: string, fileId: string): Promise<Permission[] | null> {
  try {
    const res = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?fields=permissions(emailAddress,role,type)`,
      { headers: auth(accessToken) }
    );
    if (!res.ok) return null;
    return (await res.json())?.permissions || [];
  } catch {
    return null;
  }
}

/** Sheet editors may upload receipts; everyone else on the sheet may look. */
export function folderRoleFor(sheetRole: string | undefined): 'writer' | 'reader' {
  return sheetRole === 'owner' || sheetRole === 'writer' || sheetRole === 'organizer' || sheetRole === 'fileOrganizer'
    ? 'writer'
    : 'reader';
}

/**
 * Gives the sheet's users and groups access to the folder (no email) when
 * the folder doesn't list them yet. Never removes anyone or changes an
 * existing role; 'anyone' and 'domain' entries are skipped, so the folder is
 * never opened beyond named people. Returns the emails added, or null when
 * the sheet's permissions can't be read.
 */
export async function shareFolderWithSheet(
  accessToken: string,
  folderId: string,
  spreadsheetId: string
): Promise<string[] | null> {
  const sheetPeople = await listPermissions(accessToken, spreadsheetId);
  if (!sheetPeople) return null;
  const onFolder = new Set(
    ((await listPermissions(accessToken, folderId)) || [])
      .map(p => (p.emailAddress || '').toLowerCase())
      .filter(Boolean)
  );
  const missing = sheetPeople.filter(p =>
    (p.type === 'user' || p.type === 'group')
    && typeof p.emailAddress === 'string' && p.emailAddress !== ''
    && !onFolder.has(p.emailAddress.toLowerCase())
  );
  const added: string[] = [];
  for (const p of missing) {
    try {
      const res = await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions?sendNotificationEmail=false`,
        {
          method: 'POST',
          headers: jsonAuth(accessToken),
          body: JSON.stringify({ role: folderRoleFor(p.role), type: p.type, emailAddress: p.emailAddress }),
        }
      );
      if (res.ok) added.push(p.emailAddress!);
    } catch {
      // One grant failing must not stop the others.
    }
  }
  return added;
}

/** Whether this account's app can use the folder, and whether it owns it. */
export async function checkFolderAccess(
  accessToken: string,
  folderId: string
): Promise<{ ok: true; ownedByMe: boolean } | { ok: false; status: number }> {
  const res = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,ownedByMe,trashed`,
    { headers: auth(accessToken) }
  );
  if (!res.ok) return { ok: false, status: res.status };
  const json = await res.json();
  return { ok: true, ownedByMe: !!json?.ownedByMe };
}

/**
 * The folder to upload into for this ledger: the recorded one if this app
 * can use it, a new one (recorded and shared) if the ledger has none.
 * Throws FolderNotConnectedError when the partner must connect it first.
 */
export async function resolveLedgerFolder(accessToken: string, spreadsheetId: string): Promise<string> {
  const key = `${accessToken}|${spreadsheetId}`;
  if (resolved?.key === key) return resolved.folderId;

  let folderId = await readLedgerFolderId(accessToken, spreadsheetId);
  if (!folderId) {
    folderId = await createReceiptsFolder(accessToken);
    await writeLedgerFolderId(accessToken, spreadsheetId, folderId);
    // A partner may have recorded one in the meantime; the earliest wins.
    const winner = await readLedgerFolderId(accessToken, spreadsheetId);
    if (winner && winner !== folderId) {
      await trashDriveFiles(accessToken, [folderId]); // ours lost; it's empty
      folderId = winner;
    } else {
      await shareFolderWithSheet(accessToken, folderId, spreadsheetId);
    }
  }

  const access = await checkFolderAccess(accessToken, folderId);
  if (!access.ok) {
    if (access.status === 403 || access.status === 404) {
      setStatus({ state: 'needs-connect', folderId });
      throw new FolderNotConnectedError(folderId);
    }
    throw new DriveRequestError(`Receipts folder check failed: ${access.status}`, access.status);
  }
  resolved = { key, folderId };
  setStatus({ state: 'ready', folderId });
  return folderId;
}

/**
 * Once per sign-in: learn whether this partner must connect the folder, and
 * if they own it, add people newly on the sheet to it. Failures are quiet;
 * the next upload tries again.
 */
export async function checkReceiptsFolderOnSignIn(accessToken: string, spreadsheetId: string): Promise<void> {
  try {
    const folderId = await readLedgerFolderId(accessToken, spreadsheetId);
    if (!folderId) {
      setStatus({ state: 'ready', folderId: null });
      return;
    }
    const access = await checkFolderAccess(accessToken, folderId);
    if (!access.ok) {
      if (access.status === 403 || access.status === 404) setStatus({ state: 'needs-connect', folderId });
      return;
    }
    resolved = { key: `${accessToken}|${spreadsheetId}`, folderId };
    setStatus({ state: 'ready', folderId });
    if (access.ownedByMe) await shareFolderWithSheet(accessToken, folderId, spreadsheetId);
  } catch (err) {
    console.warn('Could not check the shared receipts folder:', err);
  }
}

export type ConnectResult = 'connected' | 'cancelled' | 'wrong-folder' | 'still-no-access';

/**
 * The partner picks the ledger's folder in Google Picker, which grants this
 * app access to it under drive.file. `pick` opens the picker and resolves
 * with the chosen id (or null).
 */
export async function connectReceiptsFolder(
  accessToken: string,
  pick: (accessToken: string, folderId: string) => Promise<string | null>
): Promise<ConnectResult> {
  if (status.state !== 'needs-connect') return 'connected';
  const folderId = status.folderId;
  const picked = await pick(accessToken, folderId);
  if (!picked) return 'cancelled';
  if (picked !== folderId) return 'wrong-folder';
  const access = await checkFolderAccess(accessToken, folderId);
  if (!access.ok) return 'still-no-access';
  resolved = null;
  setStatus({ state: 'ready', folderId });
  return 'connected';
}

/** Moves receipt files to the Drive trash, in the background. A file this
 * account can't trash (a partner's) is skipped with a warning. */
export async function trashDriveFiles(accessToken: string, fileIds: string[]): Promise<void> {
  for (const id of fileIds) {
    try {
      const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?fields=id`, {
        method: 'PATCH',
        headers: jsonAuth(accessToken),
        body: JSON.stringify({ trashed: true }),
      });
      if (!res.ok) console.warn(`Could not move receipt ${id} to the Drive trash: ${res.status}`);
    } catch (err) {
      console.warn(`Could not move receipt ${id} to the Drive trash:`, err);
    }
  }
}
