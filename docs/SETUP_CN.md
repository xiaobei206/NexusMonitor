# NexusMonitor 2.2.0 — 安装、开发与验收（开发分支）

当前版本以根目录 `VERSION` 为准；此文档描述 2.2.0 开发分支；当前正式 Release 仍需以 GitHub main/Release 页面为准，后续升版须继续同步。

## 安装包

2.2.0 尚未发布安装包；此前正式基线 [GitHub Release v2.1.8](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.1.8) 仅用于已发布的旧版本。安装包未配置代码签名证书，Windows 可能显示未知发布者/SmartScreen 提示。

## 开发环境与依赖

Windows 10/11 x64、Node.js 22.12+（CI 使用 Node 24.x）和 .NET SDK 10.0。首次安装依赖需访问 npm registry 与 NuGet。在仓库根目录使用 PowerShell 运行：

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
node .\scripts\validate-release-version.cjs
if ($LASTEXITCODE -ne 0) { throw 'Version validation failed' }
```

## 构建和测试

```powershell
npm.cmd run test:main
npm.cmd run build:renderer
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```

每条命令都要检查退出码；上述命令分别覆盖主进程/Node 回归、Renderer 类型检查/Vite、HardwareService Release 构建和存储/硬件逻辑测试。

若直接构建 .NET 时缺少 `HardwareService/Resources/PawnIO/IntelMCHBAR.bin`，先运行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1
```

模块由官方 PawnIO Modules 发布包获取并校验，不提交到 Git；不可创建空文件或使用来源不明的二进制。版本专属完整构建脚本在资源缺失时会调用该脚本。

## 开发与打包

```powershell
npm.cmd run dev
npm.cmd run package:win -- --publish never
```

第二条命令生成本地 NSIS x64 安装包，并避免 electron-builder 自动发布。当前开发分支预期文件名为 `release/NexusMonitor-2.2.0-Setup.exe`；只有 2.2.0 Windows CI 和用户验收完成后才可作为正式安装包发布。正式 Release 由 workflow 创建；已有版本 Release 不覆盖。版本专属构建脚本有固定预期版本，使用前确认它与 `VERSION` 一致。

## 本机数据与已知验收边界

HardwareService API 只绑定 `127.0.0.1:18765`。本机设置与运行日志在 `%APPDATA%\NexusMonitor` 下；常见主进程日志为 `logs\main.log`。不要把个人设置/运行日志提交到公开仓库。未暴露的硬件传感器应显示 `—`，不可用估算值冒充实测。

v2.1.8 基线的 Windows Hosted CI 曾完成构建、自动测试及未签名安装包发布；2.2.0 当前分支的验证结果需以本分支 PR Actions 为准，详见[2.1.8 历史构建报告](../NexusMonitor-2.1.8-BUILD-REPORT.md)。但 COM3 Turing 刷新/拔插、ESP32-P4 五寸副屏实际坐标和 DPI、真实冷启动/HUD 展开及长期运行，必须在用户机器独立验收。

新对话从 [START-HERE-NEXT-GPT.md](../START-HERE-NEXT-GPT.md) 开始，接着阅读当前交接说明和唯一开发日志。历史 ZIP 里的路径/版本/测试结论不是当前工作树状态。
