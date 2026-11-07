# NexusMonitor — 新接手 GPT 请先看这里

**当前正式版本：2.2.1。唯一工作基线：GitHub `main`。**

截至 2026-11-07，NexusMonitor 2.2.1 已合入 `main` 并正式发布。不要再按旧交接记录把 2.2.1 当成开发分支，也不要重新创建功能分支 / PR。个人项目后续默认直接在 `main` 开发；只有用户明确要求隔离开发时才另行建分支。

## 当前版本与正式交付

- main 应用代码提交：`9de1e9db2f700fa69326792b990cef4a57a56d1d`
- `VERSION`：`2.2.1`
- PR #2：已合并；旧分支 `feature/2.2.1-music-platform` 仅是历史引用，发布时与 main 的文件树 SHA 相同。
- Windows CI Run #175：成功，HEAD 即上述 main 提交。
  - 版本门禁 14/14。
  - Node 主进程 / 回归测试 225/225。
  - Renderer TypeScript 与 Vite production build 成功。
  - Windows N-API WASAPI 原生模块构建成功。
  - 官方 PawnIO MCHBAR 资源校验成功。
  - .NET HardwareService Release 构建与 Storage Tests 成功。
  - NSIS 安装包、SHA-256、GitHub Release 与 workflow artifact 均成功。
- 正式 Release：[NexusMonitor 2.2.1](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.1)
- 安装包：`NexusMonitor-2.2.1-Setup.exe`（160,009,308 bytes）
- SHA-256：`1fafefc129308aaa72664699d2796c2818c5237bae6092b7c3b56a7b06351596`
- CI：[Windows CI Run #175](https://github.com/xiaobei206/NexusMonitor/actions/runs/42354102069)

## 新会话阅读顺序

1. 本文件 → `AGENTS.md`
2. `NexusMonitor-2.2.1-HANDOFF-CN.md`
3. `docs/MUSIC-PLATFORM-2.2.1-CN.md`
4. `NexusMonitor-DEVELOPMENT-LOG-CN.md`
5. `README.md` 与需要修改的源码 / 测试

每轮接手都重新读取 GitHub `main` HEAD、`VERSION`、最新 Actions 与 Release；不能依赖聊天摘要或旧文档里的状态字段。

## 2.2.1 已交付范围

- 单一 Music Service / 单一主 Renderer 音频宿主；Dock、HUD、USB 输出只作控制面。
- Nora 风格歌曲、专辑、艺术家、流派、文件夹、自定义歌单、搜索与队列。
- ID3 / FLAC / WAV / Ogg / Opus / M4A 元数据和内嵌封面处理；旧 2.2.0 曲库一次性补齐新增元数据。
- MP3、WAV、FLAC、OGG/OGA、Opus、M4A/M4B、AAC 导入白名单；M3U/M3U8；十段 EQ、预设、ReplayGain、本地 LRC、睡眠定时。
- Windows 输出 endpoint 选择与测试音；native WASAPI Exclusive PCM 路径及 underrun 状态。
- 六种 USB 模式：monitor、static、gif、weather-clock、video、music-only。视频仍独立；music-only 隐藏五寸输出窗而保留后台 Music Service。
- 主窗口关闭到托盘，隐藏期间保持 Renderer 与音乐服务存活；保存的五寸屏目标在启动时恢复，不猜测其他显示器。

## 尚未由 2.2.1 宣称完成的事情

- 导入扩展名白名单不等于每个 codec / codec profile 的实际 Windows 解码与 seek 矩阵已通过。WMA、AIFF、APE、WavPack、Musepack、TTA、MKA、AC3、DTS、DSF/DFF 不作支持承诺。
- WASAPI 当前数据路径为 Chromium/WebAudio decode -> stereo Float32 PCM -> AudioWorklet -> native WASAPI；`bitPerfect=false`。不宣称 bit-perfect。
- Gapless / Crossfade 双 Deck 尚未实现；结束后切歌不能冒充 gapless。
- 五寸屏扬声器实际出声、所选 endpoint 与 Windows 其他应用的分流、设备拔插 / 默认设备变化、长时间 underrun、六种 USB 模式实机切换、睡眠唤醒、混合 DPI 与 Turing COM3 长期运行仍需用户目标 Windows PC 验收。
- Hosted CI 成功不等于用户 PC 实测。安装包当前未配置代码签名证书。

## 后续开发规则

- 应用行为变更必须升级正式版本（下一轮从 2.2.2 开始），同步 `VERSION`、package / lockfile、HardwareService、Renderer、发布脚本和版本门禁；不做 FIX/FIX1、不覆盖已发布版本。
- 文档先行、修改小步、补回归测试；保持唯一的 `NexusMonitor-DEVELOPMENT-LOG-CN.md`。
- 默认直接提交到 `main`，不拆分功能分支、不为个人项目制造 PR 流程。
- Windows PowerShell 使用 `npm.cmd` / `npx.cmd`，不要把 ExecutionPolicy 修改当默认解决方案。
- 不把用户曲库、绝对路径、settings、运行日志或私人数据提交到仓库。

## 源码地图

| 路径 | 内容 |
|---|---|
| `src/main/index.ts` | 主进程、窗口生命周期、音乐 IPC、曲库持久化、设备管理 |
| `src/main/music-*.ts` | 元数据、播放列表、歌词、WASAPI 输出 |
| `src/shared/types.ts` | Main / Preload / Renderer 共享类型 |
| `src/preload/index.ts` | 受控 IPC API |
| `src/renderer/music-player.tsx/css` | 曲库、主播放器、Dock、HUD 控制面 |
| `src/renderer/App.tsx` | 主 UI 与六种 USB 显示模式 |
| `native/wasapi-output/` | Windows N-API / WASAPI 原生模块 |
| `HardwareService/` | .NET 10 硬件监控与 Turing 服务 |
| `tests/` | Node 源码回归与 .NET Storage / Hardware 测试 |
| `.github/workflows/windows-ci.yml` | main 的 Windows CI 与正式 Release |

## Windows 验证命令

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\scripts\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
npm.cmd run build:wasapi
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```
