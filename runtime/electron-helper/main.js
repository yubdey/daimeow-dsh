// DaiMeow 全屏桌面层：由 DSH 插件的 Host 进程用独立 Electron 运行时拉起。
// 这不是 DSH 的 Electron 主进程，而是一个自带的小 Electron 应用。
const { app, BrowserWindow, desktopCapturer, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let win = null;
let tray = null;
let hitRegions = [];
let ignoringMouse = true;
let interactionTimer = null;
let lastCursorKey = '';
let interactionLocked = false;
let controlServer = null;
let pluginDisableRequested = false;
let lastScreenshotAt = 0;
let screenshotInFlight = false;
const controlToken = crypto.randomBytes(24).toString('hex');
const INTERACTION_POLL_MS = 16;
const SCREENSHOT_COOLDOWN_MS = 5000;
const SCREENSHOT_MAX_WIDTH = 480;

function cursorInWindow() {
  if (!win || win.isDestroyed()) return null;
  const point = screen.getCursorScreenPoint();
  const bounds = win.getContentBounds();
  return {
    x: point.x - bounds.x,
    y: point.y - bounds.y,
    inside: point.x >= bounds.x
      && point.y >= bounds.y
      && point.x < bounds.x + bounds.width
      && point.y < bounds.y + bounds.height,
  };
}

function setMouseIgnoring(ignore) {
  if (!win || win.isDestroyed()) return;
  const next = !!ignore;
  if (ignoringMouse === next) return;
  ignoringMouse = next;
  // 主进程已经负责把真实光标位置推给渲染端。穿透状态下继续 forward
  // 会让全屏层参与滚轮/命中分发，导致切到其他程序后滚轮先被它截获。
  win.setIgnoreMouseEvents(next);
}

function publishCursor(point) {
  if (!win || win.isDestroyed() || !win.isVisible() || !point) return;
  const key = `${point.x}:${point.y}`;
  if (key === lastCursorKey) return;
  lastCursorKey = key;
  try {
    win.webContents.send('pet-cursor', point);
  } catch {
    // 页面尚未就绪时忽略。
  }
}

function pointInsideRegion(point) {
  if (!point?.inside || hitRegions.length === 0) return false;
  return hitRegions.some((region) => point.x >= region.x
    && point.y >= region.y
    && point.x < region.x + region.width
    && point.y < region.y + region.height);
}

function updateInteraction() {
  if (!win || win.isDestroyed()) return;
  if (!win.isVisible()) {
    setMouseIgnoring(true);
    return;
  }
  const point = cursorInWindow();
  publishCursor(point);
  setMouseIgnoring(!interactionLocked && !pointInsideRegion(point));
}

function syncWindowAfterShow() {
  if (!win || win.isDestroyed()) return;
  // 显示后先恢复全屏穿透，再由命中区域和当前真实光标位置决定交互状态。
  win.setIgnoreMouseEvents(true);
  ignoringMouse = true;
  updateInteraction();
  try {
    win.webContents.send('pet-window-shown', cursorInWindow());
  } catch {
    // 页面尚未就绪时忽略。
  }
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  win.showInactive();
  setTimeout(syncWindowAfterShow, 50);
}

function hideWindow() {
  if (!win || win.isDestroyed()) return;
  interactionLocked = false;
  win.hide();
  setMouseIgnoring(true);
}

function startInteractionPolling() {
  if (interactionTimer !== null) return;
  interactionTimer = setInterval(updateInteraction, INTERACTION_POLL_MS);
}

function stopInteractionPolling() {
  if (interactionTimer === null) return;
  clearInterval(interactionTimer);
  interactionTimer = null;
}

function requestPluginDisable() {
  if (pluginDisableRequested) return;
  pluginDisableRequested = true;
  try {
    process.stdout.write('dsh-pet-disable-plugin\n');
  } catch {
    pluginDisableRequested = false;
    sendPetFrame({ action: 'sad', speech: '关闭插件失败了喵…', speechMs: 4200, state: 'error' });
    return;
  }
  // Host 成功停用插件后会在清理 effect 中终止本进程。这里只留一个超时兜底，
  // 避免 Host 异常时 helper 永久卡在“关闭中”而无法再次从托盘退出。
  const timer = setTimeout(() => {
    if (pluginDisableRequested) pluginDisableRequested = false;
  }, 5000);
  timer.unref?.();
}

function sendPetFrame(frame) {
  if (!win || win.isDestroyed()) return;
  try {
    win.webContents.send('pet-frame', frame);
  } catch {
    // 页面尚未就绪时忽略。
  }
}

async function captureScreenJpeg() {
  const displayId = String(screen.getPrimaryDisplay().id);
  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: SCREENSHOT_MAX_WIDTH, height: Math.round(SCREENSHOT_MAX_WIDTH * 9 / 16) },
  });
  const source = sources.find((item) => String(item.display_id) === displayId) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error('没有可用的屏幕截图源');
  let image = source.thumbnail;
  if (image.getSize().width > SCREENSHOT_MAX_WIDTH) {
    image = image.resize({
      width: SCREENSHOT_MAX_WIDTH,
      height: Math.round(SCREENSHOT_MAX_WIDTH / image.getAspectRatio()),
    });
  }
  return image.toJPEG(65).toString('base64');
}

async function handleScreenCaptureRequest() {
  const elapsed = Date.now() - lastScreenshotAt;
  if (screenshotInFlight) {
    return { ok: false, busy: true };
  }
  if (elapsed < SCREENSHOT_COOLDOWN_MS) {
    return { ok: false, cooldownMs: SCREENSHOT_COOLDOWN_MS - elapsed };
  }
  screenshotInFlight = true;
  lastScreenshotAt = Date.now();
  try {
    const data = await captureScreenJpeg();
    process.stdout.write(`dsh-pet-screen:${JSON.stringify({ mediaType: 'image/jpeg', data })}\n`);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[daimeow-helper] screen capture failed', message);
    sendPetFrame({ action: 'sad', speech: '没看清屏幕喵…', speechMs: 3600, state: 'error' });
    return { ok: false, error: message };
  } finally {
    screenshotInFlight = false;
  }
}

function dispatchControlFrame(frame) {
  if (!frame || typeof frame !== 'object') {
    throw new Error('control payload must be an object');
  }
  if (frame.action === 'diagnostics') {
    const point = cursorInWindow();
    return {
      ok: true,
      visible: !!win && !win.isDestroyed() && win.isVisible(),
      focused: !!win && !win.isDestroyed() && win.isFocused(),
      ignoringMouse,
      interactionLocked,
      hitRegions,
      cursor: point,
      bounds: win && !win.isDestroyed() ? win.getContentBounds() : null,
    };
  }
  // 控制动作由主进程直接执行；窗口隐藏后渲染进程可能已被节流。
  if (frame.action === 'show') {
    showWindow();
    return { ok: true };
  }
  if (frame.action === 'hide') {
    hideWindow();
    return { ok: true };
  }
  if (frame.action === 'capture_screen') {
    void handleScreenCaptureRequest();
    return { ok: true };
  }
  if (frame.action === 'disable_plugin') {
    requestPluginDisable();
    return { ok: true };
  }
  if (frame.action === 'disable-failed') {
    pluginDisableRequested = false;
    const speech = frame.state === 'restart-required'
      ? '关闭插件需要重启 DSH 喵…'
      : '关闭插件失败了喵…';
    sendPetFrame({ action: 'sad', speech, speechMs: 4200, state: 'error' });
    return { ok: true };
  }
  if (win && !win.isDestroyed()) win.webContents.send('pet-frame', frame);
  return { ok: true };
}

function startControlServer() {
  if (controlServer) return;
  const route = `/control/${controlToken}`;
  controlServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== route) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('not found');
      return;
    }
    let raw = '';
    let rejected = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (rejected) return;
      raw += chunk;
      if (raw.length > 256 * 1024) {
        rejected = true;
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'control payload too large' }));
      }
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        const result = dispatchControlFrame(JSON.parse(raw));
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(result || { ok: true }));
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    });
    req.on('error', () => {
      if (!res.headersSent) res.writeHead(400);
      res.end();
    });
  });
  controlServer.on('error', (error) => {
    console.error('[daimeow-helper] control server failed', error);
  });
  controlServer.listen(0, '127.0.0.1', () => {
    const address = controlServer?.address();
    if (!address || typeof address === 'string') return;
    // Electron 主进程在 Windows 上收不到管道 stdin，宿主通过该回环地址下发
    // 显示/隐藏和动作帧；stdout 只用于发现端口和回报状态。
    process.stdout.write(`dsh-pet-control:http://127.0.0.1:${address.port}${route}\n`);
  });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  win = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    show: false,
    useContentSize: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    // 显示时用 showInactive 不主动抢焦点；真正点击呆喵时允许窗口短暂获得焦点，
    // 否则 Chromium 在部分 Windows/Electron 组合下只派发 pointerup，
    // 会丢失左键动作和菜单按钮的 pointerdown。
    focusable: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setBackgroundThrottling(false);
  // 默认整窗点击穿透；渲染端上报宠物/菜单命中区域，主进程轮询真实光标位置翻转。
  win.setIgnoreMouseEvents(true);
  ignoringMouse = true;
  // 渲染进程崩溃/加载失败时恢复点击穿透，避免全屏窗口挡住桌面。
  win.webContents.on('render-process-gone', () => {
    try {
      win?.setIgnoreMouseEvents(true);
    } catch {
      // 窗口可能已经销毁。
    }
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[daimeow-helper] did-fail-load', code, description);
    try {
      win?.setIgnoreMouseEvents(true);
    } catch {
      // 窗口可能已经销毁。
    }
  });
  const notifyVisibility = (visible) => {
    try {
      process.stdout.write(`dsh-pet-visibility:${visible ? 'true' : 'false'}\n`);
    } catch {
      // stdout 不可用时忽略。
    }
  };
  win.on('show', () => notifyVisibility(true));
  win.on('show', () => setTimeout(syncWindowAfterShow, 20));
  win.on('hide', () => {
    notifyVisibility(false);
    setMouseIgnoring(true);
  });
  win.once('ready-to-show', () => win.showInactive());
  setTimeout(() => {
    try {
      if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
    } catch {
      // 窗口可能已经销毁。
    }
  }, 1500);
  win.on('closed', () => {
    stopInteractionPolling();
    controlServer?.close();
    controlServer = null;
    win = null;
    app.quit();
  });
  win.webContents.on('console-message', (_event, _level, message) => {
    console.log('[daimeow-helper:renderer]', String(message));
  });
  // loadFile 不会编码路径里的空格（DaiMeow Plugins / DaiMeow DSH），会 ERR_FAILED；
  // 用 pathToFileURL 生成规范 file URL 再 loadURL。
  const pageUrl = pathToFileURL(path.join(__dirname, 'index.html')).href;
  win.loadURL(pageUrl).catch((error) => {
    console.error('[daimeow-helper] load failed', pageUrl, error);
  });
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, '..', '..', 'icon.png');
    const image = nativeImage.createFromPath(iconPath);
    if (image.isEmpty()) return;
    tray = new Tray(image.resize({ width: 16, height: 16 }));
    tray.setToolTip('呆喵桌面层');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: '显示', click: showWindow },
      { label: '隐藏', click: hideWindow },
      {
        label: '恢复交互',
        click: () => {
          try {
            hitRegions = [];
            setMouseIgnoring(true);
            win?.webContents.send('pet-reset-interaction', cursorInWindow());
          } catch {
            // 窗口可能已经销毁。
          }
        },
      },
      { type: 'separator' },
      { label: '退出呆喵', click: requestPluginDisable },
    ]));
    tray.on('click', () => {
      if (!win) return;
      if (win.isVisible()) hideWindow();
      else showWindow();
    });
  } catch (error) {
    console.error('[daimeow-helper] tray failed', error);
  }
}

// 兼容非 Windows 或旧宿主的 stdin 帧；Windows 正常路径走本地控制服务器。
if (process.stdin) {
  let stdinBuffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    stdinBuffer += chunk;
    let index;
    while ((index = stdinBuffer.indexOf('\n')) >= 0) {
      const line = stdinBuffer.slice(0, index);
      stdinBuffer = stdinBuffer.slice(index + 1);
      if (!line.startsWith('dsh-pet-frame:')) continue;
      try {
        const frame = JSON.parse(line.slice('dsh-pet-frame:'.length));
        // show/hide 必须由主进程直接处理。窗口隐藏后，渲染进程可能已被节流或
        // 暂停，不能再依赖它转一层 IPC 才把窗口重新显示出来。
        if (frame.action === 'show') {
          showWindow();
          continue;
        }
        if (frame.action === 'hide') {
          hideWindow();
          continue;
        }
        if (win && !win.isDestroyed()) win.webContents.send('pet-frame', frame);
      } catch (error) {
        console.error('[daimeow-helper] bad frame', error);
      }
    }
  });
}

ipcMain.on('pet-window:set-hit-regions', (_event, regions) => {
  hitRegions = Array.isArray(regions)
    ? regions.filter((region) => region
      && Number.isFinite(region.x)
      && Number.isFinite(region.y)
      && Number.isFinite(region.width)
      && Number.isFinite(region.height)
      && region.width > 0
      && region.height > 0)
    : [];
  updateInteraction();
});
ipcMain.on('pet-window:interaction-lock', (_event, locked) => {
  interactionLocked = !!locked;
  if (!interactionLocked) {
    try {
      win?.blur();
    } catch {
      // 窗口可能已经销毁。
    }
  }
  updateInteraction();
});
ipcMain.on('pet-window:always-on-top', (_event, value) => {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(!!value, 'screen-saver');
  } catch {
    // 置顶切换失败时保持原状。
  }
});
ipcMain.on('pet-window:disable-plugin', requestPluginDisable);
ipcMain.handle('pet-window:capture-screen', handleScreenCaptureRequest);
ipcMain.on('pet-window:hide', hideWindow);
ipcMain.on('pet-window:show', showWindow);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });
  app.whenReady().then(() => {
    createWindow();
    createTray();
    startControlServer();
    startInteractionPolling();
  });
  app.on('window-all-closed', () => app.quit());
}
