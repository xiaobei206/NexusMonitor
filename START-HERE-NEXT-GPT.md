# NexusMonitor — 新接手 GPT 请先看这里

**当前正式发布：2.2.7；Windows CI Run #204 全部成功。唯一工作基线：GitHub main。接手时必须核对 main 最新 HEAD；下一正式行为版本从 2.2.8 开始。**

- 当前正式发布：[NexusMonitor 2.2.7](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.7)
- 安装包：[NexusMonitor-2.2.7-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe)
- SHA-256 文件：[NexusMonitor-2.2.7-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe.sha256)
- 当前交接：[NexusMonitor-2.2.7-HANDOFF-CN.md](NexusMonitor-2.2.7-HANDOFF-CN.md)
- 当前构建报告：[NexusMonitor-2.2.7-BUILD-REPORT.md](NexusMonitor-2.2.7-BUILD-REPORT.md)
- 唯一跨版本日志：[NexusMonitor-DEVELOPMENT-LOG-CN.md](NexusMonitor-DEVELOPMENT-LOG-CN.md)
- 架构与硬性约束：[AGENTS.md](AGENTS.md)
- Run #204：[Windows CI success](https://github.com/xiaobei206/NexusMonitor/actions/runs/42494116368)
- 2.2.7 的已测源码提交：`2f882c6348869b3406ab6b93aee7d112ebf7631f`；文档同步后的 main HEAD 可能更新。始终以 GitHub 实际 main HEAD 为准。

## 2.2.7 本次修复

- 音乐单曲循环、列表循环在曲尾重启时，防止短暂 `paused` 状态反向覆盖仍然有效的播放意图。
- 统一 HTMLAudioElement 的 `play()` 调用，使用 attempt ID 作废已过期的启动请求；播放中途的曲目更换/暂停不应被旧请求覆盖。
- 处于 ended / play pending 时，运行态同步不再发送误导性的 `playing: false`；由合法 pause 触发的 `AbortError` 不再显示成解码或输出故障。
- 新增回归测试，锁定状态竞态、播放请求集中入口和事件监听类型。
- 未修改 native WASAPI backend。Hosted Windows CI 不能替代目标机真正的音频播放验收。

## 之前的能力基线

- 2.2.6 已加入 QWeather V1、华风爱科、彩云天气适配和 AQI 分类规范，保留 Open-Meteo、WeatherAPI、OpenWeather；详情见当前 2.2.7 交接及历史交接。
- 竖向 HUD 默认高度为 960 逻辑像素，记住每显示器的手动高度（700–1200px）。
- 音乐服务是唯一 main Renderer 音频引擎，HUD / 副屏仅发控制命令；USB 视频模式不运行音乐迷你播放器。
- P4 Mono UAC Direct v62 的 WASAPI Exclusive 无声问题是独立的历史目标机问题，本版未改 native backend，勿宣称已修复。
- 用户项目习惯：直接在 main 开发；所有正式行为版本号递增；版本元数据同步；保留唯一累计开发日志；构建报告、交接文件都含产品名及版本号。Windows PowerShell 使用 `npm.cmd` / `npx.cmd`。
