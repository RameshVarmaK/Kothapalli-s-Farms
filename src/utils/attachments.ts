import { Attachment } from '../types';
import { logError } from './errorLogging';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 5;
const COMPRESSION_QUALITY = 0.7; // 70% quality for jpg

/**
 * Compress image to reduce file size while maintaining quality
 * Uses canvas to re-encode image at lower quality
 */
export async function compressImage(
  file: File,
  quality: number = COMPRESSION_QUALITY
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

        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;

        // Draw image on canvas
        ctx.drawImage(img, 0, 0);

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

    return {
      id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: file.type.startsWith('image/') ? 'image' : 'document',
      fileName: file.name,
      size: processedFile.size,
      uploadedAt: new Date().toISOString(),
      base64Data: base64
    };
  } catch (err) {
    logError('attachment_creation_failed', err, { fileName: file.name, size: file.size });
    throw err;
  }
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
