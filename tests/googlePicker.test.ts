import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getPickerConfig,
  isPickerAvailable,
  loadPickerApi,
  pickSpreadsheet,
  resetPickerApiForTests,
} from '../src/utils/googlePicker';

// The real module reads the bundled Firebase config, whose apiKey and
// messagingSenderId supply Picker's developer key and app id.
import firebaseConfig from '../firebase-applet-config.json';

/** Minimal stand-in for the google.picker namespace the script provides. */
function stubPickerNamespace(onBuild: (spec: Record<string, any>) => void) {
  const spec: Record<string, any> = { views: [] };
  class DocsView {
    constructor(public viewId: string) {}
    setOwnedByMe(v: boolean) { (this as any).ownedByMe = v; return this; }
    setIncludeFolders() { return this; }
    setSelectFolderEnabled() { return this; }
  }
  const builder: any = {
    setAppId: (v: string) => { spec.appId = v; return builder; },
    setOAuthToken: (v: string) => { spec.oauthToken = v; return builder; },
    setDeveloperKey: (v: string) => { spec.developerKey = v; return builder; },
    addView: (v: any) => { spec.views.push(v); return builder; },
    setTitle: (v: string) => { spec.title = v; return builder; },
    setCallback: (cb: any) => { spec.callback = cb; return builder; },
    build: () => ({ setVisible: () => onBuild(spec) }),
  };
  return {
    spec,
    picker: {
      ViewId: { SPREADSHEETS: 'spreadsheets' },
      Action: { PICKED: 'picked', CANCEL: 'cancel', LOADED: 'loaded' },
      DocsView,
      PickerBuilder: function () { return builder; },
    },
  };
}

beforeEach(() => {
  resetPickerApiForTests();
  delete (window as any).gapi;
  delete (window as any).google;
  document.querySelectorAll('script').forEach(el => el.remove());
});

afterEach(() => vi.restoreAllMocks());

describe('getPickerConfig', () => {
  it('derives both settings from the Firebase config, needing no extra setup', () => {
    // messagingSenderId IS the Cloud project number, which is what Picker
    // calls the app id — and what makes the drive.file grant durable.
    const config = getPickerConfig();
    expect(config).toEqual({
      developerKey: firebaseConfig.apiKey,
      appId: String(firebaseConfig.messagingSenderId),
    });
  });

  it('reports the picker as available when configured', () => {
    expect(isPickerAvailable()).toBe(true);
  });
});

describe('loadPickerApi', () => {
  // happy-dom really tries to fetch a script that gets appended, so the
  // append is intercepted and the load/error events are driven by hand.
  let appended: HTMLScriptElement[];
  let appendSpy: any;

  beforeEach(() => {
    appended = [];
    appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(((el: any) => {
      appended.push(el);
      return el;
    }) as any);
  });

  afterEach(() => appendSpy.mockRestore());

  it('injects the Google API script once and reuses the same load', async () => {
    const first = loadPickerApi();
    const second = loadPickerApi();

    expect(appended.length).toBe(1);
    expect(appended[0].src).toBe('https://apis.google.com/js/api.js');
    expect(second).toBe(first);

    (window as any).gapi = { load: (_m: string, o: any) => o.callback() };
    appended[0].onload!({} as any);

    await expect(first).resolves.toBeUndefined();
  });

  it('rejects when the script cannot be fetched', async () => {
    const promise = loadPickerApi();
    appended[0].onerror!({} as any);
    await expect(promise).rejects.toThrow(/Could not load Google Picker/);
  });

  it('lets a later attempt retry after a failure', async () => {
    const failing = loadPickerApi();
    appended[0].onerror!({} as any);
    await expect(failing).rejects.toThrow();

    // A dropped connection must not poison the page for the rest of the
    // session — the next attempt gets a fresh script.
    const retry = loadPickerApi();
    expect(appended.length).toBe(2);

    (window as any).gapi = { load: (_m: string, o: any) => o.callback() };
    appended[1].onload!({} as any);
    await expect(retry).resolves.toBeUndefined();
  });

  it('rejects when gapi loads but the picker module fails', async () => {
    (window as any).gapi = { load: (_m: string, o: any) => o.onerror() };
    await expect(loadPickerApi()).rejects.toThrow(/Picker module failed/);
  });

  it('skips the script entirely when picker is already present', async () => {
    (window as any).gapi = {};
    (window as any).google = { picker: {} };
    await expect(loadPickerApi()).resolves.toBeUndefined();
    expect(appended.length).toBe(0);
  });
});

describe('pickSpreadsheet', () => {
  function primePicker(onBuild: (spec: Record<string, any>) => void) {
    const { picker, spec } = stubPickerNamespace(onBuild);
    (window as any).gapi = { load: (_m: string, o: any) => o.callback() };
    (window as any).google = { picker };
    return { spec, picker };
  }

  it('sets the app id, so the drive.file grant survives to later devices', async () => {
    let captured: Record<string, any> = {};
    primePicker(spec => {
      captured = spec;
      spec.callback({ action: 'picked', docs: [{ id: 'sheet-123' }] });
    });

    await pickSpreadsheet('tok-abc');

    expect(captured.appId).toBe(String(firebaseConfig.messagingSenderId));
    expect(captured.developerKey).toBe(firebaseConfig.apiKey);
    expect(captured.oauthToken).toBe('tok-abc');
  });

  it('offers a "shared with me" view — the whole point of the feature', async () => {
    let captured: Record<string, any> = {};
    primePicker(spec => {
      captured = spec;
      spec.callback({ action: 'picked', docs: [{ id: 'sheet-123' }] });
    });

    await pickSpreadsheet('tok');

    const ownedFlags = captured.views.map((v: any) => v.ownedByMe);
    expect(ownedFlags).toContain(true);
    expect(ownedFlags).toContain(false);
    expect(captured.views.every((v: any) => v.viewId === 'spreadsheets')).toBe(true);
  });

  it('resolves with the chosen spreadsheet id', async () => {
    primePicker(spec => spec.callback({ action: 'picked', docs: [{ id: 'sheet-xyz' }] }));
    await expect(pickSpreadsheet('tok')).resolves.toBe('sheet-xyz');
  });

  it('resolves null when the chooser is dismissed, which is not an error', async () => {
    primePicker(spec => spec.callback({ action: 'cancel' }));
    await expect(pickSpreadsheet('tok')).resolves.toBeNull();
  });

  it('ignores progress events and waits for a real answer', async () => {
    primePicker(spec => {
      spec.callback({ action: 'loaded' });
      spec.callback({ action: 'picked', docs: [{ id: 'sheet-late' }] });
    });
    await expect(pickSpreadsheet('tok')).resolves.toBe('sheet-late');
  });
});
