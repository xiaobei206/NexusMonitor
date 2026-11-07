# NexusMonitor 2.2.1 — 当前交付交接

<badge>正式发布</badge>

**当前唯一工作基线：** `main`  
**正式版本：** 2.2.1  
**Release 日期：** 2026-11-07  
**应用代码提交：** `9de1e9db2f700fa69326792b990cef4a57a56d1d`  
**PR #2：** 已合并。旧 `feature/2.2.1-music-platform` 是历史分支，不作为后续工作入口；发布时其文件树 SHA 与 main 相同。

## 正式交付物

- Release：[NexusMonitor 2.2.1](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.1)
- Windows x64 NSIS 安装包：`NexusMonitor-2.2.1-Setup.exe`
- 安装包大小：160,009,308 bytes
- SHA-256：`1fafefc129308aaa72664699d2796c2818c5237bae6092b7c3b56a7b06351596`
- SHA sidecar：`NexusMonitor-2.2.1-Setup.exe.sha256`
- Windows CI：[Run #175](https://github.com/xiaobei206/NexusMonitor/actions/runs/42354102069)，运行结果 success，HEAD `9de1e9db2f700fa69326792b990cef4a57a56d1d)。

## Run #175 验证结果

| 项目 | 结果 |
|---|---|
| VERSION / package / .NET 等一致性门禁 | 14/14 通过 |
| Node 主进程与源码回归测试 | 225/225 通过，0 failed |
| Renderer TypeScript | 通过 |
| Vite production build | 通过 |
| Windows N-API WASAPI addon | 构建成功 |
| 官方 PawnIO MCHBAR 资源 | 下载与 SHA-256 验证成功 |
| HardwareService .NET Release | 通过，0 warning |
| Hardware / Storage Tests | 成功 |
| NSIS x64 安装包 | 成功 |
| 安装包 SHA-256 | 成功 |
| GitHub Release 与 workflow artifact | 成功 |

构建日志有非致命工具链警告：MSVC 报告 `NOMINMAX` 宏重复定义及项目标准参数从 C++20 被覆盖为 C++17；Node 也报告一个子进程 shell 参数弃用提示。它们未导致 Run #175 失败，但下一轮原生模块维护时可单独收敛。安装包未代码签名，因为仓库未配置签名证书。

## 2.2.1 功能边界

### 已交付

- 唯一 Music Service 与主 Renderer 唯一音频宿主。主窗口隐藏到托盘、Dock/HUD/USB 控制面切换，不创建第二套音乐播放引擎。
- 曲库支持歌曲、专辑、艺术家、流派、文件夹、自定义歌单、搜索、队列；旧库一次性补齐新增标签字段。
- 导入 MP3 / WAV / FLAC / OGG / OGA / Opus / M4A / M4B / AAC；本地元数据、封面、M3U/M3U8、ReplayGain、十段 EQ、LRC、睡眠定时。
- Windows 输出设备枚举、endpoint 选择、持久化、测试音与失败状态。
- native WASAPI Exclusive PCM 路径：AudioWorklet 抽取 stereo Float32 PCM，经受控 IPC 与 native ring buffer 输出，包含端点协商、pause/clear、stats 与异常回退。
- 六种 USB 输出模式；`music-only` 隐藏五寸输出 BrowserWindow，让 Windows 桌面壁纸显示，同时保持 Music Service 活跃。video 模式独立。
- 主窗口关闭到托盘；保存的五寸显示器 ID 在启动时恢复，不会用任意外接屏替代。

### 明确不作承诺 / 尚待后续

- 扩展名导入白名单不等于实际解码支持矩阵。需要在 Windows 目标机对 MP3、WAV、FLAC、OGG/OGA、Opus、AAC、M4A(AAC/ALAC) 等真实样本做播放、时长、seek、下一首与损坏文件测试。未通过实测的 profile 不应标记已支持。
- WASAPI 路径仍经过 Chromium/WebAudio 与 Float32 PCM；`bitPerfect=false`。真正 bit-perfect 需要 native decoder 直接输出至 exclusive endpoint，2.2.1 未实现。
- Gapless / Crossfade 双 Deck 未实现。不要把普通 ended 事件后切下一首称作 gapless。
- 五寸屏专用扬声器真实出声、Windows 其他应用输出隔离、设备拔插 / 默认设备变更、独占期间系统声音行为、长时间 underrun 与真实格式文件，仍需目标 Windows PC 验收。
- 六种 USB 模式、Windows 桌面壁纸不被遮挡、睡眠 / 唤醒、混合 DPI 和 Turing COM3 长期稳定性也不能由 Hosted CI 推断。

## 架构不变量

1. 只有主 Renderer 持有实际媒体播放宿主；Dock / HUD / USB 是控制端。
2. static / gif 不保留独立 wallpaper audio；video 播放仍独立且不显示音乐迷你控件。
3. 音频 endpoint 与五寸 USB 显示目标是两个独立设置；设备暂不可用时保留所选身份并明确显示状态。
4. 默认不自动续播；不复制、重编码或删除原始音乐文件。
5. 不顺手重做现有监控、Turing、天气、HUD 布局和主题。

## 后续开发方式

用户已明确偏好直接在 `main` 开发。个人项目默认不建功能分支 / PR。2.2.1 是已发布版本；任何应用行为修改应从 2.2.2 开始，按版本规则同步所有 14 项门禁检查字段。文档修订可以独立提交，但不能修改或覆盖 v2.2.1 Release 资产。

## 源码地图与验证

| 路径 | 重点 |
|---|---|
| `src/main/index.ts` | 音乐 IPC、单一 Music Service、曲库持久化、窗口与显示器生命周期 |
| `src/main/music-metadata.ts` | ID3 / FLAC / WAV / Ogg / Opus / M4A 元数据 |
| `src/main/music-exclusive-output.ts` | 主进程 WASAPI 状态与 IPC |
| `native/wasapi-output/binding.cpp` | native WASAPI endpoint / PCM ring buffer |
| `src/renderer/music-player.tsx` | 曲库、播放状态与控制面 |
| `src/renderer/App.tsx` | USB 六模式及非音乐既有 UI |
| `src/shared/types.ts`, `src/preload/index.ts` | 类型与受控 IPC |
| `tests/` | 音乐、窗口、显示器及硬件回归 |

PowerShell 使用 `npm.cmd`。标准验证命令见 [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md)。每次继续开发前重新核对 main HEAD、版本、最新 Actions 和 Release。
