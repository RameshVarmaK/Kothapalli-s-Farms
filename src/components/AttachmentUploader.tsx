import React, { useRef, useState } from 'react';
import { Upload, X, Loader, CloudOff } from 'lucide-react';
import { Attachment } from '../types';
import { createAttachment, formatFileSize, isImageAttachment, validateAttachments } from '../utils/attachments';
import { logError } from '../utils/errorLogging';
import { useLanguage } from '../hooks/useLanguage';
import { useLocalReceiptSrc } from '../hooks/useLocalReceiptSrc';
import { stashReceiptData } from '../utils/receiptStore';
import { ConnectReceiptsFolder } from './ConnectReceiptsFolder';

interface AttachmentUploaderProps {
  attachments: Attachment[] | undefined;
  onAttachmentsChange: (attachments: Attachment[]) => void;
  maxAttachments?: number;
  /** For connecting the shared receipts folder when this account needs to. */
  accessToken?: string | null;
}

function ReceiptThumb({ attachment }: { attachment: Attachment }) {
  const src = useLocalReceiptSrc(attachment);
  return src ? (
    <img src={src} alt={attachment.fileName} className="w-10 h-10 object-cover rounded" />
  ) : (
    <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-lg">
      {isImageAttachment(attachment) ? '🖼️' : '📄'}
    </div>
  );
}

/**
 * Picks receipt photos / PDFs for the expense form. New files are compressed
 * and held as pending (bytes in the device's receipt store); they go to Google Drive after the expense is saved
 * (see useReceiptUploads), so saving never waits on the network.
 */
export function AttachmentUploader({
  attachments = [],
  onAttachmentsChange,
  maxAttachments = 5,
  accessToken = null
}: AttachmentUploaderProps) {
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    setIsLoading(true);

    try {
      const newAttachments: Attachment[] = [];

      for (let i = 0; i < files.length; i++) {
        if (attachments.length + newAttachments.length >= maxAttachments) {
          setError(t('Maximum receipts reached'));
          break;
        }

        try {
          const att = await createAttachment(files[i]);
          // The file waits in the device's receipt store, not on the expense:
          // the saved database must stay small. Inline only without a store.
          if (att.data && await stashReceiptData(att.id, att.data)) {
            const { data: _data, ...meta } = att;
            newAttachments.push(meta);
          } else {
            newAttachments.push(att);
          }
        } catch (err) {
          logError('attachment_upload_failed', err, { fileName: files[i].name });
          setError(`${t('Could not add this file (5 MB at most):')} ${files[i].name}`);
        }
      }

      const updated = [...attachments, ...newAttachments];
      if (validateAttachments(updated)) {
        setError(t('Receipts are too large (20 MB in total at most).'));
        return;
      }

      onAttachmentsChange(updated);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setIsLoading(false);
    }
  };

  const handleRemove = (id: string) => {
    onAttachmentsChange(attachments.filter(att => att.id !== id));
  };

  const isFull = attachments.length >= maxAttachments;

  return (
    <div className="space-y-3">
      <ConnectReceiptsFolder accessToken={accessToken} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading || isFull}
        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed transition-all ${
          isFull
            ? 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
            : 'border-emerald-300 hover:border-emerald-400 hover:bg-emerald-50 text-emerald-700'
        }`}
      >
        {isLoading ? (
          <>
            <Loader size={18} className="animate-spin" />
            <span className="text-sm font-semibold">{t('Preparing...')}</span>
          </>
        ) : (
          <>
            <Upload size={18} />
            <span className="text-sm font-semibold">
              {isFull ? t('Maximum receipts reached') : t('Add receipt photo or PDF')}
            </span>
          </>
        )}
      </button>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        onChange={handleFileSelect}
        disabled={isLoading || isFull}
        className="hidden"
      />

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            {t('Receipts')} ({attachments.length}/{maxAttachments})
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attachments.map(attachment => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <ReceiptThumb attachment={attachment} />

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">{attachment.fileName}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-1">
                      {formatFileSize(attachment.size)}
                      {!attachment.driveFileId && (
                        <span className="inline-flex items-center gap-0.5 text-amber-700">
                          • <CloudOff size={11} /> {t('Not uploaded yet')}
                        </span>
                      )}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemove(attachment.id)}
                  className="p-1 hover:bg-red-100 rounded transition-colors ml-2 shrink-0"
                  title={t('Remove receipt')}
                  aria-label={t('Remove receipt')}
                >
                  <X size={16} className="text-red-600" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
