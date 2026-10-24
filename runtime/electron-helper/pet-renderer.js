// 全屏桌面层里的呆喵渲染器：给 Live2D 运行时提供最小 petAPI，并处理
// 全屏窗口的点击穿透、拖动、右键菜单和宿主推来的 reaction 帧。
(function () {
  const doc = document;
  const pet = doc.getElementById('pet');
  const stage = doc.getElementById('petStage');
  const canvas = doc.getElementById('petCanvas');
  const bubble = doc.getElementById('speech-bubble');
  const menu = doc.getElementById('menu');

  const BASE_W = 200;
  const BASE_H = 250;
  const POSITION_KEY = 'daimeow-helper.position.v1';
  const SETTINGS_KEY = 'daimeow-helper.settings.v1';
  const DEFAULT_POSITION = { x: 0.8, y: 0.62 };
  const SCALE_OPTIONS = [0.75, 1, 1.25];
  const DEFAULT_SETTINGS = {
    scale: 1,
    opacity: 1,
    fixed: false,
    clickThrough: false,
    alwaysOnTop: true,
  };

  const PROP_IDS = [
    ['prop-left', 'assets/pompom_yellow.png'],
    ['prop-right', 'assets/pompom_pink.png'],
    ['prop-hello', 'assets/hello.png'],
    ['question-0', 'assets/question.png'],
    ['question-3', 'assets/question.png'],
    ['question-4', 'assets/question.png'],
    ['question-5', 'assets/question.png'],
    ['prop-idea-hand', 'assets/idea_hand.png'],
    ['prop-lightbulb', 'assets/lightbulb.png'],
    ['prop-thinking-hand', 'assets/idea_hand.png'],
    ['prop-thinking-loading', 'assets/thinking_loading.gif'],
    ['prop-pig-sticker', 'assets/pig_sticker.png'],
    ['prop-drool', 'assets/drool.png'],
    ['prop-chips', 'assets/chips.png'],
    ['prop-pig', 'assets/pig.png'],
    ['prop-gamepad', 'assets/gamepad.png'],
    ['prop-hand-left', 'assets/hand_left.png'],
    ['prop-hand-right', 'assets/hand_right.png'],
    ['prop-chip', 'assets/chip.png'],
  ];

  const ACTION_LABELS = {
    nod: '点头',
    shake_head: '摇头',
    look_left: '看左',
    look_right: '看右',
    look_up: '抬头',
    look_down: '低头',
    blink: '耳朵抖动1',
    ear_twitch: '耳朵抖动2',
    happy: '开心',
    surprised: '惊讶',
    sad: '难过',
    cheer: '啦啦啦',
    hold_pig: '抱小猪',
    play_game: '玩游戏',
    eat_chips: '吃一片薯片',
    eat_two_chips: '吃两片薯片',
    hello: '打招呼',
    drool: '流口水',
    question: '问号',
    idea: '灵光一闪',
    thinking: '思考中',
    sit: '坐下',
    stand_up: '站起',
  };

  let position = loadPosition();
  let settings = loadSettings();
  let menuOpen = false;
  let suppressContextMenu = false;
  let lastPointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  applyScale();
  applyOpacity();
  applyAlwaysOnTop();
  applyPosition();

  for (const [id, source] of PROP_IDS) {
    const img = doc.createElement('img');
    img.id = id;
    img.className = 'prop';
    img.src = ASSET_DATA[source];
    img.alt = '';
    img.draggable = false;
    stage.appendChild(img);
  }

  function loadPosition() {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (value && Number.isFinite(value.x) && Number.isFinite(value.y)) {
        return {
          x: Math.min(0.98, Math.max(0.02, value.x)),
          y: Math.min(0.98, Math.max(0.02, value.y)),
        };
      }
    } catch {
      // 忽略损坏的本地位置。
    }
    return { ...DEFAULT_POSITION };
  }

  function savePosition() {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    } catch {
      // localStorage 不可用时保持内存位置。
    }
  }

  function applyPosition() {
    pet.style.left = String(position.x * window.innerWidth) + 'px';
    pet.style.top = String(position.y * window.innerHeight) + 'px';
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const value = raw ? JSON.parse(raw) : null;
      if (value && typeof value === 'object') {
        return {
          ...DEFAULT_SETTINGS,
          ...value,
          scale: SCALE_OPTIONS.includes(Number(value.scale)) ? Number(value.scale) : 1,
          opacity: Math.min(1, Math.max(0.3, Number(value.opacity) || 1)),
        };
      }
    } catch {
      // 忽略损坏的设置。
    }
    return { ...DEFAULT_SETTINGS };
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // localStorage 不可用时保持内存设置。
    }
  }

  function applyScale() {
    pet.style.width = Math.round(BASE_W * settings.scale) + 'px';
    pet.style.height = Math.round(BASE_H * settings.scale) + 'px';
  }

  function applyOpacity() {
    pet.style.opacity = String(settings.opacity);
  }

  function applyAlwaysOnTop() {
    window.petWindow?.setAlwaysOnTop?.(settings.alwaysOnTop);
  }

  function updateSettings(patch) {
    settings = { ...settings, ...patch };
    saveSettings();
    applyScale();
    applyOpacity();
    applyAlwaysOnTop();
    updateHitTest();
  }

  // ---- minimal petAPI ----
  const listeners = {
    mouse: new Set(),
    gamepad: new Set(),
    probe: new Set(),
    speech: new Set(),
    reaction: new Set(),
    resize: new Set(),
    fixed: new Set(),
    maxFps: new Set(),
    visibility: new Set(),
    ready: new Set(),
  };
  const subscribe = (name) => (callback) => {
    if (typeof callback === 'function') listeners[name].add(callback);
  };
  const emit = (name, value) => {
    for (const callback of [...listeners[name]]) {
      try {
        callback(value);
      } catch (error) {
        console.error('[daimeow-helper]', error);
      }
    }
  };

  function prepareModelUrl() {
    const model = JSON.parse(JSON.stringify(MODEL_DOCUMENT));
    const references = model.FileReferences ?? {};
    const asset = (path) => ASSET_DATA[`model/daimeow/${path}`] ?? path;
    if (references.Moc) references.Moc = asset(references.Moc);
    if (references.Physics) references.Physics = asset(references.Physics);
    if (references.DisplayInfo) references.DisplayInfo = asset(references.DisplayInfo);
    if (Array.isArray(references.Textures)) references.Textures = references.Textures.map(asset);
    if (Array.isArray(references.Expressions)) {
      for (const expression of references.Expressions) expression.File = asset(expression.File);
    }
    if (references.Motions && typeof references.Motions === 'object') {
      for (const motions of Object.values(references.Motions)) {
        if (!Array.isArray(motions)) continue;
        for (const motion of motions) motion.File = asset(motion.File);
      }
    }
    return URL.createObjectURL(new Blob([JSON.stringify(model)], { type: 'application/json' }));
  }

  function buildMotionNameTable(modelDocument) {
    const table = [];
    const groups = modelDocument?.FileReferences?.Motions ?? {};
    for (const [group, motions] of Object.entries(groups)) {
      if (!Array.isArray(motions)) continue;
      motions.forEach((motion, index) => {
        const name = String(motion?.File ?? '')
          .split('/')
          .pop()
          .replace('.motion3.json', '');
        table.push({ group, index, name });
      });
    }
    return table;
  }

  const modelUrl = prepareModelUrl();
  const api = {
    getModelUrl: () => modelUrl,
    onMousePosition: subscribe('mouse'),
    onGamepadPosition: subscribe('gamepad'),
    onGamepadProbe: subscribe('probe'),
    reportGamepadPresence: () => {},
    onShowSpeech: subscribe('speech'),
    onAgentReaction: subscribe('reaction'),
    onResize: subscribe('resize'),
    beginPetDrag: () => {},
    endPetDrag: () => {},
    tickPetDrag: () => {},
    onFixedChanged: subscribe('fixed'),
    onMaxFpsChanged: subscribe('maxFps'),
    onVisibilityChanged: subscribe('visibility'),
    openContextMenu: () => {
      // 右键落在呆喵身上：菜单已开就关掉，未开就打开。
      if (suppressContextMenu) {
        suppressContextMenu = false;
        return;
      }
      if (menuOpen) {
        closeMenu();
        return;
      }
      openMenu(lastPointer);
    },
    notifyReady: () => {},
    logError: (message) => console.error('[daimeow-helper]', message),
    __emitMouse: (value) => emit('mouse', value),
    __emitResize: (value) => emit('resize', value),
    __emitFixed: (value) => emit('fixed', value),
    __emitFps: (value) => emit('maxFps', value),
    __emitVisibility: (value) => emit('visibility', value),
    __emitGamepadProbe: (value) => emit('probe', value),
    __emitSpeech: (value) => emit('speech', value),
    __emitReaction: (value) => emit('reaction', value),
    __menuListeners: new Set(),
    __setMenuHandler(callback) {
      this.__menuListeners.clear();
      if (typeof callback === 'function') this.__menuListeners.add(callback);
    },
    __openMenu(point) {
      for (const callback of this.__menuListeners) callback(point);
    },
  };

  window.petAPI = api;
  window.__DAIMEOW_UI_ROOT__ = stage;
  window.__DAIMEOW_MOTION_NAMES__ = buildMotionNameTable(MODEL_DOCUMENT);

  // ---- context menu ----
  // 只在交互状态变化时发 IPC；菜单打开后鼠标每动一次都 setIgnoreMouseEvents(false)
  // 会让窗口命中状态抖动，菜单里的点击被当成“点在外面”而关闭。
  let interactiveState = null;
  function setInteractive(interactive) {
    if (interactiveState === interactive) return;
    interactiveState = interactive;
    window.petWindow?.setIgnoreMouseEvents(!interactive);
  }

  function isInsidePet(point) {
    const rect = pet.getBoundingClientRect();
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }

  function isInsideRect(rect, point, margin = 0) {
    return point.x >= rect.left - margin && point.x <= rect.right + margin
      && point.y >= rect.top - margin && point.y <= rect.bottom + margin;
  }

  function updateHitTest() {
    if (settings.clickThrough) {
      setInteractive(false);
      return;
    }
    if (menuOpen) {
      // 只有光标仍在菜单或呆喵上时才保持可交互；移到别处就恢复整层穿透。
      const inMenu = isInsideRect(menu.getBoundingClientRect(), lastPointer, 4);
      setInteractive(inMenu || isInsidePet(lastPointer));
      return;
    }
    setInteractive(isInsidePet(lastPointer));
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    menu.classList.remove('open');
    updateHitTest();
  }

  function formatScale(value) {
    return `${value.toFixed(2).replace(/0$/, '')}x`;
  }

  function menuRow(label, options = {}) {
    const row = doc.createElement('button');
    row.type = 'button';
    row.className = 'dm-menu-row';
    const check = doc.createElement('span');
    check.className = 'dm-menu-check';
    check.setAttribute('aria-hidden', 'true');
    check.textContent = options.checked ? '✓' : '';
    row.appendChild(check);
    const text = doc.createElement('span');
    text.textContent = label;
    row.appendChild(text);
    if (options.caret) {
      const caret = doc.createElement('span');
      caret.className = 'dm-menu-caret';
      caret.setAttribute('aria-hidden', 'true');
      caret.textContent = options.caret;
      row.appendChild(caret);
    }
    if (options.onClick) row.addEventListener('click', options.onClick);
    return row;
  }

  function addToggle(label, key) {
    const row = menuRow(label, { checked: settings[key] });
    row.addEventListener('click', () => {
      updateSettings({ [key]: !settings[key] });
      row.querySelector('.dm-menu-check').textContent = settings[key] ? '✓' : '';
      if (key === 'clickThrough' && settings.clickThrough) closeMenu();
    });
    menu.appendChild(row);
  }

  function layoutMenu(point) {
    const width = 180;
    const height = menu.offsetHeight || 300;
    menu.style.left = Math.max(4, Math.min(point.x, window.innerWidth - width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(point.y, window.innerHeight - height - 4)) + 'px';
  }

  function adjustSummary() {
    return `${formatScale(settings.scale)} · ${Math.round(settings.opacity * 100)}%`;
  }

  function openMenu(point) {
    menu.textContent = '';

    // 动作（折叠，展开后三列网格）
    let actionsOpen = false;
    const actionsRow = menuRow('动作', { caret: '▸' });
    const actionsBox = doc.createElement('div');
    actionsBox.className = 'dm-menu-actions';
    actionsBox.style.display = 'none';
    for (const name of Object.keys(ACTION_LABELS).filter((n) => n !== 'sit' && n !== 'stand_up')) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'dm-menu-action';
      button.textContent = ACTION_LABELS[name];
      button.title = ACTION_LABELS[name];
      button.addEventListener('click', () => {
        closeMenu();
        window.__daimeowActionDebug?.trigger?.(name);
      });
      actionsBox.appendChild(button);
    }
    actionsRow.addEventListener('click', () => {
      actionsOpen = !actionsOpen;
      actionsRow.querySelector('.dm-menu-caret').textContent = actionsOpen ? '▾' : '▸';
      actionsBox.style.display = actionsOpen ? 'grid' : 'none';
      layoutMenu(point);
    });
    menu.appendChild(actionsRow);
    menu.appendChild(actionsBox);

    // 调整（折叠：大小缩放 + 透明度）
    let adjustOpen = false;
    const adjustRow = menuRow('调整', { caret: `${adjustSummary()} ▸` });
    const adjustBox = doc.createElement('div');
    adjustBox.className = 'dm-menu-adjust';
    adjustBox.style.display = 'none';

    const scaleLabel = doc.createElement('div');
    scaleLabel.className = 'dm-menu-sub-label';
    scaleLabel.textContent = '大小缩放';
    adjustBox.appendChild(scaleLabel);
    const scaleOptions = doc.createElement('div');
    scaleOptions.className = 'dm-scale-options';
    for (const value of SCALE_OPTIONS) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'dm-scale-option';
      button.textContent = formatScale(value);
      button.setAttribute('aria-checked', String(Math.abs(settings.scale - value) < 0.001));
      button.addEventListener('click', () => {
        updateSettings({ scale: value });
        for (const option of scaleOptions.children) option.setAttribute('aria-checked', 'false');
        button.setAttribute('aria-checked', 'true');
        adjustRow.querySelector('.dm-menu-caret').textContent = `${adjustSummary()} ${adjustOpen ? '▾' : '▸'}`;
        layoutMenu(point);
      });
      scaleOptions.appendChild(button);
    }
    adjustBox.appendChild(scaleOptions);

    const opacityLabel = doc.createElement('div');
    opacityLabel.className = 'dm-menu-sub-label gap';
    opacityLabel.textContent = '透明度';
    adjustBox.appendChild(opacityLabel);
    const opacityRow = doc.createElement('div');
    opacityRow.className = 'dm-opacity-row';
    const opacity = doc.createElement('input');
    opacity.type = 'range';
    opacity.min = '0.3';
    opacity.max = '1';
    opacity.step = '0.05';
    opacity.value = String(settings.opacity);
    const opacityValue = doc.createElement('span');
    opacityValue.className = 'dm-opacity-value';
    opacityValue.textContent = `${Math.round(settings.opacity * 100)}%`;
    opacity.addEventListener('input', () => {
      const value = Number(opacity.value);
      updateSettings({ opacity: value });
      opacityValue.textContent = `${Math.round(value * 100)}%`;
      adjustRow.querySelector('.dm-menu-caret').textContent = `${adjustSummary()} ${adjustOpen ? '▾' : '▸'}`;
    });
    opacityRow.appendChild(opacity);
    opacityRow.appendChild(opacityValue);
    adjustBox.appendChild(opacityRow);
    adjustRow.addEventListener('click', () => {
      adjustOpen = !adjustOpen;
      adjustRow.querySelector('.dm-menu-caret').textContent = `${adjustSummary()} ${adjustOpen ? '▾' : '▸'}`;
      adjustBox.style.display = adjustOpen ? 'block' : 'none';
      layoutMenu(point);
    });
    menu.appendChild(adjustRow);
    menu.appendChild(adjustBox);

    addToggle('固定位置', 'fixed');
    addToggle('鼠标穿透', 'clickThrough');
    addToggle('置于顶层', 'alwaysOnTop');

    menu.appendChild(menuRow('恢复默认', {
      onClick: () => {
        updateSettings({ ...DEFAULT_SETTINGS });
        position = { ...DEFAULT_POSITION };
        applyPosition();
        savePosition();
        closeMenu();
      },
    }));

    const separator = doc.createElement('div');
    separator.className = 'dm-separator';
    menu.appendChild(separator);

    menu.appendChild(menuRow('隐藏', {
      onClick: () => {
        closeMenu();
        window.petWindow?.hide();
      },
    }));
    menu.appendChild(menuRow('关闭呆喵', {
      onClick: () => {
        closeMenu();
        window.petWindow?.quit();
      },
    }));

    menuOpen = true;
    menu.classList.add('open');
    layoutMenu(point);
    updateHitTest();
  }

  // 菜单内部的指针事件不冒泡到“点外面关闭菜单”的监听。
  menu.addEventListener('pointerdown', (event) => event.stopPropagation());
  menu.addEventListener('click', (event) => event.stopPropagation());
  menu.addEventListener('contextmenu', (event) => event.preventDefault());
  doc.addEventListener('pointerdown', (event) => {
    if (!menuOpen) return;
    // 菜单内部不关闭；菜单外（包括呆喵身上）左键/右键都关闭。
    if (menu.contains(event.target)) return;
    if (event.button === 2 && stage.contains(event.target)) {
      // 右键在呆喵身上会再触发 contextmenu，这里标记一下，避免关掉后立刻重新弹出。
      suppressContextMenu = true;
    }
    closeMenu();
  });
  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeMenu();
  });

  // ---- pointer: gaze + click-through ----
  window.addEventListener('mousemove', (event) => {
    lastPointer = { x: event.clientX, y: event.clientY };
    const rect = stage.getBoundingClientRect();
    if (rect.width && rect.height) {
      api.__emitMouse({
        relX: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
        relY: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
      });
    }
    // 菜单打开时，光标离开菜单和呆喵就收起菜单，让全屏层恢复穿透，
    // 这样把鼠标移到其他程序上不用点击也能直接滚轮操作。
    if (menuOpen
      && !isInsideRect(menu.getBoundingClientRect(), lastPointer, 4)
      && !isInsideRect(rect, lastPointer, 4)) {
      closeMenu();
      return;
    }
    updateHitTest();
  }, { passive: true });

  window.addEventListener('wheel', () => {
    if (menuOpen
      && !isInsideRect(menu.getBoundingClientRect(), lastPointer, 4)
      && !isInsidePet(lastPointer)) {
      closeMenu();
    }
    updateHitTest();
  }, { passive: true });

  // ---- drag ----
  // 不在 pet 上 setPointerCapture：运行时把点击反应的 pointerup 挂在 stage 上，
  // 捕获到祖先会让 pointerup 绕过 stage，点击就不播动作了。
  let drag = null;
  pet.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || settings.fixed) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: position.x * window.innerWidth,
      startTop: position.y * window.innerHeight,
      moved: false,
    };
  });
  window.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    const left = drag.startLeft + dx;
    const top = drag.startTop + dy;
    position = {
      x: Math.min(0.98, Math.max(0.02, left / window.innerWidth)),
      y: Math.min(0.98, Math.max(0.02, top / window.innerHeight)),
    };
    applyPosition();
  });
  window.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    savePosition();
  });
  window.addEventListener('pointercancel', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    savePosition();
  });

  // ---- boot ----
  window.__daimeowApp = null;
  window.__daimeowActionDebug = undefined;
  bootDaiMeowRuntime();

  const resize = () => {
    if (!canvas.clientWidth || !canvas.clientHeight) return;
    api.__emitResize({ w: canvas.clientWidth, h: canvas.clientHeight });
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(canvas);
  requestAnimationFrame(resize);

  api.__emitVisibility(true);
  api.__emitFps(45);
  api.__emitGamepadProbe(false);
  window.petWindow?.setIgnoreMouseEvents(true);
  updateHitTest();

  // 托盘「恢复交互」：关闭鼠标穿透，避免开启穿透后无法再点开菜单。
  window.petWindow?.onResetInteraction?.(() => {
    updateSettings({ clickThrough: false });
  });

  // ---- frames pushed by the host over stdin ----
  window.petWindow?.onFrame?.((frame) => {
    if (!frame || typeof frame !== 'object') return;
    if (frame.type === 'daimeow/detached') return;
    if (frame.action === 'hide') {
      window.petWindow?.hide();
      return;
    }
    if (frame.action === 'show') {
      window.petWindow?.show();
      return;
    }
    if (frame.action === 'reset') {
      position = { ...DEFAULT_POSITION };
      applyPosition();
      savePosition();
      return;
    }
    api.__emitReaction(frame);
  });
})();
