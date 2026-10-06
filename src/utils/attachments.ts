import { Attachment } from '../types';
import { logError } from './errorLogging';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 5;
const COMPRESSION_QUALITY = 0.7; // 70% quality for jpg
const MAX_IMAGE_DIMENSION = 1600; // px, long side

/**
 * Compress image to reduce file size while maintaining quality
 * Uses canvas to re-encode image at lower quality
 */
export async function compressImage(
  file: File,
  quality: number = COMPRESSION_QUALITY,
  maxDimension: number = MAX_IMAGE_DIMENSION
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (event) => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }

        // Scale down to at most maxDimension on the long side. A receipt
        // stays readable at that size, and a pending one (held on the
        // device until it reaches Drive) stays small enough for local storage.
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Convert to blob with compression
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Failed to compress image'));
            }
          },
          'image/jpeg',
          quality
        );
      };

      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = event.target?.result as string;
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert file to base64 string
 */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result as string;
      // Extract base64 part (after comma)
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Process and create attachment from file
 * Compresses images, validates size, converts to base64
 */
export async function createAttachment(file: File): Promise<Attachment> {
  try {
    let processedFile = file;

    // Compress images
    if (file.type.startsWith('image/')) {
      try {
        const compressed = await compressImage(file);
        processedFile = new File([compressed], file.name, { type: 'image/jpeg' });
      } catch (err) {
        logError('image_compression_failed', err, { fileName: file.name });
        // Use original if compression fails
      }
    }

    // Check size limit
    if (processedFile.size > MAX_IMAGE_SIZE) {
      throw new Error(
        `File too large: ${(processedFile.size / 1024 / 1024).toFixed(1)}MB (max 5MB)`
      );
    }

    // Convert to base64
    const base64 = await fileToBase64(processedFile);

    // Held locally as pending; useReceiptUploads moves it to Drive once the
    // expense is saved and the device is online.
    return {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      fileName: file.name,
      mimeType: processedFile.type || file.type || 'application/octet-stream',
      size: processedFile.size,
      uploadedAt: new Date().toISOString(),
      pending: true,
      data: base64
    };
  } catch (err) {
    logError('attachment_creation_failed', err, { fileName: file.name, size: file.size });
    throw err;
  }
}

/** True for attachments the app can show inline as a picture. */
export function isImageAttachment(att: Pick<Attachment, 'mimeType'>): boolean {
  return (att.mimeType || '').startsWith('image/');
}

function guessMimeType(fileName: string, legacyType?: 'image' | 'document'): string {
  if (legacyType === 'image') return 'image/jpeg';
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

/**
 * Brings an attachment from any version into the current shape. The
 * pre-Drive shape ({ type, base64Data }) becomes a pending attachment, so it
 * is uploaded like a fresh one.
 */
export function normalizeAttachment(raw: any): Attachment {
  const data: string | undefined = raw?.data || raw?.base64Data || undefined;
  const fileName = String(raw?.fileName || 'receipt');
  const att: Attachment = {
    id: String(raw?.id || `att_${Math.random().toString(36).slice(2, 9)}`),
    fileName,
    mimeType: raw?.mimeType || guessMimeType(fileName, raw?.type),
    size: Number(raw?.size) || 0,
    uploadedAt: raw?.uploadedAt || new Date().toISOString(),
  };
  if (raw?.driveFileId) {
    att.driveFileId = String(raw.driveFileId);
    if (raw.webViewLink) att.webViewLink = String(raw.webViewLink);
  } else {
    att.pending = true;
    if (data) att.data = data;
  }
  return att;
}

/**
 * Every attachment on an expense, in the current shape, including a legacy
 * base64 `receiptPhoto` as a pending attachment.
 */
export function expenseAttachments(exp: { id: string; attachments?: any; receiptPhoto?: string }): Attachment[] {
  const list: Attachment[] = Array.isArray(exp.attachments) ? exp.attachments.map(normalizeAttachment) : [];
  if (typeof exp.receiptPhoto === 'string' && exp.receiptPhoto.trim() !== '') {
    const raw = exp.receiptPhoto.trim();
    const match = /^data:([^;]+);base64,(.*)$/s.exec(raw);
    list.push({
      id: `att_receipt_${exp.id}`,
      fileName: 'receipt.jpg',
      mimeType: match ? match[1] : 'image/jpeg',
      size: Math.floor(((match ? match[2] : raw).length * 3) / 4),
      uploadedAt: new Date().toISOString(),
      pending: true,
      data: match ? match[2] : raw,
    });
  }
  return list;
}

/** How many receipts an expense carries (for the 📎 marker). */
export function receiptCount(exp: { attachments?: any; receiptPhoto?: string } | null | undefined): number {
  if (!exp) return 0;
  const attached = Array.isArray(exp.attachments) ? exp.attachments.length : 0;
  return attached + (typeof exp.receiptPhoto === 'string' && exp.receiptPhoto !== '' ? 1 : 0);
}

/** True when the expense holds an old-shape receipt (receiptPhoto, or an
 * attachment with `type`/`base64Data`) that should be rewritten. */
export function hasLegacyReceipt(exp: { attachments?: any; receiptPhoto?: string }): boolean {
  if (typeof exp.receiptPhoto === 'string' && exp.receiptPhoto !== '') return true;
  return Array.isArray(exp.attachments) && exp.attachments.some((a: any) => a && (a.base64Data !== undefined || a.type !== undefined || !a.mimeType));
}

/**
 * The attachments as written to the sheet: metadata only. File content (and
 * any legacy base64) is dropped, so a receipt can never blow the 50k-char
 * cell limit or leak into the shared sheet.
 */
export function attachmentsForSheet(list: any): Attachment[] | undefined {
  if (!Array.isArray(list) || list.length === 0) return undefined;
  return list.map(raw => {
    const { data: _data, base64Data: _b64, type: _type, ...meta } = normalizeAttachment(raw);
    return meta;
  });
}

/**
 * A pull hands back attachments without their local file content. Put the
 * content of attachments still waiting for upload back from this device's
 * copy, so a sync before the upload can't lose the receipt.
 */
export function keepPendingReceiptData<T extends { id: string; attachments?: Attachment[] }>(cloud: T[], local: T[] | undefined): T[] {
  if (!Array.isArray(cloud) || !Array.isArray(local)) return cloud;
  const localData = new Map<string, string>();
  local.forEach(exp => {
    (exp?.attachments || []).forEach((a: any) => {
      const data = a?.data || a?.base64Data;
      if (data) localData.set(`${exp.id}/${a.id}`, data);
    });
  });
  if (localData.size === 0) return cloud;
  return cloud.map(exp => {
    if (!Array.isArray(exp?.attachments)) return exp;
    let touched = false;
    const attachments = exp.attachments.map(a => {
      const data = !a.driveFileId && !a.data ? localData.get(`${exp.id}/${a.id}`) : undefined;
      if (!data) return a;
      touched = true;
      return { ...a, data };
    });
    return touched ? { ...exp, attachments } : exp;
  });
}

/**
 * Validate attachments before saving
 */
export function validateAttachments(attachments: Attachment[] | undefined): string | null {
  if (!attachments) return null;

  if (attachments.length > MAX_ATTACHMENTS) {
    return `Maximum ${MAX_ATTACHMENTS} attachments allowed`;
  }

  const totalSize = attachments.reduce((sum, att) => sum + att.size, 0);
  const maxTotalSize = 20 * 1024 * 1024; // 20MB total

  if (totalSize > maxTotalSize) {
    return `Total attachment size exceeds 20MB (current: ${(totalSize / 1024 / 1024).toFixed(1)}MB)`;
  }

  return null;
}

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
}

/**
 * Get MIME type icon emoji
 */
export function getMimeTypeIcon(mimeType: string): string {
  if (mimeType.startsWith('image/')) return '🖼️';
  if (mimeType.includes('pdf')) return '📄';
  if (mimeType.includes('word')) return '📝';
  return '📎';
}
