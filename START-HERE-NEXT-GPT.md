# NexusMonitor — 新接手 GPT 请先看这里

**当前正式发布：2.2.11；GitHub main 已完成动态国务院节假日日历。Windows CI Run #254 全流程成功。唯一工作基线：GitHub main。下一行为版本从 2.2.12 开始。**

- 当前正式 Release：https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.11
- Windows CI Run #254（success）：https://github.com/xiaobei206/NexusMonitor/actions/runs/45144691021
- Windows 安装包：https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.11/NexusMonitor-2.2.11-Setup.exe
- SHA-256：`7c3f0238e185e8b5930d93e75f224bdae2c0f721311cdf82e064d397b4b9e994`（160,069,433 bytes，约 152.65 MiB）
- SHA-256 sidecar：https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.11/NexusMonitor-2.2.11-Setup.exe.sha256
- 上一正式 Release（基线）：https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.10
- 当前版本交接：NexusMonitor-2.2.11-HANDOFF-CN.md
- 当前版本构建报告：NexusMonitor-2.2.11-BUILD-REPORT.md
- 唯一跨版本日志：NexusMonitor-DEVELOPMENT-LOG-CN.md
- 架构与硬性约束：AGENTS.md

## 2.2.11 已正式发布

- 内置 2017—2027 年国务院放假/调休数据；未来年份按需后台查询，规则解析为主，百度/Google AI 搜索 JSON 为后备。
- 成功数据按年度缓存到 `%APPDATA%\\NexusMonitor\\calendar-schedules`，并通过 IPC 即时刷新日历；查询失败不猜测、不覆盖旧缓存。
- Windows CI Run #254 全流程成功：270 项 Node 回归、Renderer TS/Vite、WASAPI、PawnIO、.NET、Hardware/Storage、NSIS、SHA、Release 和 artifact 上传均通过。
- 2028 年官方安排尚未公布，真实未来通知命中和用户目标机联网环境仍待届时验收。详见 NexusMonitor-2.2.11-HANDOFF-CN.md。

## 2.2.10 已正式发布

- USB 视频播放器有独立音量、静音与输出设备设置，不再被 JSX 强制静音。
- 视频与 Music Service 可以并行发声；重叠时显示非阻塞提醒，忽略提醒不改变任一音源。
- 设备绑定失败时显示明确提示；请求非默认设备时不允许声音悄悄退回系统默认输出。
- Windows CI / Release 与目标机验收状态须分别核验。

## 2.2.9 已发布功能

- 四态统一播放模式：随机、顺序、单曲循环、列表循环；随机使用 shuffle bag，整轮不重复，轮次结束后自动重新洗牌。
- 主窗口底部 Dock、悬浮 HUD mini-player、非视频 USB 副屏 mini-player 共用主进程 playbackMode；菜单为垂直四选一，当前模式有选中标记。
- 旧音乐库的 shuffle / repeat 设置会自动迁移到新模式字段；随机队列和上一首历史可持久化。
- Run #213 全流程通过并发布 v2.2.9；用户目标 Windows PC 的真实音乐播放仍待验收。详见 NexusMonitor-2.2.9-HANDOFF-CN.md 与 NexusMonitor-2.2.9-BUILD-REPORT.md。

## 2.2.8 已验证变更

- 修复快进/循环时的活动曲目音源竞态：过期 track URL、play 请求、媒体错误及 seeked 回调不能覆盖当前曲目。
- 切曲时先使旧请求失效并卸载旧 src。
- seek/resume 等待 seeked 后恢复；循环重启期间屏蔽瞬时 paused 状态。
- 主进程音乐回归测试、Renderer TypeScript/Vite、native WASAPI、PawnIO、.NET HardwareService、硬件/存储测试、NSIS 安装包、SHA 与 Release 发布全部通过 Run #209。
- 实机验收仍未完成：需在用户真实 Windows PC 上验证连续单曲/列表循环、曲尾快进、暂停恢复和音乐格式。

## 能力与边界基线

- 2.2.6 已加入 QWeather V1、华风爱科、彩云天气适配和 AQI 分类规范，保留 Open-Meteo、WeatherAPI、OpenWeather。
- 竖向 HUD 默认高度为 960 逻辑像素，记住每显示器的手动高度（700–1200px）。
- 音乐服务是唯一 main Renderer 音乐引擎；USB 视频使用独立 HTML video 音频链路。视频模式不显示音乐迷你播放器，但允许两路音源同时播放。
- P4 Mono UAC Direct v62 的 WASAPI Exclusive 无声问题是独立的历史目标机问题，本轮未改 native backend。
- 用户项目习惯：直接在 main 开发；所有正式行为版本号递增；版本元数据同步；保留唯一累计开发日志；构建报告、交接文件都含产品名及版本号。Windows PowerShell 使用 npm.cmd / npx.cmd。
