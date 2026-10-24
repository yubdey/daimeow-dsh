// DaiMeow 全屏桌面层：由 DSH 插件的 Host 进程用独立 Electron 运行时拉起。
// 这不是 DSH 的 Electron 主进程，而是一个自带的小 Electron 应用。
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let win = null;
let tray = null;

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
    // 不抢焦点：点击/右键呆喵只做鼠标交互，不激活本窗口，其他程序照常可操作。
    focusable: false,
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
  win.setFocusable(false);
  win.on('focus', () => {
    try {
      win?.blur();
    } catch {
      // 窗口可能已经销毁。
    }
  });
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.webContents.setBackgroundThrottling(false);
  // 默认整窗点击穿透；渲染端在光标进入宠物命中区时通过 IPC 翻转。
  win.setIgnoreMouseEvents(true, { forward: true });
  // 渲染进程崩溃/加载失败时恢复点击穿透，避免全屏窗口挡住桌面。
  win.webContents.on('render-process-gone', () => {
    try {
      win?.setIgnoreMouseEvents(true, { forward: true });
    } catch {
      // 窗口可能已经销毁。
    }
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    console.error('[daimeow-helper] did-fail-load', code, description);
    try {
      win?.setIgnoreMouseEvents(true, { forward: true });
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
  win.on('hide', () => notifyVisibility(false));
  win.once('ready-to-show', () => win.showInactive());
  setTimeout(() => {
    try {
      if (win && !win.isDestroyed() && !win.isVisible()) win.showInactive();
    } catch {
      // 窗口可能已经销毁。
    }
  }, 1500);
  win.on('closed', () => {
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
      { label: '显示', click: () => win?.showInactive() },
      { label: '隐藏', click: () => win?.hide() },
      {
        label: '恢复交互',
        click: () => {
          try {
            win?.webContents.send('pet-reset-interaction');
          } catch {
            // 窗口可能已经销毁。
          }
        },
      },
      { type: 'separator' },
      { label: '退出呆喵', click: () => app.quit() },
    ]));
    tray.on('click', () => {
      if (!win) return;
      if (win.isVisible()) win.hide();
      else win.showInactive();
    });
  } catch (error) {
    console.error('[daimeow-helper] tray failed', error);
  }
}

// 宿主把 daimeow/reaction 帧写进 stdin，这里转发给渲染端。
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
        if (win && !win.isDestroyed()) win.webContents.send('pet-frame', frame);
      } catch (error) {
        console.error('[daimeow-helper] bad frame', error);
      }
    }
  });
}

ipcMain.on('pet-window:ignore', (_event, ignore) => {
  if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(!!ignore, { forward: true });
});
ipcMain.on('pet-window:always-on-top', (_event, value) => {
  if (!win || win.isDestroyed()) return;
  try {
    win.setAlwaysOnTop(!!value, 'screen-saver');
  } catch {
    // 置顶切换失败时保持原状。
  }
});
ipcMain.on('pet-window:quit', () => app.quit());
ipcMain.on('pet-window:hide', () => win?.hide());
ipcMain.on('pet-window:show', () => win?.showInactive());

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win && !win.isDestroyed()) win.showInactive();
  });
  app.whenReady().then(() => {
    createWindow();
    createTray();
  });
  app.on('window-all-closed', () => app.quit());
}
