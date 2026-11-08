# NexusMonitor — 新接手 GPT 请先看这里

**最近正式发布：2.2.7；当前 main 源码版本：2.2.8（等待本版本 Windows CI / Release 核验）。唯一工作基线：GitHub main。2.2.8 发布后，下一正式行为版本从 2.2.9 开始。**

- 最近正式 Release：[NexusMonitor 2.2.7](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.7)
- 最近正式安装包：[NexusMonitor-2.2.7-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe)
- 本版交接：[NexusMonitor-2.2.8-HANDOFF-CN.md](NexusMonitor-2.2.8-HANDOFF-CN.md)
- 本版构建报告：[NexusMonitor-2.2.8-BUILD-REPORT.md](NexusMonitor-2.2.8-BUILD-REPORT.md)
- 唯一跨版本日志：[NexusMonitor-DEVELOPMENT-LOG-CN.md](NexusMonitor-DEVELOPMENT-LOG-CN.md)
- 架构与硬性约束：[AGENTS.md](AGENTS.md)
- 当前版本的 Actions / Release 结果以 GitHub main 最新提交及该提交的 Windows CI 为准；等待期间不得把 2.2.7 的历史成功状态套用到 2.2.8。

## 2.2.8 本轮变更目标

- 修复用户手动快进并等待循环数次后出现的 “The element has no supported sources” 播放失败。
- 为播放请求与当前 track ID / media source URL 加 generation guard；轨道切换时先失效旧请求和卸载旧 source。
- seek/resume 等待 seeked 事件，避免在曲尾 seek 与 ended/repeat 重启交叠。
- 保留唯一 main Renderer 音频宿主；HUD / 副屏不创建第二个播放器。
- CI 尚未验证前不宣称构建成功；即使 CI 成功，也不能替代用户 Windows 实机上的实际音乐循环验收。

## 能力与边界基线

- 2.2.6 已加入 QWeather V1、华风爱科、彩云天气适配和 AQI 分类规范，保留 Open-Meteo、WeatherAPI、OpenWeather。
- 竖向 HUD 默认高度为 960 逻辑像素，记住每显示器的手动高度（700–1200px）。
- 音乐服务是唯一 main Renderer 音频引擎；USB 视频模式没有音乐迷你播放器。
- P4 Mono UAC Direct v62 的 WASAPI Exclusive 无声问题是独立的历史目标机问题，本轮未改 native backend。
- 用户项目习惯：直接在 main 开发；所有正式行为版本号递增；版本元数据同步；保留唯一累计开发日志；构建报告、交接文件都含产品名及版本号。Windows PowerShell 使用 npm.cmd / npx.cmd。
