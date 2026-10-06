/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getFirebaseConfig } from './auth';

/**
 * Google Picker — the one way to reach a spreadsheet someone else shared
 * while holding only the `drive.file` scope.
 *
 * `drive.file` shows the app files it created and nothing else, which is why
 * a partner's shared ledger can be read by id but never found by searching
 * Drive. Picking a file through Picker (with `setAppId` set to the Cloud
 * project number) makes Google record a per-file grant for this app against
 * that user — server-side and permanent. From then on the ordinary
 * `files.list` search finds it, on that device and every future one, so the
 * partner pastes a link once and never again.
 *
 * Everything here degrades quietly: if the project isn't configured for
 * Picker, or the script can't load, callers fall back to pasting a link.
 */

declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

const PICKER_SCRIPT_SRC = 'https://apis.google.com/js/api.js';

export interface PickerConfig {
  /** Browser API key for the Cloud project. */
  developerKey: string;
  /** The Cloud project *number* — what Picker calls the app id. */
  appId: string;
}

/**
 * Picker's two settings both already exist in the Firebase config: the web
 * API key, and `messagingSenderId`, which is the Cloud project number this
 * Firebase project belongs to. Deriving them means no extra setup, and a
 * custom Firebase config carries the Picker over with it.
 */
export function getPickerConfig(): PickerConfig | null {
  try {
    const config: any = getFirebaseConfig();
    const developerKey = config?.apiKey;
    const appId = config?.messagingSenderId;
    if (!developerKey || !appId) return null;
    return { developerKey, appId: String(appId) };
  } catch (err) {
    console.warn('Could not read Picker configuration:', err);
    return null;
  }
}

/** Whether "browse my Drive" can be offered at all. */
export function isPickerAvailable(): boolean {
  return typeof window !== 'undefined' && getPickerConfig() !== null;
}

let pickerApiPromise: Promise<void> | null = null;

/** Loads gapi and its picker module once per page. */
export function loadPickerApi(): Promise<void> {
  if (pickerApiPromise) return pickerApiPromise;

  pickerApiPromise = new Promise<void>((resolve, reject) => {
    const fail = (message: string) => {
      // Let a later attempt retry rather than caching the failure forever —
      // this is usually a dropped connection, not a permanent condition.
      pickerApiPromise = null;
      reject(new Error(message));
    };

    const loadPickerModule = () => {
      if (window.google?.picker) return resolve();
      if (!window.gapi) return fail('Google API script loaded but gapi was unavailable.');
      window.gapi.load('picker', {
        callback: () => resolve(),
        onerror: () => fail('Google Picker module failed to load.'),
      });
    };

    if (window.gapi) return loadPickerModule();

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PICKER_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', loadPickerModule);
      existing.addEventListener('error', () => fail('Could not load Google Picker.'));
      return;
    }

    const script = document.createElement('script');
    script.src = PICKER_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = loadPickerModule;
    script.onerror = () => fail('Could not load Google Picker. Check your connection and try again.');
    document.body.appendChild(script);
  });

  return pickerApiPromise;
}

/**
 * Opens the Drive file chooser and resolves with the chosen spreadsheet's
 * id, or null if the user closed it without picking.
 */
export function pickSpreadsheet(accessToken: string): Promise<string | null> {
  const config = getPickerConfig();
  if (!config) {
    return Promise.reject(new Error('Google Picker is not configured for this app.'));
  }

  return loadPickerApi().then(
    () =>
      new Promise<string | null>((resolve, reject) => {
        try {
          const picker = window.google.picker;

          // Two tabs: the user's own ledgers, and — the reason this exists —
          // ledgers other people shared with them.
          const myDrive = new picker.DocsView(picker.ViewId.SPREADSHEETS)
            .setOwnedByMe(true)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false);

          const sharedWithMe = new picker.DocsView(picker.ViewId.SPREADSHEETS)
            .setOwnedByMe(false)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(false);

          const built = new picker.PickerBuilder()
            // setAppId is what makes the grant durable under drive.file.
            .setAppId(config.appId)
            .setOAuthToken(accessToken)
            .setDeveloperKey(config.developerKey)
            .addView(myDrive)
            .addView(sharedWithMe)
            .setTitle('Choose your farm ledger')
            .setCallback((data: any) => {
              if (data.action === picker.Action.PICKED) {
                resolve(data.docs?.[0]?.id || null);
              } else if (data.action === picker.Action.CANCEL) {
                resolve(null);
              }
              // Other actions (LOADED) are progress, not an answer.
            })
            .build();

          built.setVisible(true);
        } catch (err) {
          reject(
            new Error(
              `Could not open the Drive file chooser: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      })
  );
}

/**
 * Opens the Drive chooser on folders so a partner can pick the ledger's
 * shared receipts folder once. Picking it records a drive.file grant for
 * this app on that folder, which uploading into it requires. Resolves with
 * the chosen folder's id, or null if closed without picking.
 */
export function pickReceiptsFolder(accessToken: string, folderId: string): Promise<string | null> {
  const config = getPickerConfig();
  if (!config) {
    return Promise.reject(new Error('Google Picker is not configured for this app.'));
  }

  return loadPickerApi().then(
    () =>
      new Promise<string | null>((resolve, reject) => {
        try {
          const picker = window.google.picker;
          const folders = new picker.DocsView(picker.ViewId.FOLDERS)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setMimeTypes('application/vnd.google-apps.folder');
          // Narrow the view to just the ledger's folder where Picker
          // supports it, so there is nothing else to choose.
          if (typeof folders.setFileIds === 'function') folders.setFileIds(folderId);

          new picker.PickerBuilder()
            .setAppId(config.appId)
            .setOAuthToken(accessToken)
            .setDeveloperKey(config.developerKey)
            .addView(folders)
            .setTitle('Choose "FarmLedger Receipts"')
            .setCallback((data: any) => {
              if (data.action === picker.Action.PICKED) {
                resolve(data.docs?.[0]?.id || null);
              } else if (data.action === picker.Action.CANCEL) {
                resolve(null);
              }
            })
            .build()
            .setVisible(true);
        } catch (err) {
          reject(
            new Error(
              `Could not open the Drive folder chooser: ${err instanceof Error ? err.message : String(err)}`
            )
          );
        }
      })
  );
}

/** Test seam: forget the cached script-load promise. */
export function resetPickerApiForTests(): void {
  pickerApiPromise = null;
}
