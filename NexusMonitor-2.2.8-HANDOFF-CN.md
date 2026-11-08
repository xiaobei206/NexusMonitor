# NexusMonitor 2.2.8 — 快进与循环播放修复交接

**状态：** 已正式发布；Windows CI Run #209 成功。  
**正式 Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.8  
**最新行为修复提交：** https://github.com/xiaobei206/NexusMonitor/commit/cb28997c4305865aaf759a9adb733ad5601af9d1  
**正式安装包：** https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.8/NexusMonitor-2.2.8-Setup.exe  
**SHA-256：** 4324a9411b992bd9d148f7f0c405dddbe21e8dc608ebf7d33c6127b5e7abc485  
**大小：** 160,023,946 bytes。

## 用户报告与边界

用户报告手动快进并等待循环数次后报错：“播放启动失败：The element has no supported sources”。没有用户目标 PC 的现场日志，不能把源码推断说成已完成实机复现。

## 修复点

- 当前曲目 ID、active source URL、source generation 共同识别音源；过期曲目的 URL Promise、媒体错误和 seeked 回调会被忽略。
- 切曲时使旧 play promise 失效，pause 后卸载旧 src，再加载新文件。
- play() 只允许在活动曲目音源校验通过后调用。
- seek/resume 等待 seeked 完成再尝试恢复播放，并将 seek 上限留在 duration 前 50ms。
- repeat-one / repeat-all 的 seek-resume 期间设置 pending 状态保护，避免 paused 瞬态让主进程把曲目标记为暂停。
- 保留一个 HTMLAudioElement 播放宿主；不修改视频模式、音频输出路由或 native WASAPI 实现。

## 验证记录

Windows CI：https://github.com/xiaobei206/NexusMonitor/actions/runs/42496538449 — success。

| 检查 | 结果 |
|---|---|
| 版本元数据一致性 | 通过 |
| 主进程回归测试（含快进/循环新增测试） | 通过 |
| Renderer TypeScript + Vite 生产构建 | 通过 |
| 原生 WASAPI 模块 | 通过 |
| PawnIO MCHBAR 资源检查 | 通过 |
| .NET HardwareService | 通过 |
| 硬件 / 存储测试 | 通过 |
| NSIS 安装包、SHA-256、Release 上传与 artifact | 通过 |

## 实机验收

仍需要在目标 Windows 机器上使用实际音乐库反复拖动进度条并等待多次循环。CI 成功不代表已经验证目标机的全部音乐格式、声卡和 WASAPI 场景。若仍复发，请记录曲目文件类型、循环模式、是否启用 EQ/ReplayGain/WASAPI 和出现时间。

**下一正式行为版本：2.2.9。** 继续直接在 main 开发，并保持 NexusMonitor-DEVELOPMENT-LOG-CN.md 为唯一累计日志。
