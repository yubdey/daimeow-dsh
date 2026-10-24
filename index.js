import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function makeTool(definition) {
  return {
    ...definition,
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: definition.parameters?.properties ?? {},
      required: definition.parameters?.required ?? [],
    },
  };
}

const ACTIONS = [
  'nod',
  'shake_head',
  'look_left',
  'look_right',
  'look_up',
  'look_down',
  'blink',
  'ear_twitch',
  'happy',
  'surprised',
  'sad',
  'cheer',
  'hold_pig',
  'play_game',
  'eat_chips',
  'eat_two_chips',
  'hello',
  'drool',
  'question',
  'idea',
  'thinking',
  'sit',
  'stand_up',
  'show',
  'hide',
  'reset',
];

function normalizeText(value, fallback = '') {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || fallback;
}

function clipText(value, limit = 180) {
  const text = normalizeText(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function reaction(action, speech = '', speechMs = 0, state = 'idle') {
  return {
    type: 'daimeow/reaction',
    action: ACTIONS.includes(action) ? action : null,
    speech: clipText(speech),
    speechMs: Math.max(0, Math.min(20_000, Number(speechMs) || 0)),
    state,
  };
}

class DaiMeowService {
  constructor(config) {
    this.config = config;
    this.clients = new Set();
    this.seq = 0;
    this.last = reaction(null, '', 0, 'idle');
    this.onFrame = null;
    this.lastReactionAt = new Map();
  }

  __broadcast(frame) {
    this.seq += 1;
    const value = {
      ...frame,
      seq: this.seq,
      time: Date.now(),
    };
    this.last = value;
    try {
      this.onFrame?.(value);
    } catch {
      // 桌面 helper 的帧管道失败不应影响网页端。
    }
    for (const client of this.clients) {
      try {
        client.write(`data: ${JSON.stringify(value)}\n\n`);
      } catch {
        this.clients.delete(client);
      }
    }
    return value;
  }

  publish(frame) {
    return this.__broadcast(frame);
  }

  // 只广播、不写入 last，避免分离窗口状态污染 pet_status 的 lastReaction。
  publishTransient(frame) {
    this.seq += 1;
    const value = {
      ...frame,
      seq: this.seq,
      time: Date.now(),
    };
    for (const client of this.clients) {
      try {
        client.write(`data: ${JSON.stringify(value)}\n\n`);
      } catch {
        this.clients.delete(client);
      }
    }
    return value;
  }

  snapshot() {
    return {
      type: 'daimeow/snapshot',
      ...this.last,
      seq: this.seq,
      time: Date.now(),
      actions: ACTIONS,
    };
  }

  throttle(key) {
    const now = Date.now();
    const previous = this.lastReactionAt.get(key) ?? 0;
    if (now - previous < this.config.reactionThrottleMs) return false;
    this.lastReactionAt.set(key, now);
    return true;
  }

}

function statusFor(event) {
  const type = event?.type;
  if (type === 'turn/start') {
    return reaction('nod', '收到，开工啦喵！', 2600, 'working');
  }
  if (type === 'tool/call') {
    return reaction('thinking', '', 0, 'working');
  }
  if (type === 'tool/result') {
    const failed = event?.data?.isError === true || event?.data?.error !== undefined;
    return failed
      ? reaction('sad', '这个小工具摔了一跤喵…', 4200, 'error')
      : reaction('nod', '', 0, 'working');
  }
  if (type === 'turn/end') {
    return reaction('cheer', '这一轮做完啦喵！', 3400, 'idle');
  }
  return null;
}

function apply(ctx, config = {}) {
  const resolved = {
    autoReactions: config.autoReactions !== false,
    reactionThrottleMs: Math.max(0, Number(config.reactionThrottleMs) || 1200),
    desktop: config.desktop !== false,
  };
  const service = new DaiMeowService(resolved);

  ctx.effect(() => {
    const disposeRoute = ctx.webServer.register({
      kind: 'exact',
      path: '/daimeow/events',
      handler: (req, res) => {
        if (req.method !== 'GET') {
          res.writeHead(405, { allow: 'GET' });
          res.end();
          return;
        }
        res.writeHead(200, {
          'content-type': 'text/event-stream; charset=utf-8',
          'cache-control': 'no-cache',
          connection: 'keep-alive',
        });
        res.write(`data: ${JSON.stringify(service.snapshot())}\n\n`);
        service.clients.add(res);
        res.on('close', () => service.clients.delete(res));
      },
    });
    return () => {
      disposeRoute();
      for (const response of service.clients) response.destroy();
      service.clients.clear();
    };
  }, 'daimeow-dsh: reaction event route');

  let detachedChild = null;
  let desktopVisible = false;
  const pluginRoot = dirname(fileURLToPath(import.meta.url));
  const helperMain = join(pluginRoot, 'runtime', 'electron-helper', 'main.js');

  function resolveElectronExe() {
    const candidates = [];
    if (process.env.DSH_PET_ELECTRON_PATH) candidates.push(process.env.DSH_PET_ELECTRON_PATH);
    const home = process.env.USERPROFILE || process.env.HOME || '';
    const relative = process.platform === 'win32'
      ? 'electron.exe'
      : process.platform === 'darwin'
        ? join('Electron.app', 'Contents', 'MacOS', 'Electron')
        : 'electron';
    if (home) candidates.push(join(home, '.dsh', 'electron', relative));
    return candidates.find((candidate) => {
      try {
        return existsSync(candidate);
      } catch {
        return false;
      }
    });
  }

  service.onFrame = (frame) => {
    const child = detachedChild;
    if (!child || !child.stdin || !child.stdin.writable) return;
    try {
      child.stdin.write(`dsh-pet-frame:${JSON.stringify(frame)}\n`);
    } catch {
      // 桌面 helper 断开时忽略。
    }
  };

  function startDetached() {
    if (detachedChild) return { ok: true, reused: true };
    const exe = resolveElectronExe();
    if (!exe) {
      return {
        ok: false,
        status: 503,
        error: '未找到 Electron 运行时：请设置 DSH_PET_ELECTRON_PATH，或安装 dsh-pet 以复用 ~/.dsh/electron/electron.exe',
      };
    }
    try {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.NODE_OPTIONS;
      const child = spawn(exe, [helperMain], {
        cwd: pluginRoot,
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      detachedChild = child;
      desktopVisible = true;
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        const text = String(chunk);
        console.log('[daimeow-helper]', text.trimEnd());
        const match = /dsh-pet-visibility:(true|false)/.exec(text);
        if (match) desktopVisible = match[1] === 'true';
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk) => console.warn('[daimeow-helper]', String(chunk).trimEnd()));
      child.on('error', (error) => {
        console.error('[daimeow-helper] spawn failed', error);
      });
      child.on('exit', () => {
        if (detachedChild === child) detachedChild = null;
        desktopVisible = false;
        service.publishTransient({ type: 'daimeow/detached', open: false });
      });
      service.publishTransient({ type: 'daimeow/detached', open: true });
      return { ok: true };
    } catch (error) {
      detachedChild = null;
      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  ctx.effect(() => {
    const openHandler = (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const result = startDetached();
      sendJson(
        res,
        result.ok ? 200 : (result.status || 500),
        result.ok ? { ok: true, reused: result.reused === true } : { ok: false, error: result.error },
      );
    };

    const closeHandler = (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      try {
        detachedChild?.kill();
      } catch {
        // helper 可能已经退出。
      }
      detachedChild = null;
      sendJson(res, 200, { ok: true });
    };

    const statusHandler = (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' });
        res.end();
        return;
      }
      sendJson(res, 200, {
        ok: true,
        open: !!detachedChild,
        visible: desktopVisible,
      });
    };

    const showHandler = (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const child = detachedChild;
      if (!child || !child.stdin || !child.stdin.writable) {
        sendJson(res, 404, { ok: false, error: 'desktop pet is not running' });
        return;
      }
      try {
        child.stdin.write('dsh-pet-frame:{"action":"show"}\n');
      } catch {
        // 管道断开时忽略。
      }
      desktopVisible = true;
      sendJson(res, 200, { ok: true });
    };

    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/open', handler: openHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/close', handler: closeHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/status', handler: statusHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/show', handler: showHandler }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
      service.onFrame = null;
      try {
        detachedChild?.kill();
      } catch {
        // helper 可能已经退出。
      }
      detachedChild = null;
    };
  }, 'daimeow-dsh: detached window routes');

  if (resolved.desktop) {
    ctx.effect(() => {
      const result = startDetached();
      if (!result.ok) {
        console.warn('[daimeow-dsh] desktop pet unavailable:', result.error);
      }
      return () => {
        service.onFrame = null;
        try {
          detachedChild?.kill();
        } catch {
          // helper 可能已经退出。
        }
        detachedChild = null;
      };
    }, 'daimeow-dsh: desktop pet autostart');
  }

  ctx.on('session/event', (_session, event) => {
    if (!resolved.autoReactions) return;
    const next = statusFor(event);
    if (next === null) return;
    const key = `${event?.type}:${next.action ?? 'speech'}`;
    if (!service.throttle(key)) return;
    service.publish(next);
  });

  ctx.tools.register(makeTool({
    name: 'pet_say',
    description: 'Make the in-app DaiMeow desktop pet say a short line, optionally with one of its Live2D actions.',
    parameters: {
      properties: {
        text: {
          type: 'string',
          description: 'Short user-facing line; 1-2 sentences and at most 180 characters.',
        },
        action: {
          type: 'string',
          enum: ACTIONS,
          description: 'Optional action to play while speaking.',
        },
        durationMs: {
          type: 'integer',
          minimum: 1000,
          maximum: 20000,
          description: 'How long the speech bubble stays visible, from 1000 to 20000 ms.',
        },
      },
      required: ['text'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok
          ? `DaiMeow says: ${value.speech || '(action only)'}`
          : `DaiMeow rejected the request: ${value.error}`,
      }],
    },
    execute(args) {
      const text = clipText(args.text);
      if (!text) {
        return Promise.resolve({ ok: false, error: 'text cannot be empty' });
      }
      const action = args.action ?? null;
      const speechMs = Math.max(1000, Math.min(20_000, Number(args.durationMs) || 6000));
      const event = service.publish(reaction(action, text, speechMs, 'message'));
      return Promise.resolve({
        ok: true,
        speech: event.speech,
        action: event.action,
        speechMs: event.speechMs,
        seq: event.seq,
      });
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '让呆喵说话',
      kind: 'other',
      rawInput: { text: args.text, action: args.action },
    }),
  }));

  ctx.tools.register(makeTool({
    name: 'pet_control',
    description: 'Control the in-app DaiMeow desktop pet: play an action, sit or stand, show or hide it, or restore defaults.',
    parameters: {
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: 'Pet action. show/hide/reset are UI controls; the remaining values play Live2D poses or motions.',
        },
      },
      required: ['action'],
    },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{
        type: 'text',
        text: value.ok ? `DaiMeow is now running: ${value.action}` : `DaiMeow rejected the request: ${value.error}`,
      }],
    },
    execute(args) {
      const action = normalizeText(args.action);
      if (!ACTIONS.includes(action)) {
        return Promise.resolve({ ok: false, error: `unknown action: ${action}` });
      }
      const event = service.publish(reaction(action, '', 0, 'action'));
      return Promise.resolve({ ok: true, action: event.action, seq: event.seq });
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `控制呆喵：${args.action}`,
      kind: 'other',
    }),
  }));

  ctx.tools.register(makeTool({
    name: 'pet_status',
    description: 'Read the in-app DaiMeow desktop pet state and the available Live2D actions.',
    parameters: { properties: {}, required: [] },
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{
        type: 'text',
        text: JSON.stringify(value, null, 2),
      }],
    },
    execute() {
      return Promise.resolve({
        ok: true,
        activeClients: service.clients.size,
        desktop: !!detachedChild,
        desktopVisible,
        lastReaction: service.last,
        availableActions: ACTIONS,
        autoReactions: resolved.autoReactions,
      });
    },
    presentCall: () => ({
      card: 'generic',
      kind: 'read',
      title: '读取呆喵状态',
    }),
  }));
}

export const inject = ['tools', 'webServer'];
export { ACTIONS, DaiMeowService, apply, reaction };
