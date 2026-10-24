# DaiMeow DSH — Codex 交接说明

> 这是给 Codex（或任何接手的编码 Agent）的项目说明。开始改动前请完整读完本文与 `README.md` 的关键部分。

## 1. 项目是什么

`daimeow-dsh` 是 DeepSeek Harness（DSH）的桌宠插件：把 DaiMeow 的 Live2D 模型、21 个动作、待机/点击互动、拖动、视线跟随、气泡和右键菜单移植到 DSH。

当前形态：**桌面全屏模式是唯一模式**。

- DSH 页面内不再渲染窗口桌宠（`src/client.template.js` 中 `WEB_UI = false`）。
- 插件 Host 在启用时自动拉起一个**独立的 Electron helper**，创建一个覆盖主屏的透明、无边框、置顶、默认点击穿透的窗口，在里面跑 Live2D 呆喵。
- DSH 页面只保留一个右下角“🐾 显示呆喵”胶囊（桌面窗口被隐藏时出现）。

## 2. 目录结构

```
DaiMeow DSH/
├─ index.js                     # Host（Cordis 插件，跑在 DSH Host 子 Node 进程）
├─ src/client.template.js       # 客户端源码模板（构建输入）
├─ client.js                    # 构建产物（不要手改）
├─ scripts/build-client.mjs     # 生成 client.js（内嵌模型/道具/运行时）
├─ scripts/build-helper.mjs     # 生成 helper 的 assets.js / runtime.js
├─ runtime/
│  ├─ live2dcubismcore.js       # Cubism Core（构建输入）
│  ├─ pet-bundle.js             # 原 DaiMeow 打包运行时（构建输入）
│  └─ electron-helper/          # 独立 Electron 桌面层
│     ├─ main.js                # 全屏透明置顶窗口、托盘、IPC、stdin 帧、可见性上报
│     ├─ preload.js             # contextBridge: petWindow
│     ├─ index.html             # 全屏透明页面 + 菜单样式
│     ├─ pet-renderer.js        # 最小 petAPI、Live2D 启动、菜单/拖动/点击穿透
│     ├─ package.json           # "type": "commonjs"（必须保留）
│     ├─ assets.js              # 构建产物（模型/道具 data URI）
│     └─ runtime.js             # 构建产物（Cubism+Pixi+运行时）
├─ assets/model/daimeow/        # Live2D 模型与 21 个 motion
├─ assets/props/                # 道具图片
├─ locale/{zh,en}.json          # 插件元数据
├─ cordis.patch.yml             # 插件安装 patch（config: autoReactions, desktop）
├─ package.json
├─ README.md
└─ AGENTS.md                    # 本文件
```

## 3. 架构与数据流

### Host（`index.js`，跑在 DSH 的 Host 子进程）

- `inject = ['tools', 'webServer']`。
- `DaiMeowService`：向 SSE 客户端广播 `daimeow/reaction` 帧；`service.onFrame` 会把同样的帧写进桌面 helper 的 stdin（`dsh-pet-frame:{json}`）。
- 路由：
  - `GET /daimeow/events`：SSE。
  - `POST /daimeow/detached/open`：spawn helper。
  - `POST /daimeow/detached/close`：kill helper。
  - `GET /daimeow/detached/status`：`{ ok, open, visible }`。
  - `POST /daimeow/detached/show`：向 helper stdin 写 `{"action":"show"}`。
- 配置：`autoReactions`（默认 true）、`reactionThrottleMs`（默认 1200）、`desktop`（默认 true，启用时自动拉起 helper）。
- 工具：`pet_say`、`pet_control`、`pet_status`。
- Electron 可执行文件解析顺序：`DSH_PET_ELECTRON_PATH` → `~/.dsh/electron/electron.exe`（由 dsh-pet 下载，当前 v43.3.0）。

### 桌面 helper（`runtime/electron-helper/`）

- `main.js`：全屏 workArea 透明置顶窗口，`focusable: false`（不抢焦点），默认 `setIgnoreMouseEvents(true, { forward: true })`，托盘（显示/隐藏/恢复交互/退出），读 stdin 帧转发给渲染端，窗口 show/hide 时向 stdout 写 `dsh-pet-visibility:true/false`。
- 渲染端：`pet-renderer.js` 提供最小 `petAPI`，启动原 DaiMeow Live2D 运行时；光标进入呆喵/菜单范围才把窗口切成可交互，其余区域穿透；右键菜单（动作折叠、调整、固定/穿透/置顶、恢复默认、隐藏、关闭）。
- 通信：Host ↔ helper 走 stdin/stdout；**不要**让 helper 直接请求 DSH WebServer（DSH 的浏览器访问闸门会对独立进程裸 HTTP 返回 403，dsh-pet 项目也遇到了同样问题）。

## 4. 构建与验证

在本目录执行：

```powershell
# 客户端
node scripts/build-client.mjs
node --check client.js

# helper 资源（生成 assets.js / runtime.js）
node scripts/build-helper.mjs
node --check runtime/electron-helper/main.js
node --check runtime/electron-helper/preload.js
node --check runtime/electron-helper/pet-renderer.js

# Host
node --check index.js

# 或一次跑完
npm run build
npm run check
```

注意：`client.js`、`runtime/electron-helper/assets.js`、`runtime/electron-helper/runtime.js` 都是**生成文件**。改源码后重新构建，不要直接编辑它们。

## 5. 安装、重载与验证

- 插件已通过 DSH 插件管理链接/安装到当前 profile。
- **不要手工改 DSH profile 的 `package.json` 或 `cordis.patch.yml`**；安装、停用、启用走 DSH 的“插件”管理界面。
- 客户端改动：构建 `client.js` 后**刷新 DSH 页面**。
- Host 改动：`node --check index.js` 后**停用再启用插件**（或重启 DSH）。
- helper 改动：`node --check` 后停用/启用插件，让 helper 重新启动。
- 桌面窗口默认整屏点击穿透；若异常挡住桌面，用托盘“退出呆喵”，或在 DSH 页面点“收回/显示”入口。

## 6. 硬性约束

1. **不要修改** `C:\PROJECTs\Codex\DaiMeow`（原始 DaiMeow 项目），它只作为动作/渲染实现参考。
2. **不要手工改** DSH profile 的 `package.json` / `cordis.patch.yml`；用插件管理界面。
3. 不要在无人值守/自动化测试里随意启动桌面 helper：它会创建覆盖主屏的窗口。需要验证时先告知用户，或只做 `node --check` / 构建。
4. 不要移除 `runtime/electron-helper/package.json` 的 `"type": "commonjs"`，否则 `require('electron')` 会失效。
5. 不要在 helper `main.js` 里重新加 `process.stdin.on('close', () => app.quit())`：Electron 主进程的 stdin 可能一开始就是关闭态，会导致窗口刚建就退出、页面 `ERR_FAILED`。当前已移除。
6. 不要假设 Host 能拿到 DSH 的 Electron：DSH Host 是独立 Node 子进程，`require('electron')` 没有 `BrowserWindow`；桌面窗口必须由这里自带的 Electron helper 创建。

## 7. 当前状态与已知问题

已完成：

- Live2D 渲染、21 个动作、站/坐、待机/点击/拖动/视线、气泡、菜单、设置。
- 动作名解析修复（data URI 导致 basename 失效 → 注入 `__DAIMEOW_MOTION_NAMES__`）。
- 吃薯片手部贴图残留修复（chips 渲染器显式写回 opacity）。
- 桌面全屏模式：自动拉起、托盘、点击穿透、焦点不抢占、菜单交互。
- 隐藏后 DSH 页面右下角“显示呆喵”胶囊（Host `visible` + `/show` + 客户端轮询）。

已知/待确认：

- “显示呆喵”按钮依赖 Host 新路由与 helper 可见性上报，**必须停用/启用插件 + 刷新页面**才生效；1.5s 轮询延迟。
- 仅覆盖主显示器；多屏未处理。
- helper 崩溃后不会自动重启；需要重载插件。
- 依赖 dsh-pet 下载的 `~/.dsh/electron`；如果该目录不存在，需要设置 `DSH_PET_ELECTRON_PATH` 或补 `@electron/get` 自动下载。
- 右键菜单打开后光标离开菜单/呆喵会自动收起（为了让全屏层恢复穿透、滚轮能操作其他程序）。
- “关闭呆喵”只退出 helper，不改变插件启停状态。

## 8. 建议的第一步

接手后先只读确认，不要立刻重构：

1. 读 `README.md`、`index.js`、`src/client.template.js`、`scripts/build-client.mjs`、`scripts/build-helper.mjs`、`runtime/electron-helper/*`。
2. 跑 `npm run build` 与 `npm run check`，确认基线可构建。
3. 用 `git status`/文件时间确认没有未预期的外部改动（当前目录尚未初始化 git；建议先 `git init` 并提交基线，方便回滚）。
4. 向用户确认下一步任务，再动代码。

## 9. 常用排查

- 桌面窗口没出现：看 Host 控制台的 `[daimeow-helper]` 日志；确认 `~/.dsh/electron/electron.exe` 存在；确认插件已重载。
- 页面没有“显示呆喵”：确认 Host 已重载（`GET /daimeow/detached/status` 应返回 `visible` 字段），并刷新页面。
- 菜单/点击异常：检查 `pet-renderer.js` 的 `setIgnoreMouseEvents` 状态缓存与 `menu` 事件拦截；不要恢复“鼠标每动一次都发 IPC”的写法。
- 动作不播：检查 `build-client.mjs` / `build-helper.mjs` 的运行时补丁是否全部命中（构建脚本会在补丁目标缺失时抛错）。
