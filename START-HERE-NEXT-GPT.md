# NexusMonitor — 新接手 GPT 请先看这里

当前稳定基线为 `main` / 2.2.0；2.2.1 音乐平台重构在 `feature/2.2.1-music-platform`。开始任何工作前，必须重新读取该分支 HEAD、`VERSION`、依赖版本与最新 Actions 状态，不能根据旧对话认定工作已完成。

## 当前任务入口（NexusMonitor 2.2.1）

1. 阅读 [NexusMonitor-2.2.1-HANDOFF-CN.md](NexusMonitor-2.2.1-HANDOFF-CN.md) 与 [音乐平台重构设计](docs/MUSIC-PLATFORM-2.2.1-CN.md)；文档明确的架构决策优先于聊天摘要。
2. 检查 `feature/2.2.1-music-platform` 最新 HEAD / Actions，以及 `main` 当前 HEAD、PR / Release 状态；对照 `VERSION` 和 `package.json`。
3. 本轮基线：main 的 2.2.0 合并提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`；目标版本 `VERSION=2.2.1`。当前分支已开始接入代码，必须检查最新源码与 Actions。
4. 音乐重构前先核对旧音乐路径与新 Music Service 的具体调用，遵循设计文档中的六种输出模式、唯一音频宿主和音频 endpoint 要求。

## 接手顺序

1. 检查 PR #2、分支 `feature/2.2.1-music-platform`、最新 HEAD 和 GitHub Actions；不要回到旧 PR #1 / 2.2.0 开发分支。
2. 阅读：本文件 → `NexusMonitor-2.2.1-HANDOFF-CN.md` → `docs/MUSIC-PLATFORM-2.2.1-CN.md` → `NexusMonitor-DEVELOPMENT-LOG-CN.md` → README。
3. 再检查 `VERSION`、`package.json` / `package-lock.json`、`scripts/validate-release-version.cjs`、`NexusMonitor-2.2.1-BUILD-RELEASE.cjs`、`.github/workflows/windows-ci.yml`。
4. 文档和源码冲突时以当前源码 / 测试 / 最新 CI 为准，并修正文档。不能把历史 CI 或旧 HEAD 当成本次验证。
5. 用户要求实际开发时，继续实施、测试、提交和检查 Actions；明确区分 Hosted CI 与用户 Windows 目标机验收。

## 2.2.1 基线与当前交付状态（每次接手须重新核实）

- 稳定 `main` 基线为 2.2.0，合并提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`；当前分支 `feature/2.2.1-music-platform`，PR #2 开放。
- 已实现：本地多格式导入与 best-effort tags / artwork / ReplayGain；歌曲 / 专辑 / 艺术家 / 流派 / 文件夹 / 歌单曲库；M3U/M3U8 导入导出；统一 Music Service；六种副屏模式（含桌面壁纸 + 后台音乐）；Windows output endpoint setSinkId / 测试音；十段 EQ；Track / Album ReplayGain；本地 LRC；睡眠定时；播放错误可视化。
- **最近成功 CI Run #104：** 版本 14/14；Node 210/210；Renderer TypeScript / Vite；PawnIO；.NET Release 0 Warning / 0 Error；Storage Tests 全通过。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42348842265> 验证的 HEAD 为 `c8d24d28d353834cc04059eb2637a46ef8d94e78`。
- 当前分支 tip `b3f95d984118f74974f46dc62acde93d69a21908` 在 Run #104 后仅增加 UI CSS 收尾；须先检查这个 HEAD 是否有更新 CI。
- 未完成：WASAPI Exclusive native backend / bit-perfect；Gapless / Crossfade 双 Deck；完整格式实际文件播放矩阵；目标 PC 上输出设备与五寸屏扬声器实测；六模式 / USB 热插拔实机验收；正式安装包与 Release。
- 注意：格式导入白名单不等于解码通过；Chromium setSinkId 不等于 WASAPI Exclusive；Hosted CI 不能代替用户 Windows 硬件验收。


## 文件结构地图

| 路径 | 用途 |
|---|---|
| `src/main/` | Electron 主进程、窗口生命周期、IPC、服务管理、日志、HUD/详情窗/USB 输出窗 |
| `src/preload/` | 给 Renderer 暴露受控 API；新增 IPC 时同时核对主进程、preload、共享类型和测试 |
| `src/renderer/` | React UI、Turing Canvas、天气场景、HUD 辅助、存储/功耗摘要和样式；`music-player.tsx/css` 管理统一音乐播放 UI 与单一主窗口音频宿主；`App.tsx` 很大，尽量做小范围修改 |
| `src/shared/types.ts` | 主进程与 UI 共享类型 |
| `HardwareService/Program.cs`、`Monitoring/` | 本地 .NET API 和 CPU/GPU/存储/网络/天气采集 |
| `HardwareService/Display/` | Turing 串口服务和协议；不能新增并发写入者 |
| `tests/` | Node 回归测试、`tests/HardwareService.Tests/` .NET 测试 |
| `public/turing-weather/` | 图灵天气时钟 WebP 背景 |
| `scripts/` | 版本校验、获取/校验 PawnIO 资源、发布 HardwareService |
| `docs/` | 安装、显示器、协议、版本规范和历史专题 |
| 根目录版本文件 | 当前交接、构建报告、版本专属构建入口、源码清单；升版时同步更新 |

## Windows 验证命令

从仓库根目录在 PowerShell 执行；使用 `npm.cmd`，避免执行策略拦截 `npm.ps1`。

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\scripts\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```

当前 CI 打包使用 `npm.cmd run package:win -- --publish never`，防止 electron-builder 自动发布。正式 Release 由 workflow 单独创建。直接构建 .NET 若缺少 `HardwareService/Resources/PawnIO/IntelMCHBAR.bin`，先运行 `scripts/fetch-mchbar-module.ps1`；资源需从官方包下载并通过脚本校验，不能用空文件或不明文件代替。

## 必须遵守

- 应用行为变更必须递增正式版本号，不用 FIX/FIX1 名称；同步所有由版本校验器检查的字段（14 项门禁）。
- 优先小范围、可测试修改，保留无关功能；新增/修复行为时补回归测试。
- 每次推送后查看对应新 CI；只报告实际执行的测试。既有 Release 不覆盖、不复用旧版本号。
- 2.2.0 音乐引擎只能由主 Renderer 创建单一 HTMLAudioElement；Widget/USB 输出只可作为遥控 UI。关闭主面板是隐藏到 Tray，不能销毁主 Renderer。竖向 HUD 只在天气块之前插入迷你播放器，其他旧模块不做顺手改版。
- 维护唯一开发日志、当前 HANDOFF、构建报告、SHA-256 清单与 ZIP 内容表。
- 用户设置和运行日志留在本机 `%APPDATA%\NexusMonitor`，不要提交个人数据。
- 全屏让位是 best-effort；所有真实屏幕、驱动、DPI、睡眠/拔插和长期稳定性都必须单独实测，不能由 CI 推断通过。

专题文档可能保留历史背景。当前安装流程先读 `docs/SETUP_CN.md`；涉及 Turing 协议再读 `PROTOCOL_REFERENCE.md` 与 HardwareService 对应源码。
