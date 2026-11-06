> 本文原始安装说明对应 2.0.0。当前源码版本为 2.0.4。2.0.3 已完成的磁盘容量、HUD 网络双速率条、统一 AQI 颜色和静态壁纸全部继承；2.0.4 新增 HUD 四边吸附/边缘隐藏/原生菜单/全屏让位、Turing 天气时钟和未来三天预报。首次 .NET 构建前必须执行 `scripts/fetch-mchbar-module.ps1`，准备好 IntelMCHBAR.bin；项目不再允许静默跳过该资源。

# NexusMonitor 2.0.0（Electron 新架构）安装与运行

## 开发环境

- Windows 10/11 x64
- Node.js 22.12 或更新版本（建议使用已安装的 Node 24 LTS）
- npm 10 或更新版本
- .NET SDK 10.0
- Visual Studio 2026 可保留，用于查看/调试 HardwareService；前端主要由 TypeScript/React 构建

## 首次启动

1. 将 ZIP 解压到普通本地目录，例如 `D:\\Projects\\NexusMonitor-Electron-2.0.0`。不要放在 OneDrive 同步目录或只读目录。
2. 先执行 `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1`，下载并校验官方 PawnIO Modules 归档，提取 `IntelMCHBAR.bin`。没有该文件时 HardwareService 构建会明确失败。
3. 双击 `install-and-run.bat`。首次 npm 安装会从 registry 获取依赖并 restore .NET NuGet 包。
4. Electron 主进程启动后会自动运行本地 HardwareService（127.0.0.1:18765）。

如果命令窗口显示依赖安装或 restore 失败，先确认网络可以访问 npmjs.org 和 nuget.org。

## 构建检查

双击 `build-only.bat`。它先构建 Electron 主进程/预加载/React，再构建 .NET 硬件服务。

## 制作 Windows 安装包

双击 `package-windows.bat`。安装包输出到 `release` 文件夹。该步骤需要联网 restore NuGet 与 npm 依赖。

## 硬件服务

- HTTP 只监听 `127.0.0.1:18765`，不开放局域网。
- CPU/GPU/硬盘温度等硬件传感器由 LibreHardwareMonitorLib 0.9.6 提供；磁盘读写吞吐与活动率优先从 Windows PhysicalDisk WMI 性能实例采集，不依赖 SSD 是否暴露 LHM 吞吐传感器。个别主板/核显/硬盘不暴露温度或频率时，UI 会显示 `—`。
- 内存、网卡、磁盘和挂载卷由 Windows API / WMI 获取。
- 传感器访问不完整时，可以右键程序选择“以管理员身份运行”进行对照测试；不应因此长期默认提升权限。
- 吴江区/苏州市天气和 AQI 使用 Open-Meteo 公共接口；当前版本请求六个未来小时及三个未来日的天气预报，供 Turing 天气时钟使用。空气质量接口失败不会阻断当前天气；天气主接口不可用时优先保持同地点最近一次成功缓存，无缓存时显示等待状态并自动重试。

## 图灵 3.5 英寸屏

目前针对 VID/PID `1A86:5722`、USB CDC-ACM、Revision A 实现串口握手与 RGB565 写入。默认 COM3、115200、RTS/CTS；连接前退出原厂 `UsbMonitor.exe`，避免独占 COM 口。

屏幕连接页默认关闭自动连接。先在页面选择 COM3 并点击“连接副屏”，成功后发送测试画面。本机实测：100 为竖屏正向，101 为竖屏旋转 180°，102 为横屏旋转 180°，103 为横屏正向；当前安装方向默认使用 103。首次整屏传输比局部刷新耗时，后续界面按 16×8 区域比较变化并发送。图灵支持硬件监控、静态壁纸和天气时钟三种模式。天气时钟横屏与竖屏独立排版，包含整屏天气背景、当前天气/AQI、未来六小时和三天。晴天素材 18 张，另有多云、雾、雨、雷暴、雪和夜间背景。

串口初始化、亮度/开关屏、四种方向和全屏/局部图像已在实机通过；长时间稳定性、USB 拔插和重连仍属于 Phase 4F，尚未完成。

## 主题与个人图片

写真背景通过“主题工作室 → 导入本地背景照片”载入并保存在本机用户配置。建议使用横向 16:9 或 3:2 图片。NexusMonitor 不会自动下载或上传个人图片。

## 本机配置和日志

配置：`%APPDATA%\\NexusMonitor\\settings.json`
日志：`%APPDATA%\\NexusMonitor\\logs\\main.log`（轮转文件为 `main.log.1`）
插件：`%APPDATA%\\NexusMonitor\\plugins`

（Electron `userData` 目录以应用实际名称为准；当前应用名为 `NexusMonitor`。）


## 2.0.0 Next 开发补丁补充说明

### 重新验证顺序

```powershell
npm.cmd ci
dotnet restore .\HardwareService\HardwareService.csproj
npx.cmd tsc -p tsconfig.electron.json --noEmit
npx.cmd tsc -p tsconfig.renderer.json --noEmit
npm.cmd run test:main
dotnet build .\HardwareService\HardwareService.csproj -c Release --no-restore
npm.cmd run test:storage
npm.cmd run build
npm.cmd run dev
```

这只是开发构建和测试，不会生成 NSIS 安装包。`test:main` 会先执行 `build:test-utils`，将两个 Turing 纯逻辑模块编译到 `.test-build`，随后运行 Node 测试；不需要安装 TypeScript 6 Compiler API alias。

### PawnIO 与 CPU 低层传感器

LHM 的一部分 Intel CPU 温度、频率、功耗数据依赖 PawnIO 低层驱动。NexusMonitor 当前只读取 `Win32_SystemDriver` 的 PawnIO 安装/运行状态，不会自动安装或启动内核驱动。可以在管理员 PowerShell 只读检查：

```powershell
Get-CimInstance Win32_SystemDriver -Filter "Name='PawnIO'" |
    Select-Object Name, State, Started, PathName
```

如果查不到 PawnIO，不要从不明站点下载驱动；先通过 LibreHardwareMonitor 官方发布页核对其对应版本与 PawnIO 安装说明，再决定是否安装。驱动安装是独立的系统级操作，需要用户明确确认，NexusMonitor 不会静默执行。官方项目：https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases

### 数据解释更新

- Disk Read/Write 与 `% Disk Time` 优先来自 Windows `Win32_PerfFormattedData_PerfDisk_PhysicalDisk`，温度来自 LHM。
- 真实硬盘温度选择优先 Composite，排除 Warning/Critical/Threshold 限值。
- CPU/GPU 功耗为 0 W 时在 UI 中按不可用处理为 `—`；原始传感器清单仍可查看 0 W 原始回报。
- 内存温度仅在 LHM 实际返回 Memory 温度传感器时显示。
- 图灵 6 小时天气采用三列两行，维持 480×320、五项硬件和连续天气面板。
- 浮动 HUD 新交互尚待 Windows 运行验收：单击任意条区域展开，拖动另按 5px 区分，鼠标离开整个展开窗口 2 秒后淡出，移回取消。


## 2026-11-01 DevUpdate 开发补丁验收

最新开发源码新增 `tsconfig.test-utils.json`，`npm.cmd run test:main` 会先编译测试目标文件，再运行 Node 测试（源码统计 33 项）。C# 自定义断言通过 `npm.cmd run test:storage` 执行。新增的 PawnIO 诊断只读取注册表和驱动状态，不会自动安装/启动驱动。CPU 频率还有 Windows `CallNtPowerInformation` 备用读取。

此 ZIP 仍是开发源码。请先解压到一个新目录，不覆盖旧工作副本；按交接文档重跑两份 TypeScript 检查、Node 测试、C# build/tests、Vite build 和 `npm.cmd run dev`。不要执行 `package:win`；HUD、图灵 COM3、Phase 4F 和 NSIS 都仍需实机验收。
