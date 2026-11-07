# NexusMonitor — 新接手 GPT 请先看这里

**当前正式版本：2.2.4；唯一工作基线：GitHub `main`。下一轮正式行为改动从 2.2.5 开始。**

- 正式 Release：[NexusMonitor 2.2.4](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.4)
- 最终 Windows CI：[Run #192](https://github.com/xiaobei206/NexusMonitor/actions/runs/42361308963) — success
- 应用代码提交：`c7894ee83f8dfee529ecab330561b10d25db5664`
- 测试：版本一致性 14/14；Node 主进程测试 238/238，0 failed；Renderer TypeScript/Vite、Windows N-API WASAPI、PawnIO SHA、.NET Release、Hardware/Storage Tests、NSIS、installer SHA-256 与 Release 上传全部通过。
- 安装包：[NexusMonitor-2.2.4-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.4/NexusMonitor-2.2.4-Setup.exe)，160,014,176 bytes。
- SHA-256：`1a82ea9cd511455c2d3c87fb0cbcf2b22eccaf7e19892f3906cb11bef0c835a7`

## 用户报告的故障与修复

用户反馈 2.2.3：先选 `P4 Mono UAC Direct v62`，普通播放正常；开启 WASAPI 独占后声音秒切 Windows 默认声卡。关闭独占、暂停/重新播放都无法回到 P4，只有退出并重启应用才恢复。

`ensureAudioGraph()` 原来先创建默认 `AudioContext`，后续 effect 才应用 `musicOutputDeviceId`。独占开启时 `exclusiveActiveRef` 可能先变成 true，导致 `applyOutputSink()` 提前返回；Web Audio graph 因此保留默认 sink。音源接入 `MediaElementAudioSourceNode` 后，仅设置原 audio element 的 sink 不足以修复 graph 的输出。

2.2.4 在创建 AudioContext 时指定目标 `sinkId`，在 `createMediaElementSource(audio)` 之前再次绑定并校验实际 `context.sinkId`。如果非默认 sink 无法绑定，关闭尚未接管音源的 Context 并报错退出，避免音乐静默回退到系统默认声卡。源码回归测试检查绑定顺序。

## 相关文件

- `src/renderer/music-player.tsx`：AudioContext 输出路由、WASAPI 切换/恢复。
- `tests/music-player-source.test.cjs`：输出 sink 顺序与独占恢复回归。
- `NexusMonitor-2.2.4-HANDOFF-CN.md`：本轮交接与实机验收。
- `NexusMonitor-2.2.4-BUILD-REPORT.md`：CI、安装包与 hash。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md`：唯一跨版本开发日志。

## 目标 PC 验收仍待用户确认

1. 重启后选 P4，普通播放正常。
2. 开启 WASAPI 独占，音乐仍从 P4 出声，不切到 Windows 默认声卡。
3. 关闭独占后仍保持 P4；暂停/继续、切歌也保持 P4。
4. 如果目标 sink 不支持/拒绝绑定，独占应明确失败且普通播放不应切声卡。
5. 测试设备拔插、默认设备改变和长时间播放。

Hosted CI 证明自动化和 Windows 编译通过，不等于已经证明 P4 实体扬声器输出正常。

## 工程规则

用户偏好直接在 `main` 开发，无功能分支/PR。下一轮正式行为改动递增至 2.2.5，必须同步版本门禁、交接和构建报告。
