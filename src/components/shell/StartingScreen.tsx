/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useLanguage } from '../../hooks/useLanguage';

/** Shown for the moment before the local database has loaded. */
export function StartingScreen() {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50 text-xs font-semibold text-gray-400">
      {t("Starting Kothapalli's Farms Engine...")}
    </div>
  );
}
