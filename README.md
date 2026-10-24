# DaiMeow DSH

DeepSeek Harness 内置桌宠插件。它把 [DaiMeow](https://github.com/yubdey/DaiMeow) 的 Live2D
模型、21 个动作、点击/待机状态机、鼠标视线追踪、手柄视线控制、拖动和气泡台词移植到
Harness Web UI 的 `shell.overlay` 槽位。

## 功能

- Live2D 模型与原有 21 个动作，包含坐姿/站姿持续状态。
- 5–20 秒随机待机动作、点击回应、拖动、右键菜单和设置面板。
- 跟随鼠标头部视线，并支持浏览器 Gamepad API 的右摇杆控制。
- `pet_say`、`pet_control`、`pet_status` 三个 Agent 工具。
- Agent 开始任务、调用工具、结束轮次时自动播放对应动作和短台词。
- 位置、大小、透明度、帧率、固定位置、鼠标穿透和显隐设置保存在当前 Harness
  浏览器本地，刷新页面后恢复。
- 中文和英文插件元数据；可见控件文案会跟随 Harness 当前语言。

## 安装位置

Cordis 包入口在本目录，并已由 DSH profile 以 `daimeow-dsh` 名称链接。通过
`plugin_manager.install_bundle` 将它安装到当前 profile 后即可启用。安装后可在
Harness 的“插件”页面查看和启停。

## 构建

仓库已经生成了可直接分发的 `client.js`。修改客户端源码后，在本目录运行：

```powershell
node scripts/build-client.mjs
```

构建脚本会把 Live2D 模型、道具图片以及原 DaiMeow 已打包的运行时代码内嵌到
`client.js`，因此插件不依赖外部 HTTP 服务，也不会启动第二个 Electron 进程。

## 工具

- `pet_say(text, action?, durationMs?)`：让呆喵说一句短话。
- `pet_control(action)`：播放动作、坐下/站起、显示/隐藏或恢复默认。
- `pet_status()`：读取最近状态与可用动作列表。

## 许可

插件源代码沿用 DaiMeow 的 MIT 许可。Live2D Cubism Core、模型与道具素材、以及《怪物猎人》
相关知识产权不自动包含在 MIT 许可内，详见 `THIRD_PARTY_NOTICES.md`。
