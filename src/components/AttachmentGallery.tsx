import React, { useState } from 'react';
import { X, Download } from 'lucide-react';
import { Attachment } from '../types';
import { formatFileSize } from '../utils/attachments';

interface AttachmentGalleryProps {
  attachments: Attachment[] | undefined;
}

export function AttachmentGallery({ attachments = [] }: AttachmentGalleryProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedAttachment = selectedId ? attachments.find(att => att.id === selectedId) : null;

  if (attachments.length === 0) return null;

  const handleDownload = (attachment: Attachment) => {
    const link = document.createElement('a');
    const mimeType = attachment.type === 'image' ? 'image/jpeg' : 'application/octet-stream';
    link.href = `data:${mimeType};base64,${attachment.base64Data}`;
    link.download = attachment.fileName;
    link.click();
  };

  return (
    <div className="space-y-3">
      {/* Gallery Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {attachments.map((attachment) => (
          <button
            key={attachment.id}
            onClick={() => setSelectedId(attachment.id)}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:border-emerald-400 ${
              selectedId === attachment.id
                ? 'border-emerald-500 ring-2 ring-emerald-300'
                : 'border-slate-200'
            }`}
          >
            {attachment.type === 'image' ? (
              <img
                src={`data:image/jpeg;base64,${attachment.base64Data}`}
                alt={attachment.fileName}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center">
                <div className="text-3xl mb-1">📄</div>
                <p className="text-xs font-medium text-slate-600 text-center px-1 truncate">
                  {attachment.fileName.split('.')[0]}
                </p>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Preview Modal */}
      {selectedAttachment && (
        <div className="fixed inset-0 bg-slate-900/75 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 p-4 flex items-center justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 truncate">
                  {selectedAttachment.fileName}
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {formatFileSize(selectedAttachment.size)} •{' '}
                  {new Date(selectedAttachment.uploadedAt).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => handleDownload(selectedAttachment)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Download"
                >
                  <Download size={20} className="text-slate-600" />
                </button>

                <button
                  onClick={() => setSelectedId(null)}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                  title="Close"
                >
                  <X size={20} className="text-slate-600" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-4">
              {selectedAttachment.type === 'image' ? (
                <img
                  src={`data:image/jpeg;base64,${selectedAttachment.base64Data}`}
                  alt={selectedAttachment.fileName}
                  className="w-full rounded-lg"
                />
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="text-6xl mb-4">📄</div>
                  <p className="text-slate-600 font-medium mb-4">
                    Document: {selectedAttachment.fileName}
                  </p>
                  <button
                    onClick={() => handleDownload(selectedAttachment)}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                  >
                    Download Document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
