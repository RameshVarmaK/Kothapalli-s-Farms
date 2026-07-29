import React, { useRef, useState } from 'react';
import { Upload, X, Loader } from 'lucide-react';
import { Attachment } from '../types';
import { createAttachment, formatFileSize, validateAttachments } from '../utils/attachments';
import { logError } from '../utils/errorLogging';

interface AttachmentUploaderProps {
  attachments: Attachment[] | undefined;
  onAttachmentsChange: (attachments: Attachment[]) => void;
  maxAttachments?: number;
}

export function AttachmentUploader({
  attachments = [],
  onAttachmentsChange,
  maxAttachments = 5
}: AttachmentUploaderProps) {
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
          setError(`Maximum ${maxAttachments} attachments allowed`);
          break;
        }

        try {
          const attachment = await createAttachment(files[i]);
          newAttachments.push(attachment);
        } catch (err) {
          logError('attachment_upload_failed', err, { fileName: files[i].name });
          setError(`Failed to upload ${files[i].name}`);
        }
      }

      const updated = [...attachments, ...newAttachments];

      // Validate total
      const validationError = validateAttachments(updated);
      if (validationError) {
        setError(validationError);
        return;
      }

      onAttachmentsChange(updated);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemove = (id: string) => {
    onAttachmentsChange(attachments.filter(att => att.id !== id));
  };

  const isFull = attachments.length >= maxAttachments;

  return (
    <div className="space-y-3">
      {/* Upload Button */}
      <button
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
            <span className="text-sm font-semibold">Processing...</span>
          </>
        ) : (
          <>
            <Upload size={18} />
            <span className="text-sm font-semibold">
              {isFull ? 'Maximum attachments reached' : 'Add Photos or Documents'}
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

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Attachment List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
            Attachments ({attachments.length}/{maxAttachments})
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {attachment.type === 'image' ? (
                    <img
                      src={`data:image/jpeg;base64,${attachment.base64Data}`}
                      alt={attachment.fileName}
                      className="w-10 h-10 object-cover rounded"
                    />
                  ) : (
                    <div className="w-10 h-10 bg-slate-200 rounded flex items-center justify-center text-lg">
                      📄
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 truncate">
                      {attachment.fileName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatFileSize(attachment.size)}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => handleRemove(attachment.id)}
                  className="p-1 hover:bg-red-100 rounded transition-colors ml-2 shrink-0"
                  title="Remove attachment"
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
