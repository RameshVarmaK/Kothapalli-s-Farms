import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Loader, CloudOff } from 'lucide-react';
import { Attachment } from '../types';
import { formatFileSize, isImageAttachment } from '../utils/attachments';
import { fetchReceiptObjectUrl } from '../utils/driveReceipts';
import { useLanguage } from '../hooks/useLanguage';

interface AttachmentGalleryProps {
  attachments: Attachment[];
  accessToken?: string | null;
  title?: string;
  onClose: () => void;
}

/** One receipt: the picture itself where it can be shown, a Drive link otherwise. */
function ReceiptItem({ attachment, accessToken }: { attachment: Attachment; accessToken?: string | null }) {
  const { t } = useLanguage();
  const isImage = isImageAttachment(attachment);
  const [src, setSrc] = useState<string | null>(
    isImage && attachment.data ? `data:${attachment.mimeType};base64,${attachment.data}` : null
  );
  const [state, setState] = useState<'idle' | 'loading' | 'failed'>('idle');

  useEffect(() => {
    if (!isImage || attachment.data || !attachment.driveFileId || !accessToken) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    setState('loading');
    fetchReceiptObjectUrl(accessToken, attachment.driveFileId)
      .then(url => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
        setState('idle');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.driveFileId, attachment.data, accessToken, isImage]);

  const driveLink = attachment.webViewLink
    || (attachment.driveFileId ? `https://drive.google.com/file/d/${attachment.driveFileId}/view` : null);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="px-3 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-800 truncate">{attachment.fileName}</p>
          <p className="text-[10px] text-slate-500">
            {formatFileSize(attachment.size)} • {new Date(attachment.uploadedAt).toLocaleDateString()}
          </p>
        </div>
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800"
          >
            <ExternalLink size={12} /> {t('Open in Drive')}
          </a>
        )}
      </div>

      <div className="p-3">
        {src ? (
          <img src={src} alt={attachment.fileName} className="w-full rounded-lg" />
        ) : !attachment.driveFileId ? (
          <p className="py-6 text-center text-xs font-semibold text-amber-700 flex items-center justify-center gap-1.5">
            <CloudOff size={14} /> {t('Not uploaded yet — it will be sent to Drive from the device that added it.')}
          </p>
        ) : state === 'loading' ? (
          <p className="py-6 text-center text-xs text-slate-500 flex items-center justify-center gap-1.5">
            <Loader size={14} className="animate-spin" /> {t('Loading receipt...')}
          </p>
        ) : !isImage ? (
          <p className="py-6 text-center text-xs text-slate-600">
            📄 {t('Open it in Google Drive to view.')}
          </p>
        ) : (
          <p className="py-6 text-center text-xs text-slate-600">
            {t("Can't show this receipt here. Open it in Google Drive — if you don't have access yet, ask there.")}
          </p>
        )}
      </div>
    </div>
  );
}

/** Receipts of one expense, in a dialog. */
export function AttachmentGallery({ attachments, accessToken, title, onClose }: AttachmentGalleryProps) {
  const { t } = useLanguage();
  return (
    <div
      className="fixed inset-0 bg-slate-900/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
          <h3 className="font-semibold text-slate-900 truncate">
            📎 {title || t('Receipts')} ({attachments.length})
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            title={t('Close')}
            aria-label={t('Close')}
          >
            <X size={20} className="text-slate-600" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          {attachments.map(att => (
            <ReceiptItem key={att.id} attachment={att} accessToken={accessToken} />
          ))}
        </div>
      </div>
    </div>
  );
}
