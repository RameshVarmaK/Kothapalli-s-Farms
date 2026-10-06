/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Expense receipts in Google Drive.
 *
 * Files go to a "FarmLedger Receipts" folder in the uploader's own Drive. The
 * app signs in with the drive.file scope, so it can only see folders and files
 * it created itself; that is enough to find its own folder again by name.
 *
 * Partners sign in with their own Google accounts. After an upload, the file
 * is shared (reader, no email) with every user and group that has access to
 * the linked ledger spreadsheet. If the ledger's permissions can't be read,
 * the file simply stays private to the uploader and partners get an "Open in
 * Drive" link from which they can request access. Files are never made public.
 */

import { Attachment, Expense } from '../types';
import { expenseAttachments, hasLegacyReceipt } from './attachments';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink';
export const RECEIPTS_FOLDER_NAME = 'FarmLedger Receipts';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

/** A Drive call that came back with an HTTP error. */
export class DriveRequestError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'DriveRequestError';
    this.status = status;
  }
}

async function driveFailure(res: Response, what: string): Promise<DriveRequestError> {
  let detail = '';
  try { detail = await res.text(); } catch { /* body unreadable */ }
  return new DriveRequestError(`${what} failed: ${res.status} ${detail}`.trim(), res.status);
}

// One folder lookup per signed-in token, not one per file.
let folderCache: { token: string; id: string } | null = null;

/** Test hook: forget the cached folder id. */
export function resetReceiptFolderCache(): void {
  folderCache = null;
}

/** Finds the app's receipts folder in the user's Drive, creating it once. */
export async function findOrCreateReceiptsFolder(accessToken: string): Promise<string> {
  if (folderCache && folderCache.token === accessToken) return folderCache.id;

  const q = `name = '${RECEIPTS_FOLDER_NAME}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
  const searchRes = await fetch(
    `${DRIVE_API}/files?q=${encodeURIComponent(q)}&spaces=drive&fields=files(id)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!searchRes.ok) throw await driveFailure(searchRes, 'Receipts folder search');
  const found = await searchRes.json();
  let id: string | undefined = found?.files?.[0]?.id;

  if (!id) {
    const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: RECEIPTS_FOLDER_NAME, mimeType: FOLDER_MIME }),
    });
    if (!createRes.ok) throw await driveFailure(createRes, 'Receipts folder creation');
    id = (await createRes.json())?.id;
    if (!id) throw new DriveRequestError('Receipts folder creation returned no id', 0);
  }

  folderCache = { token: accessToken, id };
  return id;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Uploads one file into `folderId` with a multipart request. */
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  file: { fileName: string; mimeType: string; data: string }
): Promise<{ id: string; webViewLink?: string }> {
  const boundary = `farmledger_${Math.random().toString(36).slice(2)}`;
  const metadata = { name: file.fileName, mimeType: file.mimeType, parents: [folderId] };
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    `--${boundary}\r\nContent-Type: ${file.mimeType}\r\n\r\n`,
    base64ToBytes(file.data),
    `\r\n--${boundary}--`,
  ]);

  const res = await fetch(DRIVE_UPLOAD, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) throw await driveFailure(res, 'Receipt upload');
  const json = await res.json();
  if (!json?.id) throw new DriveRequestError('Receipt upload returned no file id', 0);
  return { id: json.id, webViewLink: json.webViewLink };
}

/**
 * Gives every user and group on the ledger spreadsheet read access to
 * `fileId`. Returns false when the spreadsheet's permissions can't be listed
 * (the file then stays private to the uploader); a single grant that fails is
 * skipped rather than failing the rest. 'anyone' and 'domain' entries are
 * ignored on purpose: receipts are never opened up beyond named people.
 */
export async function shareWithSheetPartners(
  accessToken: string,
  fileId: string,
  spreadsheetId: string
): Promise<boolean> {
  let permissions: { emailAddress?: string; role?: string; type?: string }[];
  try {
    const res = await fetch(
      `${DRIVE_API}/files/${encodeURIComponent(spreadsheetId)}/permissions?fields=permissions(emailAddress,role,type)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return false;
    permissions = (await res.json())?.permissions || [];
  } catch {
    return false;
  }

  const people = permissions.filter(
    p => (p.type === 'user' || p.type === 'group') && typeof p.emailAddress === 'string' && p.emailAddress !== ''
  );
  await Promise.all(people.map(async p => {
    try {
      await fetch(
        `${DRIVE_API}/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: p.type, emailAddress: p.emailAddress }),
        }
      );
    } catch {
      // One partner's grant failing (e.g. the uploader themself) must not
      // stop the others.
    }
  }));
  return true;
}

/**
 * Moves one pending attachment into Drive and returns its metadata-only form.
 * Throws when the upload itself fails; the caller keeps it pending.
 */
export async function uploadPendingAttachment(
  accessToken: string,
  spreadsheetId: string | null | undefined,
  att: Attachment
): Promise<Attachment> {
  if (!att.data) throw new DriveRequestError('Attachment has no local data to upload', 0);
  const folderId = await findOrCreateReceiptsFolder(accessToken);
  const uploaded = await uploadFileToDrive(accessToken, folderId, {
    fileName: att.fileName,
    mimeType: att.mimeType,
    data: att.data,
  });
  if (spreadsheetId) {
    await shareWithSheetPartners(accessToken, uploaded.id, spreadsheetId);
  }
  const { data: _data, pending: _pending, base64Data: _b64, type: _type, ...meta } = att;
  return {
    ...meta,
    driveFileId: uploaded.id,
    webViewLink: uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`,
  };
}

/** Pending attachments (with local data) across all expenses. */
export function collectPendingReceipts(expenses: Expense[] | undefined): { expenseId: string; attachment: Attachment }[] {
  const out: { expenseId: string; attachment: Attachment }[] = [];
  (expenses || []).forEach(exp => {
    if (!exp) return;
    expenseAttachments(exp).forEach(att => {
      if (att.pending && att.data) out.push({ expenseId: exp.id, attachment: att });
    });
  });
  return out;
}

/**
 * Rewrites old-shape receipts (receiptPhoto, { type, base64Data }) into
 * pending attachments. Returns the same array when nothing needed changing.
 */
export function migrateLegacyReceipts(expenses: Expense[]): Expense[] {
  if (!expenses.some(hasLegacyReceipt)) return expenses;
  return expenses.map(exp => {
    if (!hasLegacyReceipt(exp)) return exp;
    const { receiptPhoto: _legacy, ...rest } = exp;
    const attachments = expenseAttachments(exp);
    return { ...rest, attachments: attachments.length > 0 ? attachments : undefined };
  });
}

/**
 * Applies finished uploads (keyed by attachment id) to the latest expenses.
 * An attachment removed in the meantime is simply not found.
 */
export function applyUploadedReceipts(expenses: Expense[], uploaded: Map<string, Attachment>): Expense[] {
  if (uploaded.size === 0) return expenses;
  return expenses.map(exp => {
    if (!Array.isArray(exp.attachments) || !exp.attachments.some(a => uploaded.has(a.id))) return exp;
    return {
      ...exp,
      attachments: exp.attachments.map(a => {
        const done = uploaded.get(a.id);
        return done && !a.driveFileId ? done : a;
      }),
    };
  });
}

/**
 * Uploads every pending receipt it can. Uploads that fail (offline, quota)
 * are left out of the result and stay pending for the next attempt.
 */
export async function uploadPendingReceipts(
  accessToken: string,
  spreadsheetId: string | null | undefined,
  work: { expenseId: string; attachment: Attachment }[]
): Promise<{ uploaded: Map<string, Attachment>; failed: number }> {
  const uploaded = new Map<string, Attachment>();
  let failed = 0;
  for (const { attachment } of work) {
    try {
      uploaded.set(attachment.id, await uploadPendingAttachment(accessToken, spreadsheetId, attachment));
    } catch (err) {
      failed++;
      console.warn(`Receipt ${attachment.fileName} not uploaded yet:`, err);
    }
  }
  return { uploaded, failed };
}

/**
 * Loads a Drive file's content as a blob: URL for display. The caller must
 * URL.revokeObjectURL it when done. Throws DriveRequestError (403/404) when
 * this account can't read the file — e.g. a partner the file wasn't shared
 * with, or one whose drive.file sign-in has not opened it.
 */
export async function fetchReceiptObjectUrl(accessToken: string, fileId: string): Promise<string> {
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw await driveFailure(res, 'Receipt download');
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}
