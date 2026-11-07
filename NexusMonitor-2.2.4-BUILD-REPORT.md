# NexusMonitor 2.2.4 — 构建与验收报告

**状态：** CI 与正式 Release 待验证  
**目标问题：** WASAPI 独占切换导致选定输出设备 P4 Mono UAC Direct v62 丢失。

## 修改

- AudioContext 从创建时开始使用当前 `musicOutputDeviceId`。
- `setSinkId` 与实际 `sinkId` 检查前置到 `createMediaElementSource(audio)` 之前，避免先接管 HTML audio、再试图补设目标设备。
- 非默认设备不能绑定时关闭尚未接入媒体源的 AudioContext，明确失败，不允许静默切到 Windows 默认输出。
- 回归测试检查 AudioContext sink 绑定必须早于 MediaElementAudioSourceNode。
- 版本递增到 2.2.4，并同步版本门禁和 Windows release entrypoint。

## CI / 发布检查

- 当前 Windows CI Run：待确认。
- 版本门禁、Node tests、Renderer TypeScript/Vite、Windows WASAPI native addon、PawnIO SHA、.NET Release、Hardware/Storage Tests、NSIS、SHA-256 与 GitHub Release：待记录最终结果。

## 目标机验收（待用户确认）

- P4 普通播放 → 开启 WASAPI → 仍从 P4 播放。
- 关闭 WASAPI、暂停/继续、切歌以后仍从 P4 播放。
- 不能绑定非默认 sink 时不应回退默认声卡。
- 目标 PC 的实际扬声器、设备切换和长时间播放只能实机验收，Hosted CI 不证明这些行为。
