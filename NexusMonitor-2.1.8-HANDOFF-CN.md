# NexusMonitor 2.1.8 — 开发交接说明

- 当前正式源码版本：`2.1.8`
- 基线：`2.1.7` 完整源码；不覆盖历史版本。
- 目标 Windows 工作目录：`O:\6\NexusMonitor-2.1.8`
- 技术栈：Electron 45.2.1、React 19、TypeScript 7、Vite、.NET 10 HardwareService。

## 本轮修复

- 修正主进程 `console-message` 事件监听器，匹配 Electron 45 的位置参数类型：`event, level, message, line, sourceId`。不得使用较新 Electron 文档中的 details-object 形式，因为项目固定 Electron 45.2.1。
- 保留 2.1.7 的主窗口首帧门控、Renderer Error Boundary、旧设置容错、默认启动悬浮 HUD，以及 2.1.6 USB 副屏负坐标定位逻辑。

## 构建

```powershell
$ErrorActionPreference = 'Stop'
Set-Location 'O:\6\NexusMonitor-2.1.8'
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
