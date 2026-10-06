/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HardDrive } from 'lucide-react';
import { onLocalSaveStatus } from '../utils/database';
import { useLanguage } from '../hooks/useLanguage';

/**
 * Shown for as long as the database can't be saved on this device (storage
 * full or blocked). Until then the latest entries live only in this open
 * page, so the user has to know rather than find them gone after a reload.
 * It clears itself on the next save that succeeds.
 */
export const LocalSaveBanner: React.FC = () => {
  const { t } = useLanguage();
  const [failed, setFailed] = useState(false);

  useEffect(() => onLocalSaveStatus(setFailed), []);

  if (!failed) return null;
  return (
    <div role="alert" className="bg-red-50 border-b border-red-200 px-4 md:px-6 py-3 text-red-900 print:hidden">
      <div className="flex items-start gap-3 max-w-5xl mx-auto">
        <HardDrive size={18} className="text-red-600 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold">{t('Entries on this device could not be saved — storage is full')}</p>
          <p className="text-xs mt-0.5 leading-relaxed">
            {t("Don't close or reload this page. Stay online so your entries reach the Google Sheet, and free up space on this device (browser site data).")}
          </p>
        </div>
      </div>
    </div>
  );
};
