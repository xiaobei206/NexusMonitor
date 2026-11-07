# NexusMonitor 2.2.1 — 构建与验收报告

**报告状态：正式发布完成（Hosted Windows CI 全绿）。**  
**正式版本：** 2.2.1  
**应用代码提交：** `9de1e9db2f700fa69326792b990cef4a57a56d1d`  
**分支策略：** 直接以 `main` 为唯一开发基线；PR #2 已合并，旧功能分支不再作为入口。  
**报告日期：** 2026-11-07。

## 正式 Release

- [NexusMonitor 2.2.1 GitHub Release](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.1)
- 安装包：`NexusMonitor-2.2.1-Setup.exe`
- 文件大小：160,009,308 bytes
- SHA sidecar：`NexusMonitor-2.2.1-Setup.exe.sha256`
- SHA-256：`1fafefc129308aaa72664699d2796c2818c5237bae6092b7c3b56a7b06351596`
- 安装包未代码签名（未配置代码签名证书）。

## 最终 Windows CI：Run #175

[查看 GitHub Actions Run #175](https://github.com/xiaobei206/NexusMonitor/actions/runs/42354102069)

- 触发：push to `main`；HEAD `9de1e9db2f700fa69326792b990cef4a57a56d1d)。
- 结果：workflow completed / success；Windows job completed / success。
- 版本一致性门禁：14/14。
- Node 主进程与回归测试：225/225，fail 0，cancelled 0，skipped 0。
- Renderer TypeScript 检查与 Vite production build：成功。
- Windows N-API WASAPI addon：成功生成原生模块。
- PawnIO 官方 MCHBAR archive：官方资源 SHA-256 校验通过。
- HardwareService .NET 10 Release：成功，0 warning。
- Hardware / Storage Tests：通过。
- NSIS x64 安装包：成功生成。
- SHA-256 sidecar：成功生成。
- GitHub Release 与 workflow artifact：成功发布。

### 非致命构建警告

- MSVC 的 `/std:c++20` 被 node-gyp 项目配置覆盖为 `/std:c++17`。
- `binding.cpp` 的 `NOMINMAX` 宏重复定义。
- Node 发出 `DEP0190`：子进程 `shell: true` 参数弃用提示。
- 上述均未造成 Run #175 失败；建议在后续正式版本中单独清理，不要为了清警告重写已发布 2.2.1。

## 功能实现范围

统一 Music Service、单一主 Renderer 播放宿主、歌曲 / 专辑 / 艺术家 / 流派 / 文件夹 / 歌单导航、元数据 / 封面、旧曲库一次性补齐、M3U/M3U8、十段 EQ / 预设、ReplayGain、本地 LRC、睡眠定时、Windows 普通 endpoint 路由、native WASAPI Exclusive PCM 路径、六种 USB 显示模式及 music-only 桌面壁纸模式均已进入正式源码并经上述 Hosted CI 构建 / 测试。

## 重要能力边界

- 导入白名单：MP3、WAV、FLAC、OGG、OGA、Opus、M4A、M4B、AAC。扩展名可导入并不等于所有 codec/profile 已经由目标 Windows Electron 环境实测解码。WMA、AIFF、APE、WavPack、Musepack、TTA、MKA、AC3、DTS、DSF/DFF 不在支持承诺中。
- WASAPI 实际数据路径：Chromium/WebAudio decode -> stereo Float32 PCM -> AudioWorklet -> main-process IPC -> native WASAPI ring buffer。状态明确保持 `bitPerfect: false`；不宣称 bit-perfect。
- Gapless / Crossfade 双 Deck、native decoder-to-device bit-perfect 链路没有包含在 2.2.1。

## 目标 Windows PC 实机验收（Hosted CI 不代替）

下列事项仍需用户在自己的 Windows PC 上完成并记录结果：

1. 五寸 USB 屏专用扬声器可枚举、可选择并真实出声。
2. 选择五寸屏扬声器后，Windows 其他应用仍走用户指定的系统输出；播放过程中切换、拔插、默认设备变化和睡眠恢复表现正常。
3. WASAPI Exclusive 占用期间其他程序声音的行为、退出 / 异常回退、长时间 underrun 与稳定性。
4. MP3 / WAV / FLAC / OGG/OGA / Opus / AAC / M4A(AAC/ALAC) 真实文件播放、时长、seek、下一首、元数据与损坏文件错误处理。
5. 六种 USB 模式切换；music-only 不创建可见输出窗、不遮挡 Windows 桌面壁纸，切回后恢复同一保存显示器。
6. 主窗隐藏到托盘期间音乐持续；Dock、HUD、USB 控制同步；无双重音频。
7. Turing COM3、天气、硬件监控、主题、混合 DPI、多屏负坐标及睡眠 / 唤醒无回归。

**结论：** 2.2.1 的源码、自动化构建、Node 回归、Renderer、原生 WASAPI 模块、.NET / Storage、Windows 安装包和 Release 均已由 GitHub Hosted Windows CI 验证并正式发布；以上目标机硬件行为仍待真实设备验收。
