# NexusMonitor 2.2.11 — 动态国务院节假日日历交接

**当前正式 Release：** v2.2.10  
**开发基线：** GitHub main  
**开发版本：** 2.2.11  
**状态：** 源码与回归测试已推送；Windows CI / Release 待核验。  
**开发日期：** 2026-11-23

## 本版本目标

使国务院年度放假与调休数据不再依赖每年更新软件。2017—2027 年数据内置；未来年份在用户翻到日历时后台查找官方通知，解析成功后自动缓存并刷新。

## 文件索引

- `src/shared/calendar-holiday-schedules.json`：2017—2027 年内置年度表。
- `src/shared/calendar-holiday-parser.ts`：官方通知规则解析、数据校验、AI JSON 候选提取。
- `src/main/calendar-schedule-service.ts`：官方检索、Google/Baidu 后备、缓存与重试节流。
- `src/renderer/calendar-data.mjs`：年度表载入、节假日集合和运行时更新。
- `src/renderer/widget-calendar.tsx`：翻年查询、异步刷新。
- `src/preload/index.ts`、`src/renderer/vite-env.d.ts`：日历 IPC 安全接口。
- `scripts/copy-calendar-schedules.cjs`：打包内置年度 JSON。
- `tests/calendar-holiday-parser.test.cjs`：历史公文解析回归。
- `tests/widget-calendar.test.cjs`：内置数据、未知年份和动态缓存回归。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md`：跨版本唯一开发日志。
- `NexusMonitor-2.2.11-BUILD-RELEASE.cjs`：Windows 本地统一构建入口。

## 工作机制

1. 日历首次打开/切换到一个年份时，从主进程获取内置数据或本地缓存。
2. 对没有数据的未来年份，日历先显示“正在联网查询”；主进程查询国务院政策文件库，尝试读取官方通知正文。
3. 解析器按分项识别日期范围、单日假期、补休和调休上班日期。不能完整识别时拒绝写入。
4. 官方解析失败后，分别尝试 Google 与百度搜索页，从页面中寻找 AI 输出的 JSON；只接受完整官方 URL（gov.cn 子域名）和通过同一日期校验的数据。
5. 成功数据写入 `%APPDATA%\\NexusMonitor\\calendar-schedules\\YYYY.json`，随后通过 IPC 即时通知日历刷新。
6. 查询失败不覆盖已有缓存，不推断未公布的休假或补班日期；进程内失败重试间隔为 6 小时。

## 验证边界

- 通过 2017—2027 官方通知样本与合成 2028 数据测试规则解析、跨年日期、括号注释、冲突拒绝、未知年份和缓存应用。
- 2028 年尚未公布官方安排时，无法实测未来真实公文命中；需要等待其公布后再做最终真实年度验收。
- Google/Baidu AI 回显受搜索页面、地区、反自动化和会话条件影响，属于尽力而为的后备，不是稳定 API。
- 本文件生成时尚未核验 2.2.11 Windows CI 的最终结果；以 GitHub Actions 最新状态为准。

## Windows 验证命令

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\\scripts\\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
npm.cmd run build:wasapi
dotnet build .\\HardwareService\\HardwareService.csproj -c Release
npm.cmd run test:storage
```

CI 成功后再核对 NSIS 安装包、SHA-256 和 v2.2.11 Release。CI 通过不等于目标 PC 的实时联网检索已验收。
