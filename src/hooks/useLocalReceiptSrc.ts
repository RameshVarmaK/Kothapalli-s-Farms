/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { Attachment } from '../types';
import { isImageAttachment } from '../utils/attachments';
import { loadReceiptData } from '../utils/receiptStore';

/**
 * A data: URL for a pending image receipt this device holds (inline, or in
 * the receipt store); null otherwise.
 */
export function useLocalReceiptSrc(att: Attachment): string | null {
  const inline = isImageAttachment(att) && att.data ? `data:${att.mimeType};base64,${att.data}` : null;
  const [stored, setStored] = useState<string | null>(null);

  useEffect(() => {
    if (inline || !att.pending || !isImageAttachment(att)) return;
    let cancelled = false;
    loadReceiptData(att.id).then(data => {
      if (!cancelled && data) setStored(`data:${att.mimeType};base64,${data}`);
    });
    return () => { cancelled = true; };
  }, [att.id, att.pending, att.mimeType, inline]);

  return inline || stored;
}
