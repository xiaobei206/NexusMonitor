# NexusMonitor 2.2.8 — 快进与循环音源竞态修复构建报告

**版本：** 2.2.8  
**基线：** NexusMonitor 2.2.7 正式 Release  
**状态：** 源码提交后等待当前版本 Windows CI / Release 验证；验证结果确认后更新本报告。

## 变更概要

针对手动快进后反复循环出现 “The element has no supported sources”，收紧 HTMLAudioElement 来源生命周期。曲目切换会使旧播放请求失效并清除旧 src；播放器只接受当前 track ID 与当前 media URL；循环 seek 重启等待 seeked，seek 不再直接跳到 duration 的精确边界；旧曲目来源的错误事件不再污染当前播放状态。

这属于源码并发与媒体生命周期防护。当前没有目标 PC 的现场日志，不能把源码推断表述为已复现的目标机根因。

## 验证记录

- 版本一致性检查：等待 CI。
- Main / Node 回归测试：等待 CI。
- Renderer TypeScript 与 Vite 生产构建：等待 CI。
- native WASAPI 构建、PawnIO 资源校验、.NET HardwareService、硬件 / 存储测试：等待 CI。
- NSIS 安装包、SHA-256、GitHub Release：等待 CI。
- 目标机实际播放、快速拖动进度条、单曲循环与列表循环：必须在 Windows 实机验收。

## 发布交付

正式 Release、Actions Run 编号、安装包大小与 SHA-256 仅在对应任务真正成功后填写；当前不预填或猜测这些结果。
