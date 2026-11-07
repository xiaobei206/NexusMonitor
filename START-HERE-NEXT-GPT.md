# NexusMonitor — 新接手 GPT 请先看这里

以当前任务对应的 GitHub 开发分支源码为准。2.2.0 当前开发分支为 `feature/2.2.0-music-and-window-lifecycle`，工作入口是 PR #1；`main` 是稳定基线，不要把开发分支误切回 main。每次新对话必须重新读取 PR HEAD、`VERSION`、依赖版本和最新 Actions 状态。

## 接手顺序

1. 检查仓库 https://github.com/xiaobei206/NexusMonitor；若继续 2.2.0，先检查 PR #1 与分支 `feature/2.2.0-music-and-window-lifecycle` 的最新 HEAD / Actions；不要直接在 main 上开发。
2. 依次阅读：本文件 → `NexusMonitor-2.2.0-HANDOFF-CN.md` → `NexusMonitor-DEVELOPMENT-LOG-CN.md` → `README.md` → `NexusMonitor-2.2.0-BUILD-REPORT.md`。
3. 再读 `docs/VERSIONING_CN.md`、`VERSION`、`package.json`、`package-lock.json`、`scripts/validate-release-version.cjs`、当前版本的 `NexusMonitor-*-BUILD-RELEASE.cjs` 和 `.github/workflows/windows-ci.yml`。
4. 按本轮任务阅读专题文档，再对照源码与 `tests/`。文档和源码冲突时，以当前源码、测试为准，并修正文档。
5. 用户要求实际开发时，不要只给计划：修改、测试、提交推送，检查新提交的 CI，并如实区分自动化与实机验收。

## 已有基线（接手时重新核对）

- 当前开发分支版本为 2.2.0，PR #1 为 Draft，尚未合并 `main` / 尚未正式发布。Run #23 对应 HEAD `e45c93bd4e8e2faf17270fdbcda382a8f66e9086` 的 CI 已成功；每次接手仍须读取最新 HEAD 与 Actions。最终以当前分支 `VERSION` 和 GitHub HEAD 为准。
- 技术栈：Electron 45.2.1、React 19、TypeScript 7、Vite 8、.NET 10 HardwareService、LibreHardwareMonitorLib。
- 应用源码 / v2.1.8 Release 验证提交：`6ff189829829b1b16802b276f5ad4784674b4d46`；[成功 CI 42239092025](https://github.com/xiaobei206/NexusMonitor/actions/runs/42239092025)。
- 之前的文档同步提交 `09b6739cd1aa876e9e410b149651fcb385393439` 的 CI 也已成功：[42242756560](https://github.com/xiaobei206/NexusMonitor/actions/runs/42242756560)。
- [v2.1.8 Release](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.1.8)。
- **仍待真实 Windows 硬件验收：** COM3 Turing 屏刷新/拔插重连；ESP32-P4 五寸副屏在实际多屏、负坐标和 DPI 下的边界；冷启动、HUD 展开与长期运行；MP3 实际输出、托盘隐藏期间持续播放与播放边界。云端 CI 不能代替这些测试。

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
