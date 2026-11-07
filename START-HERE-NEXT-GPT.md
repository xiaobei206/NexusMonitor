# NexusMonitor — 新接手 GPT 请先看这里

**当前开发基线：main / 2.2.4；上一正式版本：2.2.3。**

用户反馈 2.2.3 的明确故障：先把音乐输出选到 `P4 Mono UAC Direct v62`，普通播放正常；开启 WASAPI 独占后声音秒切换到 Windows 默认声卡。关闭独占、暂停/重新播放都无法回到 P4，必须完全退出再启动应用。

## 2.2.4 修复

- 根因路径：`ensureAudioGraph()` 原来创建默认 `AudioContext`，随后才由另一个 effect 调用 `applyOutputSink()`。在独占开启时 `exclusiveActiveRef` 可能已变成 true，`applyOutputSink()` 会提前返回，导致 Web Audio graph 保持 Windows 默认输出。`MediaElementAudioSourceNode` 一旦接管音频元素，不能再只靠原 `HTMLAudioElement.setSinkId()` 恢复路由。
- 现在使用当前 `musicOutputDeviceId` 创建 AudioContext，并在创建/连接 `MediaElementAudioSourceNode` 之前调用 `context.setSinkId()` 与校验 `context.sinkId`。非默认目标无法绑定时，直接抛错并关闭尚未连接音源的 Context，不把音乐默默送到系统默认声卡。
- 已增加源码回归测试，明确要求 sink 绑定必须先于 `createMediaElementSource(audio)`。
- 版本已递增为 2.2.4，同步 package/lock、VERSION、Renderer 和 .NET service version fields，并新增 `NexusMonitor-2.2.4-BUILD-RELEASE.cjs`。

## 相关文件

- `src/renderer/music-player.tsx`：单一音频图、输出路由、WASAPI 切换和恢复。
- `tests/music-player-source.test.cjs`：输出 sink 排序合同和独占恢复回归检查。
- `NexusMonitor-2.2.4-HANDOFF-CN.md`：本轮故障、根因和实机验收清单。
- `NexusMonitor-2.2.4-BUILD-REPORT.md`：CI、安装包与校验和记录。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md`：唯一跨版本开发日志。

## 验收边界

先确认最终 Windows CI 通过，再安装 2.2.4 做真实 P4 验收。需要验证开启独占前后输出设备都仍是 P4，关闭后不回落到 Windows 默认设备；模拟 sink 绑定失败时应拒绝接管音源而非切换声卡。CI 通过不能替代物理输出验证。

## 工程规则

用户偏好直接在 `main` 开发，无功能分支/PR。正式迭代递增语义版本号；2.2.4 尚未证明目标 P4 实机行为完全通过，不能在文档中冒称硬件验收成功。
