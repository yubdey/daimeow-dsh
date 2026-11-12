import assert from 'node:assert/strict';
import { join } from 'node:path';
import test from 'node:test';

import {
  DEFAULT_ELECTRON_MIRROR,
  DEFAULT_ELECTRON_VERSION,
  electronCandidates,
  electronLandingDir,
  electronSettings,
  ensureElectronRuntime,
} from '../electron-runtime.js';

test('uses DaiMeow Electron overrides before dsh-pet compatibility variables', () => {
  assert.deepEqual(
    electronSettings({
      DSH_DAIMEOW_ELECTRON_VERSION: '50.1.0',
      DSH_PET_ELECTRON_VERSION: '43.3.0',
      DSH_DAIMEOW_ELECTRON_MIRROR: 'https://example.com/electron/',
      DSH_PET_ELECTRON_MIRROR: 'https://mirror.invalid/',
    }),
    {
      version: '50.1.0',
      mirror: 'https://example.com/electron/',
    },
  );
  assert.deepEqual(electronSettings({}), {
    version: DEFAULT_ELECTRON_VERSION,
    mirror: DEFAULT_ELECTRON_MIRROR,
  });
});

test('orders manual and shared Electron paths deterministically', () => {
  const env = {
    USERPROFILE: 'C:\\Users\\test',
    DSH_DAIMEOW_ELECTRON_PATH: 'D:\\daimeow\\electron.exe',
    DSH_PET_ELECTRON_PATH: 'D:\\dsh-pet\\electron.exe',
  };
  assert.equal(electronLandingDir(env), join('C:\\Users\\test', '.dsh', 'electron'));
  assert.deepEqual(electronCandidates({ env, platform: 'win32' }), [
    'D:\\daimeow\\electron.exe',
    'D:\\dsh-pet\\electron.exe',
    join('C:\\Users\\test', '.dsh', 'electron', 'electron.exe'),
  ]);
});

test('reuses an existing Electron without downloading', async () => {
  let downloaded = false;
  const state = [];
  const result = await ensureElectronRuntime({
    env: {
      DSH_HOME: 'D:\\dsh-home',
      DSH_DAIMEOW_ELECTRON_PATH: 'D:\\electron\\electron.exe',
    },
    platform: 'win32',
    exists: (path) => path === 'D:\\electron\\electron.exe',
    downloadArtifact: async () => {
      downloaded = true;
    },
    extract: async () => {},
    onState: (value) => state.push(value.state),
  });
  assert.equal(result.ok, true);
  assert.equal(result.existing, true);
  assert.equal(downloaded, false);
  assert.deepEqual(state, ['ready']);
});

test('downloads, extracts and reports a ready Electron runtime', async () => {
  let extracted = false;
  let downloadOptions;
  const updates = [];
  const result = await ensureElectronRuntime({
    env: { DSH_HOME: 'D:\\dsh-home' },
    platform: 'win32',
    arch: 'x64',
    exists: (path) => extracted && path.endsWith('electron.exe'),
    makeDirectory: () => {},
    downloadArtifact: async (options) => {
      downloadOptions = options;
      await options.downloadOptions.getProgressCallback({
        transferred: 10 * 1024 * 1024,
        total: 100 * 1024 * 1024,
      });
      return 'D:\\cache\\electron.zip';
    },
    extract: async (zip, options) => {
      assert.equal(zip, 'D:\\cache\\electron.zip');
      assert.equal(options.dir, join('D:\\dsh-home', 'electron'));
      extracted = true;
    },
    onState: (value) => updates.push(value),
    logger: { info: () => {}, warn: () => {} },
    now: () => 1000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.path, join('D:\\dsh-home', 'electron', 'electron.exe'));
  assert.equal(downloadOptions.version, `v${DEFAULT_ELECTRON_VERSION}`);
  assert.equal(downloadOptions.mirrorOptions.mirror, DEFAULT_ELECTRON_MIRROR);
  assert.deepEqual(updates.map((item) => item.state), [
    'downloading',
    'downloading',
    'extracting',
    'ready',
  ]);
});
