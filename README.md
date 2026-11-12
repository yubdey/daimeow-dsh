# 呆喵 DSH（daimeow-dsh）

DeepSeek Harness（DSH）桌面桌宠插件。它把
[DaiMeow](https://github.com/yubdey/DaiMeow) 的 Live2D 模型、动作状态机、交互和
Agent 联动接入 DSH。

当前唯一运行形态是**桌面全屏模式**：

- DSH Host 启用插件后，自动启动一个独立的 Electron helper。
- helper 在**主显示器工作区**创建透明、无边框、置顶、默认点击穿透的窗口。
- Live2D 呆喵显示在桌面而不是 DSH 页面内。
- DSH 页面只保留一个在桌面呆喵隐藏时出现的“🐾 显示呆喵”入口。
- 桌宠与 DSH 通过 stdout 状态回报、本机回环 HTTP 控制通道和本地路由通信。

## 安装

### 1. 确认 DSH Desktop 可用

安装前请先确保 DeepSeek Harness Desktop 已安装并能正常启动。

### 2. 准备 Electron 运行时

呆喵 DSH 会启动一个独立的 Electron 桌面层，但**不需要安装 `dsh-pet`**。

插件启用时会先检查以下位置：

```text
%USERPROFILE%\.dsh\electron\electron.exe
```

如果不存在，插件会自动从 npmmirror 下载 Electron 43.3.0，解压到该目录后继续
启动。首次启动只会下载一次，后续直接复用。下载进度会显示在 DSH 控制台，完整
过程最长等待 10 分钟。

也可以手动指定已有运行时：

- `DSH_DAIMEOW_ELECTRON_PATH`：推荐，指向现有的 `electron.exe`；
- `DSH_PET_ELECTRON_PATH`：兼容旧配置；
- `DSH_DAIMEOW_ELECTRON_VERSION`：覆盖自动下载的 Electron 版本；
- `DSH_DAIMEOW_ELECTRON_MIRROR`：覆盖默认下载镜像。

设置环境变量后需要重启 DSH。下载失败只影响桌面呆喵，重新点击“显示呆喵”会
再次尝试下载。

### 3. 从 GitHub 安装插件

1. 打开 DSH Desktop。
2. 进入左侧的“插件”页面。
3. 点击“添加插件”。
4. 填写本仓库地址：

   ```text
   https://github.com/yubdey/daimeow-dsh.git
   ```

5. 确认安装。若 DSH 提示需要重启，请重启后再继续。
6. 在“已安装插件”中找到“呆喵桌宠”，打开右侧开关。

插件启用后会自动启动桌面 helper，主显示器上应出现 Live2D 呆喵。

### 4. 检查识图功能

左键点击呆喵会使用 DSH 当前配置的模型和 API Key 分析主屏截图，因此需要：

- DSH 中已经配置可用的模型和凭据；
- 当前模型支持图片输入；
- DSH 附件服务可用。

如果暂时不切换多模态模型，桌宠显示、动作、拖动和菜单仍可正常使用。

### 本地目录安装

开发时也可以先克隆仓库，再把本地绝对路径作为插件来源：

```powershell
git clone https://github.com/yubdey/daimeow-dsh.git
```

随后在 DSH 插件管理器中添加克隆后的 `daimeow-dsh` 目录。不要手工修改 DSH
profile 的 `package.json` 或 `cordis.patch.yml`。

## 功能

- Live2D 模型与 21 个动作，包含站姿、坐姿和随机待机状态机。
- 点击互动、拖动、鼠标视线跟随、气泡台词和右键菜单。
- 左键点击呆喵时截取主屏画面，调用 DSH 当前多模态模型识别内容并生成呆喵
  口吻的短回复；使用原 DaiMeow 的“元气随从喵”人格，回复严格限制在 25 字内，
  连续触发内置 5 秒冷却。模型声明支持时默认以 `reasoningEffort: off` 请求，
  不支持关闭思考的服务商会自动省略该参数以保持兼容。
- 鼠标穿透：渲染端上报呆喵/菜单命中区域，主进程按真实屏幕光标位置切换
  `setIgnoreMouseEvents`，因此隐藏后重新显示也能恢复交互。
- 控制通道：helper 启动后通过 stdout 上报本机回环 HTTP 地址。宿主用该地址
  下发显示/隐藏和动作帧，绕开 Windows Electron 主进程无法接收管道 stdin 的
  限制；若显示请求未及时确认，宿主还会通过 Electron 单实例唤醒机制兜底。
- 穿透状态不再使用 `forward: true`，避免交互后全屏层继续截获滚轮；菜单打开
  时由主进程临时锁定完整交互，关闭后立即恢复穿透。
- helper 以 `showInactive` 显示，不主动抢焦点；实际点击或打开菜单时允许窗口
  短暂获得焦点，左键释放或菜单关闭后立即失焦，确保鼠标按下事件完整送达。
- 窗口置顶、隐藏/显示、托盘菜单和“恢复交互”。
- `pet_say`、`pet_control`、`pet_status` 三个 Agent 工具。
- Agent 开始工作、调用工具和结束轮次时自动播放动作及短台词。
- 位置、大小、透明度、固定位置、鼠标穿透、置顶和显隐状态持久化。
- 中英文插件元数据。

原独立 DaiMeow 的 AI 服务商配置和聊天历史面板不属于本插件。截屏点评已改为
左键点击触发，并复用 DSH 当前模型和凭据；插件自身不保存 API Key。

## 运行架构

```text
DSH Web UI
  └─ daimeow-dsh client
       └─ 仅渲染“显示呆喵”启动胶囊
            │
            ▼
DSH Host / index.js
  ├─ 注册 /daimeow/events（SSE）
  ├─ 注册 /daimeow/detached/{open,close,disable-result,status,show,hide,recover-interaction,diagnostics,capture}
  ├─ 提供 pet_say / pet_control / pet_status
  └─ 启动独立 Electron helper
            │ stdout 发现控制端口 / 本机 HTTP 下发帧
            ▼
runtime/electron-helper
  ├─ main.js          透明全屏覆盖层、托盘、IPC、主进程命中检测
  ├─ preload.js       contextBridge 安全桥
  ├─ pet-renderer.js  Live2D、菜单、拖动、点击穿透
  ├─ assets.js        内嵌模型和道具素材
  └─ runtime.js       内嵌 Cubism/Pixi/DaiMeow 运行时
```

### 数据流

1. DSH Host 收到 Agent 工具结果或会话事件后生成 `daimeow/reaction` 帧。
2. `DaiMeowService.onFrame` 把帧 POST 到 helper 在 stdout 中公布的本机控制地址。
3. helper 主进程通过 IPC 将帧传给渲染端，播放 Live2D 动作和气泡。
4. helper 在窗口显示/隐藏时通过 stdout 返回 `dsh-pet-visibility:true/false`。
5. DSH 页面轮询 `/daimeow/detached/status`：发现 `disableRequest` 时使用
   DSH Remote 的 `pluginManager.setBundleEnabled()` 停用插件；发现窗口隐藏时
   显示恢复入口。页面重新聚焦或重新可见时会立即刷新一次，不受后台定时器节流影响。
6. 左键点击后，helper 用 `desktopCapturer` 截取主屏并压缩为 480×270 JPEG；
   Host 将其写入 DSH 附件服务，再通过 `ctx.llm.stream()` 请求当前视觉模型。
   回复按“元气随从喵”人格生成并硬截断到 25 字，随后解析为场景标签、Live2D
   动作和气泡台词。视觉请求会先检查模型能力，支持时默认关闭思考模式。

helper 与 Host 的控制连接只绑定 `127.0.0.1`，路径带每次启动随机生成的令牌；
Host 不请求 DSH WebServer，因此不受浏览器访问闸门影响。

## 目录结构

```text
DaiMeow DSH/
├─ index.js                       Host 插件、工具、路由、helper 生命周期
├─ electron-runtime.js            Electron 自动下载、解压和路径解析
├─ src/client.template.js         DSH 页面轻量启动器源码
├─ client.js                      轻量启动器构建产物，不直接编辑
├─ screen-reply.js                截图回复人格、25 字解析和 payload 校验
├─ test/                          截图回复和 Electron 运行时测试
├─ scripts/
│  ├─ build-client.mjs            构建 DSH 页面启动器
│  └─ build-helper.mjs            构建 helper 的模型与运行时资源
├─ runtime/
│  ├─ live2dcubismcore.js         Cubism Core 构建输入
│  ├─ pet-bundle.js               DaiMeow 运行时构建输入
│  └─ electron-helper/
│     ├─ main.js                  全屏透明窗口、托盘、IPC、控制服务器
│     ├─ preload.js               contextBridge 接口
│     ├─ index.html               桌面覆盖层页面
│     ├─ pet-renderer.js          Live2D 与桌面交互
│     ├─ assets.js                构建产物，不直接编辑
│     └─ runtime.js               构建产物，不直接编辑
├─ assets/
│  ├─ model/daimeow/              模型、贴图和 motion
│  └─ props/                      道具素材
├─ locale/{zh,en}.json
├─ cordis.patch.yml
├─ package.json
├─ AGENTS.md
└─ README.md
```

## 环境要求

- 已安装并可运行的 DSH Desktop。
- 首次启用桌面呆喵时需要联网下载 Electron；之后使用本地缓存。
- Electron 按以下顺序解析：
  1. 环境变量 `DSH_DAIMEOW_ELECTRON_PATH`
  2. 环境变量 `DSH_PET_ELECTRON_PATH`
  3. `%USERPROFILE%\.dsh\electron\electron.exe`

都不存在时，插件会通过 `@electron/get` 自动下载并解压。

`@electron/get` 和 `@electron-internal/extract-zip` 由 DSH 插件管理器随插件
自动安装；仓库中已经包含构建产物，普通安装用户不需要手动运行 npm。

## 构建

在插件根目录运行：

```powershell
npm run build
npm run check
npm test
```

`npm run build` 会执行两个构建脚本：

```text
scripts/build-client.mjs
scripts/build-helper.mjs
```

生成文件：

- `client.js`
- `runtime/electron-helper/assets.js`
- `runtime/electron-helper/runtime.js`

不要直接编辑上述生成文件。DSH 页面客户端只负责“显示呆喵”启动器，模型和
Live2D 运行时只嵌入桌面 helper，不再重复放进 `client.js`。

## 配置

插件配置位于 `cordis.patch.yml`：

```yaml
- insert:
    - id: daimeow-dsh
      name: 'daimeow-dsh'
      config:
        autoReactions: true
        desktop: true
```

| 字段 | 默认值 | 说明 |
|---|---:|---|
| `autoReactions` | `true` | 根据 Agent 轮次和工具事件自动播放反应 |
| `reactionThrottleMs` | `1200` | 同类自动反应的节流时间 |
| `desktop` | `true` | 插件启用时自动启动桌面 helper |

不要手工修改 DSH profile 的 `package.json` 或 profile 级 `cordis.patch.yml`。
安装、启停和配置应通过 DSH 插件管理界面或该 bundle 自己的 patch 完成。

## 使用

- 左键点击呆喵：触发互动动作，并截屏识图生成一句评论；5 秒内重复点击不会
  再次请求模型。
- 拖动呆喵：改变位置并保存。
- 右键呆喵：打开动作、调整和显示菜单。
- 右键菜单可调整 `0.75x / 1.0x / 1.25x`、透明度、固定位置、鼠标穿透和置顶。
- 托盘菜单提供显示、隐藏、恢复交互和退出呆喵。
- 托盘中的“退出呆喵”与呆喵右键菜单的“关闭呆喵”共用同一停用流程，都会同步
  关闭 DSH 插件。
- 若开启鼠标穿透无法再次点到呆喵，可从托盘选择“恢复交互”。
- “关闭呆喵”由浏览器侧调用 DSH Remote 停用 `daimeow-dsh` 插件，再由插件清理
  effect 退出 helper；这样与插件页开关使用同一条 HMR 安全路径，而不是只退出 helper。

## Agent 工具

- `pet_say(text, action?, durationMs?)`：让呆喵说一句短话。
- `pet_control(action)`：播放动作、坐下/站起、显示/隐藏、截屏识图或恢复默认。
- `pet_status()`：读取连接数、helper 状态、最近反应和动作列表。

可用动作包括 `nod`、`happy`、`cheer`、`hello`、`thinking`、`idea`、`sit`、
`stand_up`、`capture_screen` 等。

## 开发与重载

| 修改内容 | 操作 |
|---|---|
| `src/client.template.js` | `npm run build` 后刷新 DSH 页面 |
| `runtime/electron-helper/*` | `npm run build`，然后停用/启用插件 |
| `runtime/*` 或 `assets/*` | `npm run build`，然后停用/启用插件 |
| `index.js` | 停用/启用插件；必要时完全重启 DSH |
| `package.json` / `cordis.patch.yml` | 通过插件管理界面重新加载或重启 DSH |

## 已知限制

- 仅覆盖主显示器；多显示器尚未支持。
- 覆盖范围是主显示器 `workArea`，不覆盖任务栏。
- 首次启用需要联网完成一次 Electron 下载，约 347 MiB 解压体积。
- helper 崩溃后不会自动重启；DSH 页面入口在 helper 关闭时也可能隐藏。
- “显示呆喵”状态通常在一个 1.5 秒轮询周期内更新；页面在后台被 Chromium
  节流时，切回 DSH 会立即刷新。
- 右键菜单打开后，光标离开菜单和呆喵会自动收起，以便全屏层恢复点击穿透。
- 托盘退出和呆喵菜单关闭都会请求浏览器侧通过 DSH Remote 停用整个插件；若
  15 秒内没有 DSH 客户端响应，helper 会保留并提示关闭失败，避免状态不一致。
- 桌面鼠标穿透通过主进程切换 `setIgnoreMouseEvents` 完成；菜单打开时会临时
  锁定整层交互，菜单关闭后恢复穿透。
- 截屏识图要求 DSH 当前模型支持图片输入，并需要宿主提供附件服务；纯文本模型
  会返回“这个模型好像不会看图”的提示。截图会发送给当前配置的模型服务商。
- 截图会写入 DSH 附件存储；插件本身不保存 API Key，也不把截图记录写入网页端。

## 排查

### 桌面窗口没有出现

1. 检查 Host 控制台中的 `[daimeow-electron]` 下载进度和错误。
2. 确认网络可访问 npmmirror，或设置 `DSH_DAIMEOW_ELECTRON_MIRROR`。
3. 确认 `%USERPROFILE%\.dsh\electron\electron.exe` 已解压完成，或设置
   `DSH_DAIMEOW_ELECTRON_PATH` 指向已有 Electron。
4. 停用并重新启用插件，或点击“显示呆喵”重试。
5. 检查 `[daimeow-helper]` 日志排查桌宠窗口自身的问题。

### DSH 页面没有恢复入口

确认插件已重新加载，再刷新页面。`/daimeow/detached/status` 应返回：

```json
{
  "ok": true,
  "open": true,
  "visible": false
}
```

### 桌面被覆盖层挡住

从托盘选择“退出呆喵”，或在 DSH 插件页停用插件。不要直接删除 helper 文件。

### 动作无法播放

重新运行 `npm run build`。构建脚本会在运行时补丁目标缺失时直接报错。

## 许可

插件源代码沿用 DaiMeow 的 MIT 许可。Live2D Cubism Core、模型、道具素材以及
《怪物猎人》相关知识产权不自动包含在 MIT 许可内，详见
`THIRD_PARTY_NOTICES.md`。
