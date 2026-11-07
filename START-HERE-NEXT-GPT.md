# NexusMonitor — 新接手 GPT 请先看这里

**当前正式版本：2.2.2。唯一工作基线：GitHub `main`。**

截至 2026-11-07，NexusMonitor 2.2.2 已经合入 `main` 并正式发布。个人项目后续默认直接在 `main` 开发，不建立功能分支或 PR，除非用户明确要求。

## 当前正式交付

- 正式版本：`2.2.2`
- 应用代码提交：`99e76745ae978ae3e0dd8dc9eaefa6785dadb022`
- GitHub Release：[NexusMonitor 2.2.2](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.2)
- Windows CI：[Run #179](https://github.com/xiaobei206/NexusMonitor/actions/runs/42357228488)，结论 success。
- 版本一致性：14/14。
- Node 主进程与回归测试：234/234，0 failed。
- Renderer TypeScript / Vite production build：通过。
- Windows N-API WASAPI native addon：编译成功。
- PawnIO 官方资源 SHA 验证：通过。
- HardwareService .NET Release 与 Storage Tests：通过。
- NSIS x64 安装包、SHA-256、GitHub Release 与 workflow artifact：成功。
- 安装包：`NexusMonitor-2.2.2-Setup.exe`（160,011,997 bytes）。
- SHA-256：`4622fae70bc5a0b9770ab90c40c8de964b6f5f0f0f442b33fc829e54d4b2bc03`
- 安装包未代码签名，因为仓库没有配置代码签名证书。

## 新会话阅读顺序

1. 本文件 → `AGENTS.md`
2. `NexusMonitor-2.2.2-HANDOFF-CN.md`
3. `NexusMonitor-2.2.2-BUILD-REPORT.md`
4. `NexusMonitor-DEVELOPMENT-LOG-CN.md`
5. `README.md` 与需要修改的源码 / 测试

每轮接手都重新读取 GitHub `main` HEAD、`VERSION`、最新 Actions 和 Release；不能依赖聊天摘要或旧文档状态。

## 2.2.2 已交付

- WASAPI 独占格式探测覆盖 mono/stereo PCM。
- 每个格式候选同时探测 classic `WAVEFORMATEX` 与 `WAVEFORMATEXTENSIBLE`。
- 探测 Windows shared mix format，必要时将其采样率纳入候选。
- 实际独占 Initialize 支持 classic WAVEFORMATEX fallback。
- Stereo 仍优先；只有没有兼容 stereo 候选才用 mono。
- Renderer 继续输出 stereo Float32；mono-only endpoint 在 native 边界执行 `(L+R)/2`。
- negotiated channels 驱动 channel mask、block alignment、bytes-per-frame、ring buffer 和 UI 状态。
- 无兼容候选时提供已探测候选数、两种结构命中数、shared mix format 和 HRESULT。
- USB `music-only` 动作按钮已简化为 **「应用模式」**，其它副屏模式仍为「启动副屏」。

## 尚未由 2.2.2 宣称完成的事情

- WASAPI 当前路径是 Chromium/WebAudio decode -> Float32 PCM -> native WASAPI，仍不是 bit-perfect。
- Gapless / Crossfade 双 Deck 尚未实现。
- 五寸 P4 扬声器真实出声、Windows 其他应用的 endpoint 分流、拔插 / 默认设备变化、独占期间系统声音行为、长时间 underrun 仍需用户目标 PC 验收。
- 实际 MP3/WAV/FLAC/OGG/Opus/AAC/M4A 解码与 seek 矩阵仍需真实文件验收；导入扩展名白名单不代表所有 codec/profile 都已通过。
- 六种 USB 模式、桌面壁纸不遮挡、睡眠/唤醒、混合 DPI、Turing COM3 长期运行仍需实机复验。
- Hosted CI 成功不等于用户电脑实测。

## 后续开发规则

- 下一轮应用行为修改从正式版本 2.2.3 开始，更新 VERSION、package / lockfile、HardwareService、Renderer、发布脚本与 14 项版本门禁。
- 文档先行、小步修改、补回归测试；只维护一个 `NexusMonitor-DEVELOPMENT-LOG-CN.md`。
- 默认直接提交 `main`，不拆分功能分支、不为个人项目制造 PR 流程。
- Windows PowerShell 使用 `npm.cmd` / `npx.cmd`。
- 不提交用户曲库、绝对路径、settings、运行日志或私人数据。

## 源码地图

| 路径 | 内容 |
|---|---|
| `src/main/index.ts` | 主进程、窗口生命周期、音乐 IPC、曲库持久化、设备管理 |
| `src/main/music-*.ts` | 元数据、播放列表、歌词、WASAPI 输出与协商 |
| `src/shared/types.ts` | Main / Preload / Renderer 共享类型 |
| `src/preload/index.ts` | 受控 IPC API |
| `src/renderer/music-player.tsx/css` | 曲库、主播放器、Dock、HUD 控制面 |
| `src/renderer/App.tsx` | 主 UI 与六种 USB 显示模式 |
| `native/wasapi-output/` | Windows N-API / WASAPI 原生模块 |
| `HardwareService/` | .NET 10 硬件监控与 Turing 服务 |
| `tests/` | Node 源码回归与 .NET Storage / Hardware 测试 |
| `.github/workflows/windows-ci.yml` | main 的 Windows CI 与正式 Release |

