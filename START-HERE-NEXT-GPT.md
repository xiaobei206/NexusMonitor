# NexusMonitor — 新接手 GPT 请先看这里

**当前行为版本：2.2.13；唯一工作基线：GitHub main。** 垂直 HUD 改为用户可拉伸、自动记忆尺寸，并可通过右键菜单锁定；优先恢复按显示器保存的尺寸。Windows CI / Release 状态以当前构建报告和 GitHub Actions 实际结果为准。

- 当前交接：NexusMonitor-2.2.13-HANDOFF-CN.md
- 当前构建报告：NexusMonitor-2.2.13-BUILD-REPORT.md
- Windows 验收命令：NexusMonitor-2.2.13-Windows-验收命令.txt
- 统一构建入口：NexusMonitor-2.2.13-BUILD-RELEASE.cjs
- 唯一跨版本日志：NexusMonitor-DEVELOPMENT-LOG-CN.md
- Release 说明规范：[RELEASE-NOTES-GUIDELINES.md](RELEASE-NOTES-GUIDELINES.md)
- 全部版本的英文 Release 文案源：.github/release-notes.json
- 自动同步与覆盖校验：scripts/sync-release-notes.cjs
- 架构与硬性约束：AGENTS.md
- 版本一致性检查：node scripts/validate-release-version.cjs

## 2.2.13 当前实现目标

- 垂直 HUD 默认尺寸为 340×900 逻辑像素；没有有效记忆时才用此默认值，并始终受显示器工作区约束。
- 自动记忆每块显示器上的垂直宽高；优先读取独立尺寸记录，并校验迁移可用的旧位置记录。
- 右键「允许调整窗口大小」默认勾选。取消勾选会禁用原生拉伸并持久保存锁定状态；重启后尺寸和勾选状态都应保留。
- 垂直 HUD 最小可调尺寸为 280×420；横向 HUD 保持原有布局。横竖切换时单独保存、恢复纵向尺寸。
- 原有卡片自然高度、短屏预报折叠、滚动、吸附、自动隐藏和独立详情窗继续保留。
- 2.2.13 的 Windows CI / Release 状态以版本化构建报告及实际 Actions 结果为准；目标 PC 实测另行验收。

## 项目通用约束

- 个人仓库直接在 main 开发，不创建功能分支或 PR，除非用户明确要求。
- 所有行为版本递增；统一同步 VERSION、package / lockfile、HardwareService、Renderer 版本字段和版本化构建入口。
- 只记录实际跑过的测试；CI 不代表实机硬件验收。
- Release 不得只写 Full Changelog。每版至少包含真实变更摘要、具体亮点、该版本实测验证和已知限制；发布后必须读取 Release API 回查文案。
- Windows PowerShell 中使用 npm.cmd / npx.cmd。

## 2.2.12 已正式发布

- 垂直 HUD 曾改为 340×1200 逻辑像素的固定设计尺寸，并通过自然占高与短屏预报折叠避免异步加载后的卡片压缩。
- Windows CI Run #258 通过：271/271 Main/Node 回归，Renderer、WASAPI、PawnIO、.NET、Hardware/Storage、NSIS、SHA-256 与发布。
- 用户在实机安装后反馈固定尺寸太大；2.2.13 改为可拉伸、自动记忆尺寸和右键锁定。

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
- 当前垂直 HUD 默认 340×900，自动记忆每显示器尺寸；右键「允许调整窗口大小」可随时锁定/解锁。横竖切换时单独恢复垂直尺寸。
- 音乐服务是唯一 main Renderer 音乐引擎；USB 视频使用独立 HTML video 音频链路。视频模式不显示音乐迷你播放器，但允许两路音源同时播放。
- P4 Mono UAC Direct v62 的 WASAPI Exclusive 无声问题是独立的历史目标机问题，本轮未改 native backend。
- 用户项目习惯：直接在 main 开发；所有正式行为版本号递增；版本元数据同步；保留唯一累计开发日志；构建报告、交接文件都含产品名及版本号。Windows PowerShell 使用 npm.cmd / npx.cmd。
