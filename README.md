# DaiMeow DSH

DeepSeek Harness（DSH）桌面桌宠插件。它把
[DaiMeow](https://github.com/yubdey/DaiMeow) 的 Live2D 模型、动作状态机、交互和
Agent 联动接入 DSH。

当前唯一运行形态是**桌面全屏模式**：

- DSH Host 启用插件后，自动启动一个独立的 Electron helper。
- helper 在**主显示器工作区**创建透明、无边框、置顶、默认点击穿透的窗口。
- Live2D 呆喵显示在桌面而不是 DSH 页面内。
- DSH 页面只保留一个在桌面呆喵隐藏时出现的“🐾 显示呆喵”入口。
- 桌宠与 DSH 通过 Host 的 stdin/stdout 帧管道和本地 HTTP 路由通信。

## 功能

- Live2D 模型与 21 个动作，包含站姿、坐姿和随机待机状态机。
- 点击互动、拖动、鼠标视线跟随、气泡台词和右键菜单。
- 鼠标穿透：只有光标位于呆喵或菜单上时，覆盖层才接收输入。
- 窗口置顶、隐藏/显示、托盘菜单和“恢复交互”。
- `pet_say`、`pet_control`、`pet_status` 三个 Agent 工具。
- Agent 开始工作、调用工具和结束轮次时自动播放动作及短台词。
- 位置、大小、透明度、固定位置、鼠标穿透、置顶和显隐状态持久化。
- 中英文插件元数据。

原独立 DaiMeow 的定时截屏点评、AI 服务商配置和聊天历史面板不属于本插件。

## 运行架构

```text
DSH Web UI
  └─ daimeow-dsh client
       └─ 仅渲染“显示呆喵”启动胶囊
            │
            ▼
DSH Host / index.js
  ├─ 注册 /daimeow/events（SSE）
  ├─ 注册 /daimeow/detached/{open,close,status,show}
  ├─ 提供 pet_say / pet_control / pet_status
  └─ 启动独立 Electron helper
            │ stdin/stdout
            ▼
runtime/electron-helper
  ├─ main.js          透明全屏覆盖层、托盘、IPC
  ├─ preload.js       contextBridge 安全桥
  ├─ pet-renderer.js  Live2D、菜单、拖动、点击穿透
  ├─ assets.js        内嵌模型和道具素材
  └─ runtime.js       内嵌 Cubism/Pixi/DaiMeow 运行时
```

### 数据流

1. DSH Host 收到 Agent 工具结果或会话事件后生成 `daimeow/reaction` 帧。
2. `DaiMeowService.onFrame` 将从 stdin 把 `dsh-pet-frame:{json}` 写入 helper。
3. helper 主进程通过 IPC 将帧传给渲染端，播放 Live2D 动作和气泡。
4. helper 在窗口显示/隐藏时通过 stdout 返回 `dsh-pet-visibility:true/false`。
5. DSH 页面以 1.5 秒间隔读取 `/daimeow/detached/status`；窗口隐藏时显示恢复入口。

helper 与 Host 不通过裸 HTTP 连接。DSH 的浏览器访问闸门会拒绝独立进程直接请求
WebServer，因此这里使用 stdin/stdout。

## 目录结构

```text
DaiMeow DSH/
├─ index.js                       Host 插件、工具、路由、helper 生命周期
├─ src/client.template.js         DSH 页面客户端源码
├─ client.js                      构建产物，不直接编辑
├─ scripts/
│  ├─ build-client.mjs            构建 DSH 页面客户端
│  └─ build-helper.mjs            构建 helper 的模型与运行时资源
├─ runtime/
│  ├─ live2dcubismcore.js         Cubism Core 构建输入
│  ├─ pet-bundle.js               DaiMeow 运行时构建输入
│  └─ electron-helper/
│     ├─ main.js                  全屏透明窗口、托盘、IPC、stdin/stdout
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
- 独立 Electron 运行时，按以下顺序解析：
  1. 环境变量 `DSH_PET_ELECTRON_PATH`
  2. `%USERPROFILE%\.dsh\electron\electron.exe`

当前机器已存在第二项。若不存在，可设置环境变量，或安装提供该运行时的
`dsh-pet`。

插件本身不需要安装 npm 依赖；Node.js 只用于构建和语法检查。

## 构建

在插件根目录运行：

```powershell
npm run build
npm run check
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

不要直接编辑上述生成文件。修改 `src/client.template.js`、`runtime/`、`assets/`
或构建脚本后重新构建。

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

- 左键点击呆喵：触发互动动作。
- 拖动呆喵：改变位置并保存。
- 右键呆喵：打开动作、调整和显示菜单。
- 右键菜单可调整 `0.75x / 1.0x / 1.25x`、透明度、固定位置、鼠标穿透和置顶。
- 托盘菜单提供显示、隐藏、恢复交互和退出呆喵。
- 若开启鼠标穿透无法再次点到呆喵，可从托盘选择“恢复交互”。
- “关闭呆喵”只退出桌面 helper，不改变插件启停状态。

## Agent 工具

- `pet_say(text, action?, durationMs?)`：让呆喵说一句短话。
- `pet_control(action)`：播放动作、坐下/站起、显示/隐藏或恢复默认。
- `pet_status()`：读取连接数、helper 状态、最近反应和动作列表。

可用动作包括 `nod`、`happy`、`cheer`、`hello`、`thinking`、`idea`、`sit`、
`stand_up` 等。

## 安装与重载

插件目录已由当前 DSH profile 链接为 `daimeow-dsh`。修改后的重载方式：

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
- helper 崩溃后不会自动重启；DSH 页面入口在 helper 关闭时也可能隐藏。
- “显示呆喵”状态依赖 1.5 秒轮询。
- 右键菜单打开后，光标离开菜单和呆喵会自动收起，以便全屏层恢复点击穿透。
- 关闭 helper 后需要重新启用插件或调用 Host 的 open 路由才能恢复。
- 桌面鼠标穿透与菜单交互依赖 Electron 的
  `setIgnoreMouseEvents(..., { forward: true })`。

## 排查

### 桌面窗口没有出现

1. 确认 `%USERPROFILE%\.dsh\electron\electron.exe` 存在，或设置
   `DSH_PET_ELECTRON_PATH`。
2. 停用并重新启用插件。
3. 检查 Host 控制台中的 `[daimeow-helper]` 日志。

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
