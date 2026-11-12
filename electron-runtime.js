import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_ELECTRON_VERSION = '43.3.0';
export const DEFAULT_ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
export const DEFAULT_ELECTRON_TIMEOUT_MS = 10 * 60 * 1000;

export function electronSettings(env = process.env) {
  return {
    version: env.DSH_DAIMEOW_ELECTRON_VERSION
      || env.DSH_PET_ELECTRON_VERSION
      || DEFAULT_ELECTRON_VERSION,
    mirror: env.DSH_DAIMEOW_ELECTRON_MIRROR
      || env.DSH_PET_ELECTRON_MIRROR
      || DEFAULT_ELECTRON_MIRROR,
  };
}

export function electronRelativePath(platform = process.platform) {
  if (platform === 'win32') return 'electron.exe';
  if (platform === 'darwin') {
    return join('Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  return 'electron';
}

export function dshHomeDir(env = process.env) {
  const home = env.USERPROFILE || env.HOME || '';
  return env.DSH_HOME || join(home, '.dsh');
}

export function electronLandingDir(env = process.env) {
  return join(dshHomeDir(env), 'electron');
}

export function electronCandidates({
  env = process.env,
  platform = process.platform,
  extraCandidates = [],
} = {}) {
  const values = [
    ...extraCandidates,
    env.DSH_DAIMEOW_ELECTRON_PATH,
    env.DSH_PET_ELECTRON_PATH,
    join(electronLandingDir(env), electronRelativePath(platform)),
  ];
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))];
}

export function findExistingElectron(options = {}) {
  return electronCandidates(options).find((value) => existsSync(value)) ?? '';
}

export async function ensureElectronRuntime({
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  extraCandidates = [],
  downloadArtifact,
  extract,
  exists = existsSync,
  makeDirectory = mkdirSync,
  timeoutMs = DEFAULT_ELECTRON_TIMEOUT_MS,
  onState = () => {},
  logger = console,
  now = Date.now,
} = {}) {
  const settings = electronSettings(env);
  const targetDir = electronLandingDir(env);
  const exe = join(targetDir, electronRelativePath(platform));
  const existing = electronCandidates({ env, platform, extraCandidates })
    .find((value) => exists(value));

  if (existing) {
    const state = {
      state: 'ready',
      path: existing,
      version: settings.version,
      mirror: settings.mirror,
      existing: true,
      transferred: 0,
      total: 0,
      error: '',
    };
    onState(state);
    return { ok: true, path: existing, existing: true, state };
  }

  if (typeof downloadArtifact !== 'function' || typeof extract !== 'function') {
    throw new Error('Electron downloader dependencies are unavailable');
  }

  const startedAt = now();
  let transferred = 0;
  let total = 0;
  const publish = (state, extra = {}) => {
    onState({
      state,
      path: state === 'ready' ? exe : '',
      version: settings.version,
      mirror: settings.mirror,
      existing: false,
      transferred,
      total,
      error: '',
      ...extra,
    });
  };

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error(`Electron download timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  timer.unref?.();

  try {
    publish('downloading');
    logger.info?.(`[daimeow-electron] downloading Electron v${settings.version} (${platform}-${arch})`);
    makeDirectory(targetDir, { recursive: true });
    let nextProgressAt = 0;
    const zipPath = await downloadArtifact({
      version: `v${settings.version}`,
      artifactName: 'electron',
      mirrorOptions: { mirror: settings.mirror.replace(/\/$/, '') + '/' },
      downloadOptions: {
        signal: controller.signal,
        quiet: true,
        getProgressCallback: async (progress) => {
          transferred = Number(progress?.transferred) || 0;
          total = Number(progress?.total) || 0;
          const timestamp = now();
          if (!total || timestamp < nextProgressAt) return;
          nextProgressAt = timestamp + 3000;
          publish('downloading');
        },
      },
    });
    publish('extracting', { transferred, total });
    await extract(zipPath, { dir: targetDir });
    if (!exists(exe)) {
      throw new Error(`Electron archive extracted, but ${electronRelativePath(platform)} was not found`);
    }
    const seconds = ((now() - startedAt) / 1000).toFixed(1);
    logger.info?.(`[daimeow-electron] ready in ${seconds}s: ${exe}`);
    publish('ready');
    return {
      ok: true,
      path: exe,
      existing: false,
      state: {
        state: 'ready',
        path: exe,
        version: settings.version,
        mirror: settings.mirror,
        existing: false,
        transferred,
        total,
        error: '',
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn?.(`[daimeow-electron] automatic Electron setup failed: ${message}`);
    publish('error', { error: message });
    return {
      ok: false,
      error: message,
      state: {
        state: 'error',
        path: '',
        version: settings.version,
        mirror: settings.mirror,
        existing: false,
        transferred,
        total,
        error: message,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
