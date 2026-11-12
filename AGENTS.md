# DaiMeow DSH — Codex 交接说明

> 这是给 Codex（或任何接手的编码 Agent）的项目说明。开始改动前请完整读完本文与 `README.md` 的关键部分。

## 1. 项目是什么

`daimeow-dsh` 是 DeepSeek Harness（DSH）的桌宠插件：把 DaiMeow 的 Live2D 模型、21 个动作、待机/点击互动、拖动、视线跟随、气泡和右键菜单移植到 DSH。

当前形态：**桌面全屏模式是唯一模式**。

- DSH 页面客户端只保留一个轻量“显示呆喵”启动器，不再内嵌模型或 Live2D 运行时。
- 插件 Host 在启用时自动拉起一个**独立的 Electron helper**，创建一个覆盖主屏的透明、无边框、置顶、默认点击穿透的窗口，在里面跑 Live2D 呆喵。
- DSH 页面只保留一个右下角“🐾 显示呆喵”胶囊（桌面窗口被隐藏时出现）。

## 2. 目录结构

```
DaiMeow DSH/
├─ index.js                     # Host（Cordis 插件，跑在 DSH Host 子 Node 进程）
├─ electron-runtime.js          # Electron 路径探测、自动下载和解压
├─ src/client.template.js       # DSH 页面轻量启动器源码
├─ client.js                    # 构建产物（由启动器模板复制生成，不要手改）
├─ screen-reply.js              # 截图回复人格、25 字解析、payload 校验
├─ test/                        # 截屏回复和 Electron 运行时纯逻辑测试
├─ scripts/build-client.mjs     # 生成轻量 client.js
├─ scripts/build-helper.mjs     # 生成 helper 的 assets.js / runtime.js
├─ runtime/
│  ├─ live2dcubismcore.js       # Cubism Core（构建输入）
│  ├─ pet-bundle.js             # 原 DaiMeow 打包运行时（构建输入）
│  └─ electron-helper/          # 独立 Electron 桌面层
│     ├─ main.js                # 全屏透明置顶窗口、托盘、IPC、控制服务器、截屏
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

- `inject = ['tools', 'webServer', 'llm', 'agentDefaultModel']`。
- `DaiMeowService`：向 SSE 客户端广播 `daimeow/reaction` 帧；`service.onFrame` 通过 helper 上报的本机回环 HTTP 控制地址下发帧。
- 左键截屏识图：helper 将 480×270 JPEG 写入 stdout；Host 存入 DSH 附件服务，用 `ctx.llm.stream()` 调当前多模态模型，再把动作和台词回传呆喵。人格固定为原 DaiMeow 的“元气随从喵”，台词硬截断到 25 字；模型支持时默认传 `reasoningEffort: off`，内置 5 秒冷却。
- Electron 运行时：不需要安装 `dsh-pet`。依次检查 `DSH_DAIMEOW_ELECTRON_PATH`、兼容变量 `DSH_PET_ELECTRON_PATH`、`$DSH_HOME/electron`；都没有时用 `@electron/get` 从 npmmirror 下载、`extract-zip` 解压，并在下次启动复用。
- 路由：
  - `GET /daimeow/events`：SSE。
  - `POST /daimeow/detached/open`：spawn helper。
  - `POST /daimeow/detached/close`：请求 helper 走与菜单/托盘相同的停用插件流程。
  - `POST /daimeow/detached/disable-result`：浏览器侧通过 DSH Remote 停用插件后回报失败或未应用结果。
  - `GET /daimeow/detached/status`：helper、可见性、控制通道、停用请求和截屏状态。
  - `POST /daimeow/detached/show`：通过本机 HTTP 控制通道显示 helper。
  - `POST /daimeow/detached/hide`：通过本机 HTTP 控制通道隐藏 helper，并等待可见性回报。
  - `POST /daimeow/detached/recover-interaction`：关闭鼠标穿透并恢复置顶，等价于托盘“恢复交互”。
  - `POST /daimeow/detached/diagnostics`：读取主进程命中检测状态。
  - `POST /daimeow/detached/capture`：触发一次截屏识图（同样受 5 秒冷却）。
- 配置：`autoReactions`（默认 true）、`reactionThrottleMs`（默认 1200）、`desktop`（默认 true，启用时自动拉起 helper）。
- 工具：`pet_say`、`pet_control`、`pet_status`；`pet_control` 额外支持 `capture_screen`。
- Electron 可执行文件解析顺序：`DSH_DAIMEOW_ELECTRON_PATH` → `DSH_PET_ELECTRON_PATH` → `~/.dsh/electron/electron.exe` → 自动下载。

### 桌面 helper（`runtime/electron-helper/`）

- `main.js`：全屏 workArea 透明置顶窗口，`focusable: true` 但用 `showInactive()` 显示，交互释放后立即 `blur()`；主进程按真实光标位置切换 `setIgnoreMouseEvents`，不再使用 `forward: true`。托盘（显示/隐藏/恢复交互/退出）、IPC、本机控制服务器和截屏服务都在这里。
- 渲染端：`pet-renderer.js` 提供最小 `petAPI`，启动原 DaiMeow Live2D 运行时；光标进入呆喵/菜单范围才把窗口切成可交互，其余区域穿透；右键菜单（动作折叠、调整、固定/穿透/置顶、恢复默认、隐藏、关闭）。
- 通信：stdout 用于状态和截图上报；Host → helper 使用 stdout 公布的 `127.0.0.1` 随机令牌控制地址。**不要**让 helper 直接请求 DSH WebServer。

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
npm test
```

注意：`client.js`、`runtime/electron-helper/assets.js`、`runtime/electron-helper/runtime.js` 都是**生成文件**。改源码后重新构建，不要直接编辑它们。`client.js` 只包含启动器，模型和 Live2D 运行时只嵌入 helper。

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

- “显示呆喵”入口依赖 helper 可见性上报；页面通常在一个 1.5 秒轮询周期内更新，重新聚焦或重新可见时会立即刷新。改动 Host/helper 后仍需停用/启用插件。
- 仅覆盖主显示器；多屏未处理。
- helper 异常退出时会尝试同步停用插件，避免出现“程序已退出、插件仍开启”的状态；不会自动重启。
- Electron 首次启用时自动下载到 `~/.dsh/electron`；下载失败时可设置 `DSH_DAIMEOW_ELECTRON_PATH`，或配置镜像后重试。
- 右键菜单打开后光标离开菜单/呆喵会自动收起（为了让全屏层恢复穿透、滚轮能操作其他程序）。
- 截图会发送给 DSH 当前选择的多模态模型；模型必须支持图片输入。
- 截图会写入 DSH 附件服务，实际保留和回收策略由 DSH 附件存储决定。

## 8. 建议的第一步

接手后先只读确认，不要立刻重构：

1. 读 `README.md`、`index.js`、`src/client.template.js`、`scripts/build-client.mjs`、`scripts/build-helper.mjs`、`runtime/electron-helper/*`。
2. 跑 `npm run build` 与 `npm run check`，确认基线可构建。
3. 用 `git status`/文件时间确认没有未预期的外部改动。
4. 向用户确认下一步任务，再动代码。

## 9. 常用排查

- 桌面窗口没出现：先看 `[daimeow-electron]` 下载日志，再检查 `[daimeow-helper]`；确认 `~/.dsh/electron/electron.exe` 存在或由环境变量指定；确认插件已重载。
- 页面没有“显示呆喵”：确认 Host 已重载（`GET /daimeow/detached/status` 应返回 `visible` 字段），并刷新页面。
- 菜单/点击异常：检查 `pet-renderer.js` 的 `setIgnoreMouseEvents` 状态缓存与 `menu` 事件拦截；不要恢复“鼠标每动一次都发 IPC”的写法。
- 动作不播：检查 `build-helper.mjs` 的运行时补丁是否全部命中（构建脚本会在补丁目标缺失时抛错）。
