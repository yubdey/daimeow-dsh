import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { downloadArtifact } from '@electron/get';
import {
  BlockAssembler,
  ReasoningEffortId,
  createAssistantMessage,
  createUserMessage,
} from '@deepseek-ai/dsh-llm';
import {
  SCREEN_PROMPT,
  SCREEN_SYSTEM,
  decodeScreenPayload,
  parseScreenReply,
  screenErrorText,
} from './screen-reply.js';
import {
  ensureElectronRuntime,
  findExistingElectron,
} from './electron-runtime.js';

function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function readJsonBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error('request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
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
  'capture_screen',
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
  let desktopControlUrl = '';
  let desktopStdoutBuffer = '';
  let screenRecognitionInFlight = false;
  let screenReasoningOff = null;
  let helperStartPromise = null;
  let helperStopPromise = null;
  let electronEnsurePromise = null;
  let electronRuntimeState = {
    state: 'idle',
    path: '',
    version: '',
    mirror: '',
    existing: false,
    transferred: 0,
    total: 0,
    error: '',
  };
  let pluginLifecycleDisposing = false;
  const expectedChildExits = new WeakSet();
  const screenHistory = [];
  const pluginRoot = dirname(fileURLToPath(import.meta.url));
  const helperMain = join(pluginRoot, 'runtime', 'electron-helper', 'main.js');

  function resolveElectronExe() {
    return findExistingElectron();
  }

  async function ensureElectronExe() {
    const existing = resolveElectronExe();
    if (existing) {
      electronRuntimeState = {
        ...electronRuntimeState,
        state: 'ready',
        path: existing,
        existing: true,
        error: '',
      };
      return { ok: true, path: existing, existing: true };
    }
    if (electronEnsurePromise) return electronEnsurePromise;
    electronEnsurePromise = (async () => {
      const { default: extract } = await import('@electron-internal/extract-zip');
      return ensureElectronRuntime({
        downloadArtifact,
        extract,
        onState(state) {
          electronRuntimeState = state;
        },
        logger: console,
      });
    })().finally(() => {
      electronEnsurePromise = null;
    });
    return electronEnsurePromise;
  }

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let disablingPlugin = false;
  let disableState = 'idle';
  let disableResult = null;
  let pendingClientDisable = null;

  function requestClientDisable(reason = 'requested') {
    if (pendingClientDisable) return true;
    const requestId = randomUUID();
    const pending = {
      requestId,
      reason,
      timer: null,
    };
    disableState = 'waiting-dsh-client';
    pending.timer = setTimeout(() => {
      if (pendingClientDisable !== pending) return;
      pendingClientDisable = null;
      disableState = 'dsh-client-timeout';
      console.warn('[daimeow-dsh] DSH client did not answer the plugin-disable request');
      void postDesktopControl({ action: 'disable-failed', reason, state: disableState });
    }, 15_000);
    pending.timer.unref?.();
    pendingClientDisable = pending;
    service.publishTransient({
      type: 'daimeow/disable-request',
      requestId,
      reason,
    });
    return true;
  }

  function completeClientDisable(payload) {
    const pending = pendingClientDisable;
    if (!pending || payload?.requestId !== pending.requestId) return false;
    if (payload.status === 'dispatching') {
      disableState = 'dsh-client-disabling';
      return true;
    }
    clearTimeout(pending.timer);
    pendingClientDisable = null;
    disableResult = payload.result ?? null;
    if (payload.ok === true) {
      disableState = 'disabled';
      return true;
    }
    disableState = typeof payload.state === 'string' && payload.state
      ? payload.state
      : 'dsh-client-disable-failed';
    void postDesktopControl({
      action: 'disable-failed',
      reason: pending.reason,
      state: disableState,
    });
    return true;
  }

  function cancelPendingClientDisable() {
    if (!pendingClientDisable) return;
    clearTimeout(pendingClientDisable.timer);
    pendingClientDisable = null;
  }

  async function disableDaiMeowPlugin(reason = 'requested') {
    if (disablingPlugin) return false;
    disablingPlugin = true;
    try {
      return requestClientDisable(reason);
    } finally {
      disablingPlugin = false;
    }
  }

  async function postDesktopControl(frame, timeoutMs = 2000) {
    const child = detachedChild;
    if (!child) return { ok: false, error: 'desktop pet is not running' };
    const deadline = Date.now() + timeoutMs;
    while (!desktopControlUrl && detachedChild === child && Date.now() < deadline) {
      await delay(25);
    }
    if (detachedChild !== child) {
      return { ok: false, error: 'desktop pet exited while starting' };
    }
    if (!desktopControlUrl) {
      return { ok: false, error: 'desktop pet control channel is not ready' };
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(desktopControlUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(frame),
        signal: controller.signal,
      });
      const text = await response.text();
      let body = null;
      try {
        body = JSON.parse(text);
      } catch {
        // 保留原始响应文本用于错误说明。
      }
      if (!response.ok || body?.ok === false) {
        return {
          ok: false,
          error: body?.error || text || `desktop helper returned HTTP ${response.status}`,
        };
      }
      return { ok: true, data: body };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  function signalDesktopShow() {
    const exe = resolveElectronExe();
    if (!exe) return false;
    try {
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.NODE_OPTIONS;
      // 第二实例会被 helper 的单实例锁合并，并触发已有实例的
      // second-instance 事件；这是控制端口未就绪时仍能唤醒窗口的兜底。
      const signal = spawn(exe, [helperMain, '--dsh-pet-show'], {
        cwd: pluginRoot,
        env,
        stdio: 'ignore',
        windowsHide: true,
      });
      signal.on('error', (error) => {
        console.warn('[daimeow-helper] show signal failed', error);
      });
      signal.unref();
      return true;
    } catch (error) {
      console.warn('[daimeow-helper] show signal failed', error);
      return false;
    }
  }

  function clearDetachedState() {
    desktopVisible = false;
    desktopControlUrl = '';
    desktopStdoutBuffer = '';
  }

  function waitForChildExit(child, timeoutMs = 3000) {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeListener('exit', finish);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      timer.unref?.();
      child.once('exit', finish);
    });
  }

  function stopDetached(reason = 'stop') {
    const child = detachedChild;
    if (!child) {
      clearDetachedState();
      return helperStopPromise ?? Promise.resolve();
    }
    expectedChildExits.add(child);
    detachedChild = null;
    clearDetachedState();
    service.publishTransient({ type: 'daimeow/detached', open: false });
    try {
      child.kill();
    } catch {
      // 进程可能已经退出。
    }
    const stopping = waitForChildExit(child).finally(() => {
      if (helperStopPromise === stopping) helperStopPromise = null;
    });
    helperStopPromise = stopping;
    console.log(`[daimeow-dsh] desktop helper stopping (${reason})`);
    return stopping;
  }

  function rememberScreenExchange(reply) {
    screenHistory.push(
      { role: 'user', content: '（看了一眼屏幕）' },
      { role: 'assistant', content: reply },
    );
    if (screenHistory.length > 6) screenHistory.splice(0, screenHistory.length - 6);
  }

  async function supportsReasoningOff(provider, model) {
    const llm = ctx.llm;
    if (!llm || typeof llm.resolveModelInfo !== 'function') return false;
    try {
      const info = await llm.resolveModelInfo(provider, model);
      return info?.reasoning?.efforts?.some((effort) => effort.id === 'off') === true;
    } catch {
      return false;
    }
  }

  async function handleDesktopScreenshot(payload) {
    if (screenRecognitionInFlight) {
      return;
    }
    const decoded = decodeScreenPayload(payload);
    if (!decoded.ok) {
      if (decoded.error === 'screen-payload-too-large') {
        service.publish(reaction('sad', '屏幕截图太大了喵…', 3600, 'error'));
      } else if (decoded.error === 'invalid-screen-base64') {
        service.publish(reaction('sad', '屏幕截图坏掉了喵…', 3600, 'error'));
      }
      return;
    }
    const bytes = decoded.bytes;

    screenRecognitionInFlight = true;
    try {
      const attachments = ctx.get?.('attachments', false);
      if (typeof attachments?.saveImages !== 'function') {
        throw new Error('attachments service is unavailable');
      }
      const maxBytes = attachments.imageLimits?.maxImageBytes;
      if (Number.isFinite(maxBytes) && bytes.length > maxBytes) {
        throw new Error(`screenshot exceeds image limit: ${bytes.length} > ${maxBytes}`);
      }
      const [image] = await attachments.saveImages([{
        data: new Uint8Array(bytes),
        mediaType: 'image/jpeg',
      }]);
      if (!image?.attachmentId) throw new Error('attachment service returned no image reference');

      const selection = ctx.agentDefaultModel?.currentSelection?.();
      if (!selection?.provider || !selection?.model) throw new Error('no model configured');
      const llm = ctx.llm;
      if (!llm || typeof llm.stream !== 'function') throw new Error('LLM service is unavailable');
      const reasoningOffSupported = await supportsReasoningOff(selection.provider, selection.model);
      screenReasoningOff = reasoningOffSupported;

      const history = screenHistory.map((message) => (
        message.role === 'assistant'
          ? createAssistantMessage({
            content: [{ type: 'text', text: message.content }],
            source: { provider: selection.provider, model: selection.model },
          })
          : createUserMessage({
            content: [{ type: 'text', text: message.content }],
            source: { kind: 'user' },
          })
      ));
      const current = createUserMessage({
        content: [
          { type: 'image', attachment: image },
          { type: 'text', text: SCREEN_PROMPT },
        ],
        source: { kind: 'user' },
      });
      const assembler = new BlockAssembler();
      for await (const chunk of llm.stream({
        provider: selection.provider,
        model: selection.model,
        sessionId: 'daimeow-dsh-screen',
        messages: [...history, current],
        system: SCREEN_SYSTEM,
        temperature: 0.8,
        ...(reasoningOffSupported ? { reasoningEffort: ReasoningEffortId('off') } : {}),
        signal: AbortSignal.timeout(60_000),
      })) {
        assembler.push(chunk);
      }
      const text = assembler
        .blocks()
        .filter((block) => block.type === 'text')
        .map((block) => block.text || '')
        .join('')
        .trim();
      if (!text) throw new Error('model returned no text');
      const parsed = parseScreenReply(text);
      if (!parsed.reply) throw new Error('model returned an empty screen comment');
      rememberScreenExchange(parsed.reply);
      service.publish(reaction(
        parsed.action,
        parsed.reply,
        Math.min(12_000, Math.max(5_200, parsed.reply.length * 280)),
        'message',
      ));
    } catch (error) {
      console.warn('[daimeow-dsh] screen recognition failed:', error);
      service.publish(reaction('sad', screenErrorText(error), 5200, 'error'));
    } finally {
      screenRecognitionInFlight = false;
    }
  }

  service.onFrame = (frame) => {
    void postDesktopControl(frame).catch((error) => {
      console.warn('[daimeow-dsh] desktop control frame failed:', error);
    });
  };

  async function startDetached() {
    if (detachedChild) return { ok: true, reused: true };
    if (helperStartPromise) return helperStartPromise;
    if (helperStopPromise) await helperStopPromise;
    if (detachedChild) return { ok: true, reused: true };

    const starting = (async () => {
      const runtime = await ensureElectronExe();
      if (!runtime.ok) {
        return {
          ok: false,
          status: 503,
          error: `Electron 运行时不可用：${runtime.error}`,
        };
      }
      const exe = runtime.path;
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
      clearDetachedState();
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk) => {
        desktopStdoutBuffer += String(chunk);
        let newline;
        while ((newline = desktopStdoutBuffer.indexOf('\n')) >= 0) {
          const line = desktopStdoutBuffer.slice(0, newline).trim();
          desktopStdoutBuffer = desktopStdoutBuffer.slice(newline + 1);
          if (!line) continue;
          if (line.startsWith('dsh-pet-control:')) {
            const url = line.slice('dsh-pet-control:'.length).trim();
            if (/^http:\/\/127\.0\.0\.1:\d+\/control\/[a-f0-9]+$/i.test(url)) {
              desktopControlUrl = url;
            } else {
              console.warn('[daimeow-helper] invalid control URL:', url);
            }
            continue;
          }
          if (line.startsWith('dsh-pet-visibility:')) {
            desktopVisible = line.slice('dsh-pet-visibility:'.length).trim() === 'true';
            continue;
          }
          if (line === 'dsh-pet-disable-plugin') {
            void disableDaiMeowPlugin();
            continue;
          }
          if (line.startsWith('dsh-pet-screen:')) {
            try {
              void handleDesktopScreenshot(JSON.parse(line.slice('dsh-pet-screen:'.length)));
            } catch (error) {
              console.warn('[daimeow-helper] invalid screen payload', error);
            }
            continue;
          }
          console.log('[daimeow-helper]', line);
        }
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk) => console.warn('[daimeow-helper]', String(chunk).trimEnd()));
      child.on('error', (error) => {
        console.error('[daimeow-helper] spawn failed', error);
      });
      child.on('exit', () => {
        const expected = expectedChildExits.delete(child);
        const wasCurrent = detachedChild === child;
        if (wasCurrent) detachedChild = null;
        if (wasCurrent) clearDetachedState();
        service.publishTransient({ type: 'daimeow/detached', open: false });
        if (!expected && !pluginLifecycleDisposing && !disablingPlugin) {
          console.warn('[daimeow-dsh] desktop helper exited unexpectedly; disabling plugin');
          void disableDaiMeowPlugin('helper-exit');
        }
      });
      service.publishTransient({ type: 'daimeow/detached', open: true });
      return { ok: true };
    } catch (error) {
      detachedChild = null;
      clearDetachedState();
      return {
        ok: false,
        status: 500,
        error: error instanceof Error ? error.message : String(error),
      };
    }
    })();
    helperStartPromise = starting;
    try {
      return await starting;
    } finally {
      if (helperStartPromise === starting) helperStartPromise = null;
    }
  }

  ctx.effect(() => {
    const openHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const result = await startDetached();
      sendJson(
        res,
        result.ok ? 200 : (result.status || 500),
        result.ok ? { ok: true, reused: result.reused === true } : { ok: false, error: result.error },
      );
    };

    const closeHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      if (!detachedChild) {
        const disabled = await disableDaiMeowPlugin('close-route');
        sendJson(res, disabled ? 202 : 503, disabled
          ? { ok: true, disabling: true }
          : { ok: false, error: disableState });
        return;
      }
      const result = await postDesktopControl({ action: 'disable_plugin' });
      if (!result.ok) {
        const disabled = await disableDaiMeowPlugin('close-route-fallback');
        sendJson(res, disabled ? 202 : 503, disabled
          ? { ok: true, disabling: true, fallback: true }
          : { ok: false, error: result.error || disableState });
        return;
      }
      sendJson(res, 202, { ok: true, disabling: true });
    };

    const disableResultHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      try {
        const payload = await readJsonBody(req);
        if (!completeClientDisable(payload)) {
          sendJson(res, 409, { ok: false, error: 'disable request is no longer active' });
          return;
        }
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
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
        controlReady: !!desktopControlUrl,
        electronRuntime: electronRuntimeState,
        disableTransport: 'dsh-client-remote',
        disableRequestPending: !!pendingClientDisable,
        disableRequest: pendingClientDisable
          ? {
            requestId: pendingClientDisable.requestId,
            reason: pendingClientDisable.reason,
          }
          : null,
        disableState,
        disableResult,
        screenRecognitionInFlight,
        screenReasoningOff,
        screenHistoryRounds: Math.floor(screenHistory.length / 2),
        starting: !!helperStartPromise,
        stopping: !!helperStopPromise,
      });
    };

    const diagnosticsHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const result = await postDesktopControl({ action: 'diagnostics' });
      if (!result.ok) {
        sendJson(res, 503, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 200, {
        ...result.data,
        disableTransport: 'dsh-client-remote',
        disableRequestPending: !!pendingClientDisable,
      });
    };

    const captureHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const result = await postDesktopControl({ action: 'capture_screen' });
      if (!result.ok) {
        sendJson(res, 503, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 202, { ok: true });
    };

    const showHandler = async (req, res) => {
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
      const result = await postDesktopControl({ action: 'show' });
      if (result.ok) {
        const deadline = Date.now() + 900;
        while (!desktopVisible && detachedChild === child && Date.now() < deadline) {
          await delay(25);
        }
      }
      if (!desktopVisible) {
        if (!signalDesktopShow()) {
          sendJson(res, 503, {
            ok: false,
            error: result.ok ? 'failed to signal the desktop helper to show' : result.error,
          });
          return;
        }
        const deadline = Date.now() + 1200;
        while (!desktopVisible && detachedChild === child && Date.now() < deadline) {
          await delay(25);
        }
        if (!desktopVisible) {
          sendJson(res, 503, {
            ok: false,
            error: result.error || 'desktop helper did not confirm the show request',
          });
          return;
        }
      }
      // 不乐观更新 visible；等 helper 的 dsh-pet-visibility:true 回报后再更新。
      sendJson(res, 200, { ok: true });
    };

    const hideHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const child = detachedChild;
      if (!child) {
        sendJson(res, 404, { ok: false, error: 'desktop pet is not running' });
        return;
      }
      const result = await postDesktopControl({ action: 'hide' });
      if (!result.ok) {
        sendJson(res, 503, { ok: false, error: result.error });
        return;
      }
      const deadline = Date.now() + 1200;
      while (desktopVisible && detachedChild === child && Date.now() < deadline) {
        await delay(25);
      }
      if (desktopVisible) {
        sendJson(res, 503, { ok: false, error: 'desktop helper did not confirm the hide request' });
        return;
      }
      sendJson(res, 200, { ok: true });
    };

    const recoverHandler = async (req, res) => {
      if (req.method !== 'POST') {
        res.writeHead(405, { allow: 'POST' });
        res.end();
        return;
      }
      const result = await postDesktopControl({ action: 'reset_interaction' });
      if (!result.ok) {
        sendJson(res, 503, { ok: false, error: result.error });
        return;
      }
      sendJson(res, 200, { ok: true });
    };

    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/open', handler: openHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/close', handler: closeHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/disable-result', handler: disableResultHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/status', handler: statusHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/show', handler: showHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/hide', handler: hideHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/recover-interaction', handler: recoverHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/diagnostics', handler: diagnosticsHandler }),
      ctx.webServer.register({ kind: 'exact', path: '/daimeow/detached/capture', handler: captureHandler }),
    ];
    return () => {
      for (const dispose of disposers) dispose();
      service.onFrame = null;
      pluginLifecycleDisposing = true;
      cancelPendingClientDisable();
      void stopDetached('route-dispose');
    };
  }, 'daimeow-dsh: detached window routes');

  if (resolved.desktop) {
    ctx.effect(() => {
      let disposed = false;
      void startDetached().then((result) => {
        if (!disposed && !result.ok) {
          console.warn('[daimeow-dsh] desktop pet unavailable:', result.error);
        }
      });
      return () => {
        disposed = true;
        service.onFrame = null;
        pluginLifecycleDisposing = true;
        cancelPendingClientDisable();
        void stopDetached('plugin-dispose');
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
    description: 'Control the in-app DaiMeow desktop pet: play an action, sit or stand, show or hide it, capture and comment on the screen, or restore defaults.',
    parameters: {
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: 'Pet action. show/hide/reset are UI controls, capture_screen runs screen recognition; the remaining values play Live2D poses or motions.',
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
        screenRecognitionInFlight,
        screenReasoningOff,
        screenHistoryRounds: Math.floor(screenHistory.length / 2),
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

export const inject = ['tools', 'webServer', 'llm', 'agentDefaultModel'];
export { ACTIONS, DaiMeowService, apply, reaction };
