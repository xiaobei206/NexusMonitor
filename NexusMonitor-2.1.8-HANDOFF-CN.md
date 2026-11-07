# NexusMonitor 2.1.8 — 开发交接说明

- 当前正式源码版本：`2.1.8`
- 基线：`2.1.7` 完整源码；不覆盖历史版本。
- 用户 Windows 机器已知工作目录：`O:\6\NexusMonitor-2.1.8`（仅供该机器实机验收参考；其他环境不得假设路径存在）
- 技术栈：Electron 45.2.1、React 19、TypeScript 7、Vite、.NET 10 HardwareService。

## 本轮修复

- 修正主进程 `console-message` 事件监听器，匹配 Electron 45 的位置参数类型：`event, level, message, line, sourceId`。不得使用较新 Electron 文档中的 details-object 形式，因为项目固定 Electron 45.2.1。
- 保留 2.1.7 的主窗口首帧门控、Renderer Error Boundary、旧设置容错、默认启动悬浮 HUD，以及 2.1.6 USB 副屏负坐标定位逻辑。

## 构建

```powershell
$ErrorActionPreference = 'Stop'
# 先进入当前实际 clone 的仓库根目录；不要照抄用户机器的 O: 路径。
npm.cmd ci --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
node '.\NexusMonitor-2.1.8-BUILD-RELEASE.cjs' --validate-only
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed' }
node '.\NexusMonitor-2.1.8-BUILD-RELEASE.cjs'
if ($LASTEXITCODE -ne 0) { throw 'Build or release failed' }
```

预期安装包：`release\NexusMonitor-2.1.8-Setup.exe`。

## 验收重点

1. 主窗口冷启动后完整显示，不出现背景底色空白。
2. 悬浮 HUD 默认自动出现。
3. 第一次展开悬浮 HUD 详情就能完整显示。
4. 主进程编译通过，确认不再出现 2.1.7 的 TS2339 console-message 参数错误。
5. USB 5 寸副屏位于主屏左上方时无图片残片。

## 验证边界

源码级检查不等于完整 Windows 构建、安装包或实机验收。构建报告只记录本轮实际执行的检查；未运行的项目必须明确标为未验证。


---

## GitHub 仓库与 2.1.8 最终验证状态（2026-11-06）

**公开源码仓库：** https://github.com/xiaobei206/NexusMonitor  
**v2.1.8 应用源码/正式 Release 验证提交：** `6ff189829829b1b16802b276f5ad4784674b4d46`  
**正式 Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.1.8  
**应用代码成功 Actions：** https://github.com/xiaobei206/NexusMonitor/actions/runs/42239092025  
**此前文档同步提交：** `09b6739cd1aa876e9e410b149651fcb385393439`，Windows CI 见 https://github.com/xiaobei206/NexusMonitor/actions/runs/42242756560。新接手时仍须重新检查当前 main HEAD 和 Actions。

### 远程 Windows 验证结论

该 Actions 在 Windows Server 2025、Node 24.22.2、.NET SDK 10.0.403 上完成：

- `npm ci` 成功；
- 版本一致性检查 14/14；
- `npm.cmd run test:main` 成功（包括主进程 TypeScript 编译及 Node 回归测试）；
- `npm.cmd run build:renderer` 成功；
- 官方 PawnIO MCHBAR 模块下载、SHA-256 核验和提取成功；
- .NET HardwareService Release 编译成功，0 Warning / 0 Error；
- `npm.cmd run test:storage` 成功；
- Windows x64 NSIS 安装包、SHA-256 文件和 GitHub Release 均成功生成/发布。

### 交付物与限制

- 安装包：`NexusMonitor-2.1.8-Setup.exe`，159,898,662 bytes。
- SHA-256：`ee173577851a025b95450422a9ec31c7aebcc9ec556dce9e09d31ad7299426e3`。
- 当前 EXE 未配置代码签名证书。
- Hosted CI 不会连接用户的 COM3 Turing 屏或 ESP32-P4 5 寸屏，也不会复现用户实际多显示器拓扑。首次启动 UI、HUD 显示、USB 副屏边界和长期运行仍需用户机器验收。

### 后续版本工作规则

1. 先读取本文件和仓库根目录唯一跨版本开发日志 `NexusMonitor-DEVELOPMENT-LOG-CN.md`。
2. 每轮正式应用代码迭代递增版本号；同步 VERSION、package 元数据、Renderer、HardwareService、发布入口和版本专属文档。
3. 每版先推送 `main`，等待 Windows CI 完整通过；同一版本不存在 Release 时，成功构建自动打包并发布 `v<version>`。已有 Release 不会被覆盖。
4. 每次更新开发日志、交接文档、构建报告和 SHA-256 源码清单。不要把 CI 成功写成实机硬件验收成功。
5. GitHub Actions 页面保存构建日志；用户运行时日志和设置留在本机 `%APPDATA%\\NexusMonitor`，不提交到公开仓库。


## 新对话接手入口

新 GPT / 编程代理先读 [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md) 和 [AGENTS.md](AGENTS.md)。不要把本文件中的历史验证 SHA、用户机器路径或版本专属脚本当作新分支 HEAD/通用路径；先检查当前 main 和 VERSION。
