window.__ModuleLoader__.load({
  id: 'daimeow-dsh',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const {
      useCallback,
      useEffect,
      useMemo,
      useRef,
      useState,
    } = React;

    __DAIMEOW_CLIENT_DATA__
    __DAIMEOW_RUNTIME_FUNCTION__

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

    const DEFAULT_SETTINGS = {
      scale: 1,
      opacity: 1,
      fps: 45,
      fixed: false,
      clickThrough: false,
      alwaysOnTop: false,
      visible: true,
      gamepad: true,
      pointerTracking: true,
    };

    const STORAGE_KEY = 'daimeow-dsh.settings.v1';
    const POSITION_KEY = 'daimeow-dsh.position.v1';
    // 与 DaiMeow 桌宠程序对齐：原程序基准窗口 400×500、默认 petScale 0.5，
    // 右键「1.0x」即 200×250。这里把基准设成 0.75/1.0/1.25 倍直接等于
    // 原程序的 150×188 / 200×250 / 250×313。
    const BASE_WIDTH = 200;
    const BASE_HEIGHT = 250;

    // Host 用 Electron BrowserWindow 打开独立窗口时，会在 URL 上带 ?daimeow=detached。
    const DETACHED = (() => {
      try {
        return new URLSearchParams(window.location.search).has('daimeow');
      } catch {
        return false;
      }
    })();

    // 桌面全屏是唯一模式：不再渲染 DSH 页面内的窗口桌宠。
    const WEB_UI = false;

    const COPY = {
      zh: {
        'menu.actions': '动作',
        'menu.adjust': '调整',
        'menu.scale': '大小缩放',
        'menu.opacity': '透明度',
        'menu.alwaysOnTop': '置于顶层',
        'menu.settings': '桌宠设置',
        'menu.resetPosition': '复位位置',
        'menu.hide': '隐藏',
        'menu.show': '让呆喵出来',
        'menu.close': '关闭呆喵',
        'menu.detach': '桌面全屏',
        'menu.closePip': '收回呆喵',
        'menu.reset': '恢复默认',
        'settings.title': '呆喵设置',
        'settings.close': '关闭',
        'settings.size': '大小',
        'settings.opacity': '不透明度',
        'settings.fps': '帧率',
        'settings.fixed': '固定位置',
        'settings.clickThrough': '鼠标穿透',
        'settings.pointer': '视线跟随鼠标',
        'settings.gamepad': '手柄视线控制',
        'settings.resetPosition': '回到右下角',
        'settings.restoreInteraction': '恢复交互',
        'pet.show': '叫出呆喵',
        'pet.menu': '呆喵菜单',
        'pet.settings': '呆喵设置',
        'pet.state.idle': '待机中',
        'pet.state.working': '工作中',
        'pet.state.error': '遇到问题',
        'pet.state.message': '正在说话',
        'pet.state.action': '表演中',
      },
      en: {
        'menu.actions': 'Actions',
        'menu.adjust': 'Adjust',
        'menu.scale': 'Scale',
        'menu.opacity': 'Opacity',
        'menu.alwaysOnTop': 'Always on top',
        'menu.settings': 'Pet settings',
        'menu.resetPosition': 'Reset position',
        'menu.hide': 'Hide',
        'menu.show': 'Show DaiMeow',
        'menu.close': 'Close DaiMeow',
        'menu.detach': 'Desktop overlay',
        'menu.closePip': 'Return DaiMeow',
        'menu.reset': 'Restore defaults',
        'settings.title': 'DaiMeow settings',
        'settings.close': 'Close',
        'settings.size': 'Size',
        'settings.opacity': 'Opacity',
        'settings.fps': 'Frame rate',
        'settings.fixed': 'Lock position',
        'settings.clickThrough': 'Click through',
        'settings.pointer': 'Track pointer',
        'settings.gamepad': 'Gamepad tracking',
        'settings.resetPosition': 'Move to bottom right',
        'settings.restoreInteraction': 'Restore interaction',
        'pet.show': 'Show DaiMeow',
        'pet.menu': 'DaiMeow menu',
        'pet.settings': 'DaiMeow settings',
        'pet.state.idle': 'Idle',
        'pet.state.working': 'Working',
        'pet.state.error': 'Needs attention',
        'pet.state.message': 'Speaking',
        'pet.state.action': 'Performing',
      },
    };

    const CSS = `
      .dm-root {
        position: absolute;
        inset: 0;
        z-index: 36;
        pointer-events: none;
        color: var(--dsw-alias-text-1, #1f2937);
        font-family: var(--dsw-font-family-ui, "Segoe UI", "Microsoft YaHei", sans-serif);
      }
      .dm-pet {
        position: absolute;
        transform: translate(-50%, -50%);
        transition: opacity 180ms ease, filter 180ms ease;
        touch-action: none;
        user-select: none;
        pointer-events: auto;
      }
      .dm-pet.is-fixed { cursor: default; }
      .dm-pet:not(.is-fixed) { cursor: grab; }
      .dm-pet:not(.is-fixed):active { cursor: grabbing; }
      .dm-stage {
        position: relative;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
      .dm-stage canvas {
        display: block;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none;
      }
      .dm-stage .prop {
        position: absolute !important;
        left: 0;
        top: 0;
        width: 0;
        transform: translate(-50%, -50%);
        opacity: 0;
        pointer-events: none;
        -webkit-user-drag: none;
        transition: opacity 180ms ease;
      }
      .dm-stage .prop.show { opacity: 1; }
      #speech-bubble {
        position: absolute !important;
        left: 0;
        transform: translateX(-50%);
        background: rgba(255, 255, 255, 0.94);
        color: #17202d;
        padding: calc(9px * var(--bubble-k, 1)) calc(14px * var(--bubble-k, 1));
        border: 1px solid rgba(28, 40, 55, 0.1);
        border-radius: calc(18px * var(--bubble-k, 1));
        font: 500 calc(13px * var(--bubble-k, 1))/1.45 var(--dsw-font-family-ui, "Microsoft YaHei", sans-serif);
        text-align: center;
        pointer-events: none;
        opacity: 0;
        transition: opacity 180ms ease;
        box-shadow: 0 10px 28px rgba(18, 30, 45, 0.16);
        white-space: normal;
        word-break: break-word;
        overflow-wrap: break-word;
      }
      #speech-bubble.show { opacity: 1; }
      #speech-bubble::after {
        content: '';
        position: absolute;
        bottom: calc(-6px * var(--bubble-k, 1));
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: calc(6px * var(--bubble-k, 1)) solid transparent;
        border-right: calc(6px * var(--bubble-k, 1)) solid transparent;
        border-top: calc(6px * var(--bubble-k, 1)) solid rgba(255, 255, 255, 0.94);
      }
      .dm-pet-button {
        position: absolute;
        right: 4px;
        top: 42%;
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border: 1px solid var(--dsw-alias-border-2, rgba(127, 127, 127, 0.3));
        border-radius: 999px;
        background: color-mix(in srgb, var(--dsw-alias-bg-2, #ffffff) 86%, transparent);
        color: var(--dsw-alias-text-2, #475569);
        box-shadow: 0 5px 16px rgba(20, 30, 45, 0.13);
        opacity: 0;
        pointer-events: auto;
        cursor: pointer;
        transition: opacity 150ms ease, transform 150ms ease;
        backdrop-filter: blur(10px);
      }
      .dm-pet:hover .dm-pet-button,
      .dm-pet-button:focus-visible { opacity: 1; }
      .dm-pet-button:hover { transform: translateY(-1px); }
      .dm-pet-button.dm-menu-button { top: calc(42% + 36px); }
      .dm-hud {
        position: absolute;
        left: 50%;
        bottom: 4px;
        transform: translateX(-50%);
        padding: 4px 9px;
        border-radius: 999px;
        background: color-mix(in srgb, var(--dsw-alias-bg-1, #ffffff) 78%, transparent);
        color: var(--dsw-alias-text-3, #64748b);
        font-size: 11px;
        line-height: 1;
        opacity: 0;
        pointer-events: none;
        transition: opacity 140ms ease;
        backdrop-filter: blur(8px);
      }
      .dm-pet:hover .dm-hud { opacity: 1; }
      .dm-menu,
      .dm-panel {
        position: fixed;
        z-index: 80;
        border: 1px solid var(--dsw-alias-border-2, rgba(127, 127, 127, 0.3));
        border-radius: 12px;
        background: var(--dsw-alias-bg-1, #ffffff);
        color: var(--dsw-alias-text-1, #0f172a);
        box-shadow: 0 18px 50px rgba(15, 23, 42, 0.2);
        pointer-events: auto;
      }
      .dm-menu {
        width: 218px;
        max-height: min(520px, calc(100vh - 32px));
        overflow: auto;
        padding: 6px;
      }
      .dm-menu-label {
        padding: 7px 9px 5px;
        color: var(--dsw-alias-text-3, #64748b);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .dm-menu-actions {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 4px;
        padding: 0 4px 7px;
      }
      .dm-menu-action {
        min-width: 0;
        padding: 6px 3px;
        border: 0;
        border-radius: 7px;
        background: var(--dsw-alias-bg-2, #f8fafc);
        color: var(--dsw-alias-text-2, #334155);
        font: inherit;
        font-size: 11px;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .dm-menu-action:hover,
      .dm-menu-action:focus-visible {
        background: var(--dsw-alias-bg-hover, #eef2f7);
        color: var(--dsw-alias-text-1, #0f172a);
      }
      .dm-menu-row {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 32px;
        padding: 6px 8px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--dsw-alias-text-1, #0f172a);
        font: inherit;
        font-size: 12px;
        text-align: left;
        cursor: pointer;
      }
      .dm-menu-row:hover,
      .dm-menu-row:focus-visible {
        background: var(--dsw-alias-bg-hover, #eef2f7);
      }
      .dm-menu-caret {
        margin-left: auto;
        padding-left: 8px;
        font-size: 10px;
        line-height: 1;
        opacity: 0.65;
      }
      .dm-menu-check {
        flex: 0 0 16px;
        width: 16px;
        text-align: center;
        font-size: 11px;
        line-height: 1;
        color: var(--dsw-alias-accent, #3b82f6);
      }
      .dm-menu-adjust {
        padding: 2px 8px 8px;
      }
      .dm-menu-sub-label {
        padding: 6px 0 4px;
        color: var(--dsw-alias-text-3, #64748b);
        font-size: 11px;
        font-weight: 600;
      }
      .dm-menu-sub-label-gap {
        padding-top: 10px;
      }
      .dm-scale-options {
        display: flex;
        gap: 4px;
      }
      .dm-scale-option {
        flex: 1;
        padding: 5px 2px;
        border: 1px solid var(--dsw-alias-border-2, rgba(127, 127, 127, 0.3));
        border-radius: 7px;
        background: var(--dsw-alias-bg-2, #f8fafc);
        color: var(--dsw-alias-text-2, #334155);
        font: inherit;
        font-size: 11px;
        cursor: pointer;
      }
      .dm-scale-option[aria-checked="true"] {
        background: var(--dsw-alias-accent, #3b82f6);
        border-color: var(--dsw-alias-accent, #3b82f6);
        color: #fff;
      }
      .dm-opacity-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .dm-opacity-row input[type="range"] {
        flex: 1;
        accent-color: var(--dsw-alias-accent, #3b82f6);
      }
      .dm-opacity-value {
        width: 38px;
        text-align: right;
        color: var(--dsw-alias-text-3, #64748b);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
      }
      .dm-menu-arrow {
        margin-left: 4px;
      }
      .dm-separator {
        height: 1px;
        margin: 4px 5px;
        background: var(--dsw-alias-border-1, rgba(127, 127, 127, 0.18));
      }
      .dm-panel {
        width: min(310px, calc(100vw - 24px));
        padding: 14px;
      }
      .dm-panel-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .dm-panel-title {
        margin: 0;
        font-size: 14px;
        font-weight: 650;
      }
      .dm-icon-button {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: var(--dsw-alias-text-2, #475569);
        cursor: pointer;
      }
      .dm-icon-button:hover,
      .dm-icon-button:focus-visible {
        background: var(--dsw-alias-bg-hover, #eef2f7);
      }
      .dm-field {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: center;
        gap: 7px 12px;
        padding: 7px 0;
        font-size: 12px;
      }
      .dm-field output {
        color: var(--dsw-alias-text-3, #64748b);
        font-variant-numeric: tabular-nums;
      }
      .dm-field input[type="range"] {
        grid-column: 1 / -1;
        width: 100%;
        accent-color: var(--dsw-alias-accent, #3b82f6);
      }
      .dm-switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 7px 0;
        font-size: 12px;
      }
      .dm-switch {
        position: relative;
        width: 34px;
        height: 20px;
        flex: 0 0 auto;
        border: 0;
        border-radius: 999px;
        background: var(--dsw-alias-border-2, #cbd5e1);
        cursor: pointer;
        transition: background 150ms ease;
      }
      .dm-switch::after {
        content: '';
        position: absolute;
        left: 3px;
        top: 3px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: #fff;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.22);
        transition: transform 150ms ease;
      }
      .dm-switch[aria-checked="true"] { background: var(--dsw-alias-accent, #3b82f6); }
      .dm-switch[aria-checked="true"]::after { transform: translateX(14px); }
      .dm-panel-foot {
        display: flex;
        gap: 8px;
        margin-top: 10px;
      }
      .dm-text-button {
        flex: 1;
        min-height: 30px;
        padding: 6px 9px;
        border: 1px solid var(--dsw-alias-border-2, rgba(127, 127, 127, 0.3));
        border-radius: 8px;
        background: var(--dsw-alias-bg-2, #f8fafc);
        color: var(--dsw-alias-text-2, #334155);
        font: inherit;
        font-size: 12px;
        cursor: pointer;
      }
      .dm-text-button:hover,
      .dm-text-button:focus-visible {
        background: var(--dsw-alias-bg-hover, #eef2f7);
      }
      .dm-tab {
        position: absolute;
        right: 14px;
        bottom: 18px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 7px 10px;
        border: 1px solid var(--dsw-alias-border-2, rgba(127, 127, 127, 0.3));
        border-radius: 999px;
        background: color-mix(in srgb, var(--dsw-alias-bg-1, #ffffff) 88%, transparent);
        color: var(--dsw-alias-text-2, #475569);
        box-shadow: 0 8px 24px rgba(15, 23, 42, 0.14);
        pointer-events: auto;
        cursor: pointer;
        backdrop-filter: blur(10px);
      }
      .dm-tab:hover,
      .dm-tab:focus-visible { background: var(--dsw-alias-bg-hover, #eef2f7); }
      .dm-sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      @media (prefers-reduced-motion: reduce) {
        .dm-pet,
        .dm-pet-button,
        .dm-hud,
        .dm-switch,
        .dm-switch::after {
          transition: none !important;
        }
      }
    `;

    const PROP_IDS = [
      ['prop-left', 'assets/pompom_yellow.png', 'pompom-yellow'],
      ['prop-right', 'assets/pompom_pink.png', 'pompom-pink'],
      ['prop-hello', 'assets/hello.png', 'hello'],
      ['question-0', 'assets/question.png', 'question-0'],
      ['question-3', 'assets/question.png', 'question-3'],
      ['question-4', 'assets/question.png', 'question-4'],
      ['question-5', 'assets/question.png', 'question-5'],
      ['prop-idea-hand', 'assets/idea_hand.png', 'idea-hand'],
      ['prop-lightbulb', 'assets/lightbulb.png', 'lightbulb'],
      ['prop-thinking-hand', 'assets/idea_hand.png', 'thinking-hand'],
      ['prop-thinking-loading', 'assets/thinking_loading.gif', 'thinking-loading'],
      ['prop-pig-sticker', 'assets/pig_sticker.png', 'pig-sticker'],
      ['prop-drool', 'assets/drool.png', 'drool'],
      ['prop-chips', 'assets/chips.png', 'chips'],
      ['prop-pig', 'assets/pig.png', 'pig'],
      ['prop-gamepad', 'assets/gamepad.png', 'gamepad'],
      ['prop-hand-left', 'assets/hand_left.png', 'hand-left'],
      ['prop-hand-right', 'assets/hand_right.png', 'hand-right'],
      ['prop-chip', 'assets/chip.png', 'chip'],
    ];

    function clone(value) {
      return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function loadJson(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
      } catch {
        return fallback;
      }
    }

    function saveJson(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // A denied storage area must not break the pet.
      }
    }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value));
    }

    function prepareModelUrl(trackedUrls) {
      const model = clone(MODEL_DOCUMENT);
      const references = model.FileReferences ?? {};
      const asset = (path) => ASSET_DATA[`model/daimeow/${path}`] ?? path;
      if (references.Moc) references.Moc = asset(references.Moc);
      if (references.Physics) references.Physics = asset(references.Physics);
      if (references.DisplayInfo) references.DisplayInfo = asset(references.DisplayInfo);
      if (Array.isArray(references.Textures)) {
        references.Textures = references.Textures.map(asset);
      }
      if (Array.isArray(references.Expressions)) {
        for (const expression of references.Expressions) {
          expression.File = asset(expression.File);
        }
      }
      if (references.Motions && typeof references.Motions === 'object') {
        for (const motions of Object.values(references.Motions)) {
          if (!Array.isArray(motions)) continue;
          for (const motion of motions) motion.File = asset(motion.File);
        }
      }
      const url = URL.createObjectURL(new Blob(
        [JSON.stringify(model)],
        { type: 'application/json' },
      ));
      trackedUrls.add(url);
      return url;
    }

    // The runtime embeds each motion file as a data: URI, so it can no longer
    // recover an action's name from its path. Build a group/index -> name table
    // from the original model document instead.
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

    function createPetApi(modelUrl) {
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
            console.error('[daimeow-dsh]', error);
          }
        }
      };
      return {
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
        openContextMenu() {
          this.__openMenu({
            x: window.innerWidth - 250,
            y: window.innerHeight - 280,
          });
        },
        notifyReady: (width, height) => {
          emit('ready', { width, height });
          window.__daimeowDSHReady?.({ width, height });
        },
        logError: (message) => console.error('[daimeow-dsh]', message),
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
    }

    function GearIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.8,
        'aria-hidden': true,
      }, h('path', { d: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z' }),
      h('path', { d: 'M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06L7.06 3.8l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 9c.13.37.34.72.6 1 .3.3.68.4 1.1.4H21v4h-.09A1.7 1.7 0 0 0 19.4 15Z' }));
    }

    function Slider({ label, value, min, max, step, format, onChange }) {
      return h('label', { className: 'dm-field' },
        h('span', null, label),
        h('output', null, format(value)),
        h('input', {
          type: 'range',
          min,
          max,
          step,
          value,
          onChange: (event) => onChange(Number(event.currentTarget.value)),
        }),
      );
    }

    function Switch({ label, checked, onChange }) {
      return h('div', { className: 'dm-switch-row' },
        h('span', null, label),
        h('button', {
          type: 'button',
          className: 'dm-switch',
          role: 'switch',
          'aria-checked': checked,
          'aria-label': label,
          onClick: () => onChange(!checked),
        }),
      );
    }

    function SettingsPanel({ t, value, onChange, onClose, onResetPosition, anchor }) {
      useEffect(() => {
        const handleKey = (event) => {
          if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
      }, [onClose]);
      const style = anchor
        ? {
            left: anchor.x,
            top: anchor.y,
            transform: 'translate(-100%, -100%)',
          }
        : {
            right: 18,
            bottom: 18,
          };
      return h('section', {
        className: 'dm-panel',
        style,
        role: 'dialog',
        'aria-modal': 'false',
        'aria-label': t('settings.title'),
        onPointerDown: (event) => event.stopPropagation(),
        onContextMenu: (event) => event.stopPropagation(),
      },
      h('div', { className: 'dm-panel-head' },
        h('h2', { className: 'dm-panel-title' }, t('settings.title')),
        h('button', {
          type: 'button',
          className: 'dm-icon-button',
          'aria-label': t('settings.close'),
          onClick: onClose,
        }, '×'),
      ),
      h(Slider, {
        label: t('settings.size'),
        value: value.scale,
        min: 0.6,
        max: 1.6,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`,
        onChange: (scale) => onChange({ scale }),
      }),
      h(Slider, {
        label: t('settings.opacity'),
        value: value.opacity,
        min: 0.25,
        max: 1,
        step: 0.05,
        format: (v) => `${Math.round(v * 100)}%`,
        onChange: (opacity) => onChange({ opacity }),
      }),
      h(Slider, {
        label: t('settings.fps'),
        value: value.fps,
        min: 30,
        max: 120,
        step: 15,
        format: (v) => `${v} FPS`,
        onChange: (fps) => onChange({ fps }),
      }),
      h(Switch, {
        label: t('settings.fixed'),
        checked: value.fixed,
        onChange: (fixed) => onChange({ fixed }),
      }),
      h(Switch, {
        label: t('settings.clickThrough'),
        checked: value.clickThrough,
        onChange: (clickThrough) => onChange({ clickThrough }),
      }),
      h(Switch, {
        label: t('settings.pointer'),
        checked: value.pointerTracking,
        onChange: (pointerTracking) => onChange({ pointerTracking }),
      }),
      h(Switch, {
        label: t('settings.gamepad'),
        checked: value.gamepad,
        onChange: (gamepad) => onChange({ gamepad }),
      }),
      h('div', { className: 'dm-panel-foot' },
        h('button', {
          type: 'button',
          className: 'dm-text-button',
          onClick: onResetPosition,
        }, t('settings.resetPosition')),
      ));
    }

    function ContextMenu({ t, point, settings, onChange, onAction, onReset, onClosePet, onDetach }) {
      const [actionsOpen, setActionsOpen] = useState(false);
      const [adjustOpen, setAdjustOpen] = useState(false);
      const actionNames = Object.keys(ACTION_LABELS);
      // 与 DaiMeow 桌宠程序的右键“调整大小”保持同一套档位与文案。
      const scaleOptions = [0.75, 1, 1.25];
      const formatScale = (value) => `${value.toFixed(2).replace(/0$/, '')}x`;
      const left = clamp(point.x, 8, window.innerWidth - 230);
      const top = clamp(point.y, 8, Math.max(8, window.innerHeight - 300));
      const maxHeight = Math.min(520, Math.max(180, window.innerHeight - top - 16));
      const check = (on) => h('span', {
        className: 'dm-menu-check',
        'aria-hidden': true,
      }, on ? '✓' : '');
      const summary = `${formatScale(settings.scale)} · ${Math.round(settings.opacity * 100)}%`;
      return h('div', {
        className: 'dm-menu',
        style: { left, top, maxHeight },
        role: 'menu',
        onPointerDown: (event) => event.stopPropagation(),
        onContextMenu: (event) => event.preventDefault(),
      },
      h('button', {
        type: 'button',
        className: 'dm-menu-row dm-menu-toggle',
        role: 'menuitem',
        'aria-expanded': actionsOpen,
        onClick: () => setActionsOpen((open) => !open),
      },
      check(false),
      h('span', null, t('menu.actions')),
      h('span', { className: 'dm-menu-caret', 'aria-hidden': true }, actionsOpen ? '▾' : '▸')),
      actionsOpen && h('div', { className: 'dm-menu-actions' },
        actionNames.map((name) => h('button', {
          key: name,
          type: 'button',
          className: 'dm-menu-action',
          role: 'menuitem',
          title: ACTION_LABELS[name],
          onClick: () => onAction(name),
        }, ACTION_LABELS[name])),
      ),
      h('button', {
        type: 'button',
        className: 'dm-menu-row dm-menu-toggle',
        role: 'menuitem',
        'aria-expanded': adjustOpen,
        onClick: () => setAdjustOpen((open) => !open),
      },
      check(false),
      h('span', null, t('menu.adjust')),
      h('span', { className: 'dm-menu-caret', 'aria-hidden': true },
        summary,
        h('span', { className: 'dm-menu-arrow' }, adjustOpen ? '▾' : '▸'))),
      adjustOpen && h('div', { className: 'dm-menu-adjust' },
        h('div', { className: 'dm-menu-sub-label' }, t('menu.scale')),
        h('div', { className: 'dm-scale-options' },
          scaleOptions.map((value) => h('button', {
            key: value,
            type: 'button',
            className: 'dm-scale-option',
            role: 'menuitemradio',
            'aria-checked': Math.abs(settings.scale - value) < 0.001,
            onClick: () => onChange({ scale: value }),
          }, formatScale(value))),
        ),
        h('div', { className: 'dm-menu-sub-label dm-menu-sub-label-gap' }, t('menu.opacity')),
        h('div', { className: 'dm-opacity-row' },
          h('input', {
            type: 'range',
            min: 0.3,
            max: 1,
            step: 0.05,
            value: settings.opacity,
            'aria-label': t('menu.opacity'),
            onChange: (event) => onChange({ opacity: Number(event.currentTarget.value) }),
          }),
          h('span', { className: 'dm-opacity-value' }, `${Math.round(settings.opacity * 100)}%`),
        ),
      ),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitemcheckbox',
        'aria-checked': settings.fixed,
        onClick: () => onChange({ fixed: !settings.fixed }),
      }, check(settings.fixed), h('span', null, t('settings.fixed'))),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitemcheckbox',
        'aria-checked': settings.clickThrough,
        onClick: () => onChange({ clickThrough: !settings.clickThrough }),
      }, check(settings.clickThrough), h('span', null, t('settings.clickThrough'))),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitemcheckbox',
        'aria-checked': settings.alwaysOnTop,
        onClick: () => onChange({ alwaysOnTop: !settings.alwaysOnTop }),
      }, check(settings.alwaysOnTop), h('span', null, t('menu.alwaysOnTop'))),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitem',
        onClick: onReset,
      }, check(false), h('span', null, t('menu.reset'))),
      h('div', { className: 'dm-separator' }),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitem',
        onClick: () => onAction('hide'),
      }, check(false), h('span', null, t('menu.hide'))),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitem',
        onClick: onClosePet,
      }, check(false), h('span', null, t('menu.close'))),
      h('button', {
        type: 'button',
        className: 'dm-menu-row',
        role: 'menuitem',
        onClick: onDetach,
      }, check(false), h('span', null, t('menu.detach'))));
    }

    function createDaiMeowComponent(ctx) {
      const t = ctx.locale.bind('daimeow-dsh');

      // 桌面模式：DSH 页面只保留“显示呆喵”胶囊，在桌面呆喵被隐藏时出现。
      function DesktopLauncher() {
        const [open, setOpen] = useState(true);
        const [visible, setVisible] = useState(true);
        useEffect(() => {
          let stopped = false;
          const tick = async () => {
            try {
              const response = await fetch('/daimeow/detached/status');
              const data = await response.json();
              if (stopped) return;
              setOpen(!!data.open);
              setVisible(data.visible !== false);
            } catch {
              // 宿主暂不可用时保持现状。
            }
          };
          tick();
          const timer = setInterval(tick, 1500);
          return () => {
            stopped = true;
            clearInterval(timer);
          };
        }, []);
        if (!open || visible) return null;
        return h('button', {
          type: 'button',
          style: {
            position: 'fixed',
            right: 14,
            bottom: 18,
            zIndex: 2147483000,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '7px 12px',
            border: '1px solid rgba(127, 127, 127, 0.3)',
            borderRadius: 999,
            background: 'rgba(255, 255, 255, 0.92)',
            color: '#475569',
            font: '500 12px/1 "Microsoft YaHei", "Segoe UI", sans-serif',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.14)',
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
          },
          onClick: async () => {
            try {
              await fetch('/daimeow/detached/show', { method: 'POST' });
              setVisible(true);
            } catch {
              // 忽略。
            }
          },
        }, '🐾 显示呆喵');
      }

      if (!WEB_UI) {
        return DesktopLauncher;
      }
      return function DaiMeowOverlay() {
        const [settings, setSettings] = useState(() => loadJson(STORAGE_KEY, DEFAULT_SETTINGS));
        const [position, setPosition] = useState(() => loadJson(POSITION_KEY, { x: 0.78, y: 0.64 }));
        const [menuPoint, setMenuPoint] = useState(null);
        const [settingsAnchor, setSettingsAnchor] = useState(null);
        const [lastState, setLastState] = useState('idle');
        const [runtimeReady, setRuntimeReady] = useState(false);
        const [bootError, setBootError] = useState('');
        const [pipWindow, setPipWindow] = useState(null);
        const [detachedElsewhere, setDetachedElsewhere] = useState(false);
        const petRef = useRef(null);
        const stageRef = useRef(null);
        const rootRef = useRef(null);
        const runtimeRef = useRef(null);
        const settingsRef = useRef(settings);
        const positionRef = useRef(position);
        const dragRef = useRef(null);
        const pipRef = useRef(null);
        const rootParentRef = useRef(null);
        const savedPositionRef = useRef(null);

        settingsRef.current = settings;
        positionRef.current = position;

        const updateSettings = useCallback((patch) => {
          setSettings((current) => {
            const next = { ...current, ...patch };
            saveJson(STORAGE_KEY, next);
            return next;
          });
        }, []);

        const updatePosition = useCallback((next) => {
          const normalized = {
            x: clamp(Number(next.x) || 0.78, 0.03, 0.97),
            y: clamp(Number(next.y) || 0.64, 0.04, 0.96),
          };
          setPosition(normalized);
          saveJson(POSITION_KEY, normalized);
        }, []);

        const resetPosition = useCallback(() => {
          updatePosition({ x: 0.78, y: 0.64 });
        }, [updatePosition]);

        // 独立窗口（实验）：把整棵 .dm-root 移进 Document Picture-in-Picture 窗口，
        // 这样呆喵就是系统级置顶、可拖到屏幕任意位置的小窗。移动 DOM 而不是重建
        // Live2D 实例，尽量复用现有运行时。
        const restoreFromPip = useCallback(() => {
          const root = rootRef.current;
          const parent = rootParentRef.current;
          rootParentRef.current = null;
          if (root && parent) {
            try {
              parent.appendChild(root);
            } catch {
              // 原宿主可能已随页面卸载消失。
            }
          }
          if (savedPositionRef.current) {
            updatePosition(savedPositionRef.current);
            savedPositionRef.current = null;
          }
          pipRef.current = null;
          setPipWindow(null);
        }, [updatePosition]);

        const closePip = useCallback(() => {
          const pip = pipRef.current;
          try {
            pip?.close?.();
          } catch {
            // 窗口可能已被用户关闭。
          }
          restoreFromPip();
        }, [restoreFromPip]);

        const openPip = useCallback(async (event) => {
          event?.stopPropagation?.();
          setMenuPoint(null);
          if (pipRef.current) return;
          const report = (text) => {
            console.warn('[daimeow-dsh] detached window:', text);
            const clipped = text.length > 180 ? `${text.slice(0, 179)}…` : text;
            runtimeRef.current?.__emitSpeech(clipped);
          };
          const width = Math.max(260, Math.round(BASE_WIDTH * settings.scale) + 40);
          const height = Math.max(320, Math.round(BASE_HEIGHT * settings.scale) + 70);
          let win = null;
          let primaryError = null;
          let mode = 'pip';
          const api = window.documentPictureInPicture;
          if (api && typeof api.requestWindow === 'function') {
            try {
              win = await api.requestWindow({ width, height });
            } catch (error) {
              primaryError = error;
            }
          } else {
            primaryError = new Error('Document Picture-in-Picture API 不可用');
          }
          if (!win) {
            // 退回普通弹出窗口：不是系统级置顶，但仍是可拖到屏幕任意处的独立窗口。
            mode = 'popup';
            try {
              const left = Math.max(0, Math.round((window.screen.width - width) / 2));
              const top = Math.max(0, Math.round((window.screen.height - height) / 2));
              win = window.open('', 'daimeow-detached', `popup=yes,width=${width},height=${height},left=${left},top=${top}`);
            } catch {
              win = null;
            }
          }
          if (!win) {
            report(`独立窗口不可用：${primaryError?.name || 'Error'}: ${primaryError?.message || String(primaryError)}`);
            return;
          }
          try {
            const style = win.document.createElement('style');
            style.textContent = CSS;
            win.document.head.appendChild(style);
            win.document.documentElement.style.cssText = 'margin:0;padding:0;background:transparent;';
            win.document.body.style.cssText = 'margin:0;padding:0;width:100vw;height:100vh;overflow:hidden;background:transparent;';
            win.addEventListener('pagehide', restoreFromPip);
            const root = rootRef.current;
            if (root) {
              rootParentRef.current = root.parentNode;
              savedPositionRef.current = { ...positionRef.current };
              updatePosition({ x: 0.5, y: 0.5 });
              win.document.body.appendChild(root);
            }
            pipRef.current = win;
            setPipWindow(win);
            if (mode === 'popup') {
              runtimeRef.current?.__emitSpeech('PiP 不可用，已改用普通独立窗口（不置顶）');
            }
          } catch (error) {
            report(`窗口已打开但初始化失败：${error?.name || 'Error'}: ${error?.message || String(error)}`);
            try {
              win.close();
            } catch {
              // 窗口可能已被关闭。
            }
          }
        }, [settings.scale, updatePosition, restoreFromPip]);

        const closeDetached = useCallback(() => {
          fetch('/daimeow/detached/close', { method: 'POST' }).catch(() => {});
        }, []);

        const openDetached = useCallback(async (event) => {
          event?.stopPropagation?.();
          setMenuPoint(null);
          if (DETACHED) {
            closeDetached();
            return;
          }
          try {
            const response = await fetch('/daimeow/detached/open', { method: 'POST' });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) {
              runtimeRef.current?.__emitSpeech(`独立窗口打开失败：${data.error || response.status}`);
            } else {
              setDetachedElsewhere(true);
            }
          } catch (error) {
            runtimeRef.current?.__emitSpeech(`独立窗口打开失败：${error?.message || error}`);
          }
        }, [closeDetached]);

        const playAction = useCallback((name) => {
          const api = runtimeRef.current;
          if (!api) return false;
          if (name === 'hide') {
            updateSettings({ visible: false });
            api.__emitVisibility(false);
            setMenuPoint(null);
            setSettingsAnchor(null);
            setLastState('idle');
            return true;
          }
          if (name === 'show') {
            updateSettings({ visible: true });
            api.__emitVisibility(true);
            try {
              window.__daimeowApp?.ticker?.start?.();
            } catch {
              // The PIXI ticker may already be running.
            }
            return true;
          }
          if (name === 'reset') {
            updateSettings({ ...DEFAULT_SETTINGS, visible: true });
            resetPosition();
            api.__emitVisibility(true);
            api.__emitFps(DEFAULT_SETTINGS.fps);
            api.__emitFixed(false);
            api.__emitGamepadProbe(true);
            try {
              window.__daimeowApp?.ticker?.start?.();
            } catch {
              // The PIXI ticker may already be running.
            }
            return true;
          }
          const debug = window.__daimeowActionDebug;
          return debug?.trigger?.(name) === true;
        }, [resetPosition, updateSettings]);

        const closePet = useCallback(() => {
          updateSettings({ visible: false });
          runtimeRef.current?.__emitVisibility(false);
          try {
            window.__daimeowApp?.ticker?.stop?.();
          } catch {
            // The PIXI ticker may already be stopped.
          }
          setMenuPoint(null);
          setSettingsAnchor(null);
          setLastState('idle');
        }, [updateSettings]);

        useEffect(() => {
          const host = petRef.current;
          const stage = stageRef.current;
          const canvas = stage?.querySelector('#petCanvas');
          if (!host || !stage || !canvas) return undefined;

          const trackedUrls = new Set();
          const modelUrl = prepareModelUrl(trackedUrls);
          const api = createPetApi(modelUrl);
          runtimeRef.current = api;
          window.petAPI = api;
          window.__DAIMEOW_UI_ROOT__ = stage;
          window.__DAIMEOW_MOTION_NAMES__ = buildMotionNameTable(MODEL_DOCUMENT);
          window.__daimeowDSHReady = () => setRuntimeReady(true);

          const trackedWindowListeners = [];
          const realAdd = window.addEventListener;
          window.addEventListener = function trackedAdd(type, listener, options) {
            trackedWindowListeners.push([type, listener, options]);
            return realAdd.call(this, type, listener, options);
          };

          let cleanupMenu = () => {};
          const setMenuHandler = () => {
            cleanupMenu = () => api.__setMenuHandler(null);
            api.__setMenuHandler((point) => {
              setMenuPoint({
                x: point?.x ?? window.innerWidth - 250,
                y: point?.y ?? window.innerHeight - 280,
              });
              setSettingsAnchor(null);
            });
          };
          setMenuHandler();

          try {
            bootDaiMeowRuntime();
          } catch (error) {
            console.error('[daimeow-dsh] runtime boot failed', error);
            setBootError(error instanceof Error ? error.message : String(error));
          } finally {
            window.addEventListener = realAdd;
          }

          const resize = () => {
            if (!canvas.clientWidth || !canvas.clientHeight) return;
            api.__emitResize({ w: canvas.clientWidth, h: canvas.clientHeight });
          };
          const observer = new ResizeObserver(resize);
          observer.observe(canvas);
          requestAnimationFrame(resize);

          api.__emitVisibility(true);
          api.__emitFps(settingsRef.current.fps);
          api.__emitFixed(settingsRef.current.fixed);
          api.__emitGamepadProbe(settingsRef.current.gamepad);

          const handlePointerMove = (event) => {
            if (!settingsRef.current.pointerTracking || dragRef.current) return;
            const rect = stage.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            api.__emitMouse({
              relX: clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
              relY: clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
            });
          };
          stage.addEventListener('pointermove', handlePointerMove);

          return () => {
            observer.disconnect();
            stage.removeEventListener('pointermove', handlePointerMove);
            cleanupMenu();
            for (const [type, listener, options] of trackedWindowListeners) {
              try {
                window.removeEventListener(type, listener, options);
              } catch {
                // Detached listeners do not block unloading.
              }
            }
            api.__emitGamepadProbe(false);
            api.__emitVisibility(false);
            try {
              pipRef.current?.close?.();
            } catch {
              // The detached window may already be closed.
            }
            pipRef.current = null;
            window.__daimeowActionController?.stop?.();
            try {
              window.__daimeowApp?.destroy?.(true, { children: true, texture: true, baseTexture: true });
            } catch {
              // PIXI may already have disposed after an HMR replacement.
            }
            for (const url of trackedUrls) URL.revokeObjectURL(url);
            if (window.petAPI === api) delete window.petAPI;
            if (window.__DAIMEOW_UI_ROOT__ === stage) delete window.__DAIMEOW_UI_ROOT__;
            delete window.__DAIMEOW_MOTION_NAMES__;
            runtimeRef.current = null;
            window.__daimeowActionDebug = undefined;
            window.__daimeowActionController = undefined;
            window.__daimeowApp = undefined;
          };
        }, []);

        useEffect(() => {
          const api = runtimeRef.current;
          if (!api) return;
          api.__emitFps(settings.fps);
          api.__emitFixed(settings.fixed);
          api.__emitGamepadProbe(settings.gamepad);
        }, [settings.fps, settings.fixed, settings.gamepad]);

        useEffect(() => {
          if (!settings.visible) return;
          const canvas = stageRef.current?.querySelector('#petCanvas');
          if (!canvas) return;
          requestAnimationFrame(() => {
            if (!canvas.clientWidth || !canvas.clientHeight) return;
            runtimeRef.current?.__emitResize({
              w: canvas.clientWidth,
              h: canvas.clientHeight,
            });
          });
        }, [settings.scale, settings.visible]);

        useEffect(() => {
          const frame = petRef.current?.parentElement?.getBoundingClientRect();
          if (!frame?.width || !frame?.height) return;
          const halfWidth = (BASE_WIDTH * settings.scale) / 2;
          const halfHeight = (BASE_HEIGHT * settings.scale) / 2;
          const minX = Math.min(0.5, (halfWidth + 10) / frame.width);
          const maxX = Math.max(0.5, 1 - minX);
          const minY = Math.min(0.5, (halfHeight + 10) / frame.height);
          const maxY = Math.max(0.5, 1 - minY);
          const next = {
            x: clamp(position.x, minX, maxX),
            y: clamp(position.y, minY, maxY),
          };
          if (Math.abs(next.x - position.x) > 0.0005 || Math.abs(next.y - position.y) > 0.0005) {
            updatePosition(next);
          }
        }, [position.x, position.y, settings.scale, updatePosition]);

        useEffect(() => {
          if (!runtimeReady) return undefined;
          const controller = new AbortController();
          let stopped = false;
          const applyFrame = (frame) => {
            if (!frame) return;
            if (frame.type === 'daimeow/detached') {
              if (!DETACHED) setDetachedElsewhere(!!frame.open);
              return;
            }
            if (frame.type !== 'daimeow/snapshot' && frame.type !== 'daimeow/reaction') return;
            if (frame.action) playAction(frame.action);
            if (frame.speech) runtimeRef.current?.__emitSpeech(frame.speech);
            if (frame.state) setLastState(frame.state);
          };
          const consume = async () => {
            while (!stopped) {
              try {
                const response = await fetch('daimeow/events', {
                  headers: { accept: 'text/event-stream' },
                  signal: controller.signal,
                });
                if (!response.ok || !response.body) {
                  throw new Error(`daimeow/events answered ${response.status}`);
                }
                const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                for (;;) {
                  const { done, value } = await reader.read();
                  if (done || stopped) break;
                  buffer += typeof value === 'string' ? value : decoder.decode(value, { stream: true });
                  let separator;
                  while ((separator = buffer.indexOf('\n\n')) >= 0) {
                    const block = buffer.slice(0, separator);
                    buffer = buffer.slice(separator + 2);
                    const data = block
                      .split('\n')
                      .filter((line) => line.startsWith('data:'))
                      .map((line) => line.slice(5).trimStart())
                      .join('\n');
                    if (!data) continue;
                    try {
                      applyFrame(JSON.parse(data));
                    } catch (error) {
                      console.warn('[daimeow-dsh] invalid reaction frame', error);
                    }
                  }
                }
              } catch (error) {
                if (stopped || controller.signal.aborted) return;
                console.warn('[daimeow-dsh] reaction stream unavailable', error);
              }
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          };
          consume();
          return () => {
            stopped = true;
            controller.abort();
          };
        }, [runtimeReady, playAction]);

        useEffect(() => {
          const handleGesture = (event) => {
            if (event.button !== 0 || settingsRef.current.fixed) return;
            const host = petRef.current;
            const root = event.currentTarget;
            if (!host || !root) return;
            const rootRect = root.parentElement?.getBoundingClientRect();
            if (!rootRect) return;
            dragRef.current = {
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              startPosition: positionRef.current,
              rootRect,
              moved: false,
            };
            // 这里故意不做 setPointerCapture：运行时把点击反应的 pointerup
            // 挂在 .dm-stage 上，若把捕获设到祖先 .dm-pet，pointerup 会绕过
            // .dm-stage，左键点击就永远触发不了随机动作。
          };
          const handleMove = (event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            const dx = event.clientX - drag.startX;
            const dy = event.clientY - drag.startY;
            if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true;
            if (!drag.moved) return;
            updatePosition({
              x: drag.startPosition.x + dx / Math.max(1, drag.rootRect.width),
              y: drag.startPosition.y + dy / Math.max(1, drag.rootRect.height),
            });
          };
          const handleEnd = (event) => {
            const drag = dragRef.current;
            if (!drag || drag.pointerId !== event.pointerId) return;
            dragRef.current = null;
          };
          const root = petRef.current;
          const targets = pipWindow ? [window, pipWindow] : [window];
          root?.addEventListener('pointerdown', handleGesture);
          for (const target of targets) {
            target.addEventListener('pointermove', handleMove);
            target.addEventListener('pointerup', handleEnd);
            target.addEventListener('pointercancel', handleEnd);
          }
          return () => {
            root?.removeEventListener('pointerdown', handleGesture);
            for (const target of targets) {
              target.removeEventListener('pointermove', handleMove);
              target.removeEventListener('pointerup', handleEnd);
              target.removeEventListener('pointercancel', handleEnd);
            }
          };
        }, [updatePosition, pipWindow]);

        useEffect(() => {
          const close = (event) => {
            if (event.type === 'keydown' && event.key !== 'Escape') return;
            if (
              event.type === 'pointerdown'
              && event.target instanceof Element
              && event.target.closest('.dm-menu, .dm-panel, .dm-pet-button, .dm-tab')
            ) return;
            setMenuPoint(null);
            setSettingsAnchor(null);
          };
          const targets = pipWindow ? [window, pipWindow] : [window];
          for (const target of targets) {
            target.addEventListener('pointerdown', close);
            target.addEventListener('keydown', close);
          }
          return () => {
            for (const target of targets) {
              target.removeEventListener('pointerdown', close);
              target.removeEventListener('keydown', close);
            }
          };
        }, [pipWindow]);

        useEffect(() => {
          if (DETACHED) return undefined;
          let stopped = false;
          fetch('/daimeow/detached/status')
            .then((response) => response.json())
            .then((data) => {
              if (!stopped) setDetachedElsewhere(!!data.open);
            })
            .catch(() => {});
          return () => {
            stopped = true;
          };
        }, []);

        useEffect(() => {
          if (!DETACHED) return undefined;
          try {
            document.documentElement.style.background = 'transparent';
            document.body.style.background = 'transparent';
            document.body.style.overflow = 'hidden';
          } catch {
            // Styling the detached window is best-effort.
          }
          const root = rootRef.current;
          if (root) {
            let node = root;
            while (node && node.parentElement && node.parentElement !== document.body) {
              for (const sibling of [...node.parentElement.children]) {
                if (sibling !== node) sibling.style.display = 'none';
              }
              node.style.background = 'transparent';
              node = node.parentElement;
            }
            for (const child of [...document.body.children]) {
              if (!child.contains(root)) child.style.display = 'none';
            }
          }
          const strip = document.createElement('div');
          strip.style.cssText = 'position:fixed;top:0;left:0;right:0;height:24px;z-index:2147483000;-webkit-app-region:drag;';
          const closeButton = document.createElement('button');
          closeButton.textContent = '×';
          closeButton.style.cssText = 'position:absolute;right:4px;top:2px;width:20px;height:20px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;font:14px/20px sans-serif;padding:0;cursor:pointer;-webkit-app-region:no-drag;';
          closeButton.addEventListener('click', () => window.close());
          strip.appendChild(closeButton);
          document.body.appendChild(strip);
          return () => {
            strip.remove();
          };
        }, []);

        const openSettings = useCallback((event) => {
          const rect = event?.currentTarget?.getBoundingClientRect?.();
          setMenuPoint(null);
          setSettingsAnchor(rect
            ? { x: rect.right + 6, y: rect.bottom + 6 }
            : { x: window.innerWidth - 20, y: window.innerHeight - 20 });
        }, []);

        const stageWidth = Math.round(BASE_WIDTH * settings.scale);
        const stageHeight = Math.round(BASE_HEIGHT * settings.scale);

        const hidden = !settings.visible;

        return h(React.Fragment, null,
          h('style', null, CSS),
          h('div', { ref: rootRef, className: 'dm-root', style: { zIndex: settings.alwaysOnTop ? 2147483000 : undefined, display: detachedElsewhere ? 'none' : undefined } },
            h('div', {
              ref: petRef,
              className: `dm-pet${settings.fixed ? ' is-fixed' : ''}`,
              style: {
                left: `${position.x * 100}%`,
                top: `${position.y * 100}%`,
                width: stageWidth,
                height: stageHeight,
                opacity: settings.opacity,
                pointerEvents: settings.clickThrough ? 'none' : 'auto',
                display: hidden ? 'none' : undefined,
              },
              onContextMenu: (event) => {
                event.preventDefault();
                event.stopPropagation();
                setSettingsAnchor(null);
                setMenuPoint({ x: event.clientX, y: event.clientY });
              },
            },
            h('div', { ref: stageRef, className: 'dm-stage' },
              h('canvas', { id: 'petCanvas', 'aria-label': 'DaiMeow Live2D pet' }),
              h('div', { id: 'speech-bubble', role: 'status', 'aria-live': 'polite' }),
              PROP_IDS.map(([id, source, key]) => h('img', {
                key,
                id,
                className: 'prop',
                src: ASSET_DATA[source],
                'data-src': ASSET_DATA[source],
                alt: '',
                draggable: false,
              })),
            ),
            bootError && h('div', {
              style: {
                position: 'absolute',
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 72,
                pointerEvents: 'none',
              },
              title: bootError,
            }, '🐱'),
          ),
          hidden && h('button', {
            type: 'button',
            className: 'dm-tab',
            onClick: () => {
              updateSettings({ visible: true });
              runtimeRef.current?.__emitVisibility(true);
              try {
                window.__daimeowApp?.ticker?.start?.();
              } catch {
                // The PIXI ticker may already be running.
              }
            },
          }, '🐾 ', t('pet.show')),
          settings.clickThrough && settings.visible && h('button', {
            type: 'button',
            className: 'dm-tab',
            onClick: () => updateSettings({ clickThrough: false }),
          }, '🐾 ', t('settings.restoreInteraction')),
          settings.visible && menuPoint && h(ContextMenu, {
            t,
            point: menuPoint,
            settings,
            onChange: updateSettings,
            onAction: (name) => {
              playAction(name);
              setMenuPoint(null);
            },
            onReset: () => {
              playAction('reset');
              setMenuPoint(null);
            },
            onClosePet: () => {
              closePet();
              setMenuPoint(null);
            },
            onDetach: openDetached,
          }),
          settingsAnchor && h(SettingsPanel, {
            t,
            value: settings,
            onChange: updateSettings,
            onClose: () => setSettingsAnchor(null),
            onResetPosition: resetPosition,
            anchor: settingsAnchor,
          }),
          ),
          detachedElsewhere && !DETACHED && h('button', {
            type: 'button',
            className: 'dm-tab',
            style: { position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000 },
            onClick: closeDetached,
          }, '⧉ ', t('menu.closePip')),
          pipWindow && h('button', {
            type: 'button',
            className: 'dm-tab',
            style: { position: 'fixed', right: 16, bottom: 16, zIndex: 2147483000 },
            onClick: closePip,
          }, '⧉ ', t('menu.closePip')),
        );
      };
    }

    return {
      inject: ['slots', 'locale'],
      async apply(ctx) {
        ctx.effect(
          () => ctx.locale.register('daimeow-dsh', COPY),
          'daimeow-dsh: locale dictionary',
        );
        const DaiMeowOverlay = createDaiMeowComponent(ctx);
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'daimeow-dsh',
          order: 40,
        }, DaiMeowOverlay));
      },
    };
  },
});
