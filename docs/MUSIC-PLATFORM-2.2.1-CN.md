# NexusMonitor 2.2.1 音乐平台重构设计（持续更新）

**文档状态：** 开发基准 / 以本分支最新源码和 Actions 为准。本文是设计约束，不代表尚未落地的功能已经完成。  
**基线：** `main` 的 NexusMonitor 2.2.0，提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`。  
**开发分支：** `feature/2.2.1-music-platform`。  
**目标：** 将 2.2.0 的 MP3 专用播放器升级为可靠的本地音乐平台，同时统一音频生命周期、五寸副屏显示模式和输出设备管理。

## 1. 架构决策（不得偏离）

- **Nora 是交互设计与曲库组织的主要参考。** 参考其歌曲 / 艺术家 / 专辑 / 流派 / 文件夹 / 搜索 / 播放列表 / 队列 / 迷你与完整播放器的组织方式；不是把 Nora 整个应用嵌入 NexusMonitor。
- **NewAmp 是音频能力参考。** 重点调查格式解码、格式信息、EQ、ReplayGain、gapless、crossfade、歌词和 WASAPI 输出；只有经过依赖、维护成本、Windows 打包与许可证评估后才借鉴实现，不凭文档宣传宣称功能已支持。
- **NexusMonitor 自己拥有唯一 Music Service。** 所有音乐操作进入共享的状态 / 命令接口；主界面、Dock、HUD 和 USB 输出层只作为不同的控制表面。任何子窗口不得建立第二个音乐播放引擎。
- **监控、Turing 3.5 英寸屏、天气、主题、HUD 布局、插件及窗口生命周期不是播放器重构的顺手清理范围。** 对这些既有模块只做为音乐功能明确所需的最小连接。
- **视频输出模式保持独立。** 视频原生循环播放流程不能被 Music Service 接管；视频模式不显示音乐迷你播放器。
- 用户只有一首曲库歌曲，无需兼容旧版 music-library.json 的多代 schema。但旧壁纸音频设置及其它用户设置要明确处理，不能留下两套并行音频状态。

## 2. 数据流与窗口生命周期

```text
Main process: library / playlist / persistence / IPC / device inventory
                          |
               Music Service contract
                          |
          Main renderer: single audio host
              /           |            \
       Main library    Dock / HUD    USB mini controls
                                         |
                         output mode controls visibility only
```

- 主 Renderer 的音乐宿主必须独立于当前路由；主窗口隐藏到托盘、Dock 隐藏、HUD 关闭或副屏切换，不应卸载播放引擎。
- USB 输出模式是显示策略，不是 Music Service 的开关。
- 音频输出设备和五寸副屏显示目标是两个独立设置。选择五寸屏喇叭后，即使副屏进入无输出窗口的桌面壁纸音乐模式，仍应向该 endpoint 播放。
- 应用重启时恢复曲库、队列 / 当前选择、播放位置、音量、设备选择和模式，但默认**不自动发声**。
- 静态壁纸 / GIF 模式不再拥有独立 HTMLAudioElement 或独立背景音控制状态。旧背景音乐设置应被显式迁移 / 清理：保留原始文件不动，解除旧自动播放路径，并用 Music Service 统一控制。不得把旧背景音和新服务同时播放。
- 设备不可用时保持选中的设备身份，显示不可用状态并提供恢复 / 回退操作；不能默默改写用户选择为 Windows 默认设备。

## 3. 六种五寸输出模式

| ID | 用户可见名称 | 输出窗行为 | 音乐行为 |
|---|---|---|---|
| `monitor` | 硬件监控 | 显示现有监控仪表盘 | 显示简易音乐控制，音乐由共享服务播放 |
| `static` | 静态壁纸 | 显示本地图片 | 显示简易音乐控制；禁止独立壁纸音频引擎 |
| `gif` | GIF 壁纸 | 显示循环 GIF | 显示简易音乐控制；禁止独立壁纸音频引擎 |
| `weather-clock` | 天气时钟 | 显示现有天气时钟 | 显示简易音乐控制，天气 / 时钟 UI 不被重排 |
| `video` | 视频播放 | 保持现有视频循环播放器 | 不显示音乐控制；视频音频仍由视频路径处理 |
| `music-only` | 桌面壁纸 + 音乐 | **隐藏 NexusMonitor 的五寸输出窗口**，让 Windows 桌面壁纸原样显示 | Music Service 继续运行；主界面 / Dock / HUD 继续可控；输出设备仍可以是五寸屏喇叭 |

`music-only` 不是新的桌面覆盖层、桌面壁纸管理器或播放器窗口；实现要点是隐藏 / 不创建可见的 USB 输出窗口，同时保留模式与音频服务状态。恢复到其它模式时复用已保存显示器 ID，不能猜选目标屏幕。

## 4. 曲库与音频能力分级

### 2.2.1 基础验收范围

- 支持批量文件导入与文件夹扫描；识别实际格式，不再把列格式、提示语、格式列硬编码为 MP3。
- 曲库基础字段：标题、艺术家、专辑、封面、年份、流派、曲目编号、时长、实际格式 / 编码信息、文件路径、加入时间、缺失状态。未能解析的元数据可回退到文件名，不能捏造。
- 曲库入口：歌曲、专辑、艺术家、文件夹、播放列表；支持搜索 / 排序和清晰的当前队列。
- 基础传输：播放 / 暂停、上一首 / 下一首、拖动进度、音量、随机、循环模式、队列和缺失文件处理；保持主界面、Dock、HUD、USB 迷你控件状态同步。
- Windows 音频 endpoint 列表、设备选择、输出测试音 / 可验证的播放确认、保存设备选择；设备更改失败时显示实际状态。
- 常用格式目标清单：MP3、WAV、FLAC、OGG / OGA、Opus、AAC、M4A（AAC / ALAC）。每项必须在 Windows Electron 实际解码器上用真实文件验证；不得仅凭扩展名白名单宣称已支持。
- 扩展格式候选：WMA、AIFF、APE、WavPack、Musepack、TTA、MKA、AC3、DTS、DSF / DFF。先验证 NewAmp / FFmpeg / 原生后端的依赖、许可、体积和可打包性；只有解码路径落地并有测试后才列为已支持。

### 后续音频能力

- EQ、ReplayGain、gapless、crossfade、同步歌词（LRC / 嵌入歌词）、波形寻址、频谱 / VU、睡眠定时器、A-B 循环、CUE / M3U / PLS。
- WASAPI 独占模式是正式候选，不是禁止项。第一步建立 endpoint 选择及失败反馈；独占模式需先验证原生依赖、目标 endpoint 独占语义、设备采样率 / 位深协商及回退路径。仅有 `exclusive=true` 状态不构成实现成功。
- 独占模式不等于 bit-perfect。只有当实际信号链、重采样、效果处理、共享混音路径和设备格式均得到验证时才可以显示相应能力声明。
- Auto DJ、智能播放列表、Audio DNA / 相似歌曲推荐是后续可选项，不能阻塞基础播放器。

## 5. 已落地实现与验证边界（以最新源码为准）

- `src/main/music-metadata.ts` best-effort 读取 ID3v1/v2、FLAC Vorbis comments / STREAMINFO / picture、WAV INFO / fmt / data、Ogg Vorbis / Opus comments、M4A atoms、ReplayGain Track/Album Gain 与 Peak。损坏或不完整标签不会阻止导入。内嵌封面放入 `%APPDATA%\\NexusMonitor\\music-artwork`，Renderer 只通过 track ID 请求封面 URL。
- 曲库导入白名单 MP3 / WAV / FLAC / OGG / OGA / Opus / M4A / M4B / AAC。此白名单是导入过滤范围，不等于具体编码已经逐一确认能由 Electron Chromium 播放。WMA / AIFF / APE / WavPack / TTA / Musepack / DSF / DFF 暂无支持承诺。
- Nora 风格曲库视图：全部歌曲、专辑、艺术家、流派、文件夹、自定义歌单；按元数据与本地路径分组，卡片展示内嵌封面，搜索标题 / 艺术家 / 专辑 / 流派。
- M3U / M3U8 本地歌单导入与 M3U8 导出：解析本地相对路径和 Windows 绝对路径，忽略 URI / 网络流，限制文件大小与条目数；不把路径传给远端服务。
- 独立 Windows 输出 endpoint：系统设备选择器（Chromium 提供时）、枚举与 devicechange、保存设备 ID / label、HTMLMediaElement.setSinkId、440 Hz 测试音与真实状态提示。启用 Web Audio 处理后尝试 AudioContext.setSinkId；不支持或设备消失时明确反馈，不静默改用其他设备。该方案不是 WASAPI Exclusive native engine。
- Music Service 仍只有主 Renderer 的唯一媒体宿主。静态 / GIF 独立背景音链路已移除；所有模式共用服务。非视频模式可显示迷你控制，视频模式维持原生视频循环。
- 六种副屏模式：硬件监控、静态壁纸、GIF 壁纸、天气时钟、视频播放，以及 `music-only` 桌面壁纸 + 后台音乐；最后一种关闭 USB 输出窗口，不覆盖 Windows 原生桌面。
- 十段 EQ：31 Hz / 62 Hz / 125 Hz / 250 Hz / 500 Hz / 1 kHz / 2 kHz / 4 kHz / 8 kHz / 16 kHz，±12 dB；默认全部 0 dB，播放时按需创建 Web Audio filter chain。
- ReplayGain：启用/禁用，Track / Album 模式；解析标签并经 GainNode 应用，按 Peak 限制增益；没有 Peak 时只允许衰减，不做正向 boost。
- 同名 LRC：仅从歌曲所在目录加载同名 .lrc，最大 1 MiB，支持多时间戳 / offset / BOM；不联网、不上传。播放时间通过二分查找当前行。
- 睡眠定时：15 / 30 / 45 / 60 / 90 分钟，到时只暂停播放，不退出程序或关闭副屏；定时器存活于主 Renderer 全局状态。
- 解码 / 文件缺失 / 读取失败等播放错误进入 MusicState，并显示在 Library / MiniPlayer / Dock。
- **Windows CI Run #104 成功：** 14/14 版本门禁、Node 210/210、Renderer TypeScript + Vite production build、PawnIO resource validation、.NET Release build 0 Warning / 0 Error、Storage Tests。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42348842265>。验证 HEAD 为 `c8d24d28d353834cc04059eb2637a46ef8d94e78`；随后 CSS 收尾提交 `b3f95d984118f74974f46dc62acde93d69a21908` 仍须跑最终 CI。
- 未完成：WASAPI Exclusive / bit-perfect、Gapless / Crossfade、播放内嵌歌词和在线歌词、waveform / spectrum / Auto DJ、逐格式真实音频解码验收、实际输出设备 / 五寸屏喇叭 / USB 显示器目标机测试、正式 2.2.1 Release。


## 6. 工程规则

1. **文档先于大规模修改。** 每个新会话先读 `START-HERE-NEXT-GPT.md`、`AGENTS.md`、本交接文档与本文；先检查远端 branch HEAD、`VERSION`、PR / Actions 状态。
2. 每一阶段形成可编译、可回归的提交；不要只堆一大批未经验证的代码。不要使用 FIX / FIX1 版本名。
3. 升级版本时同步 `VERSION`、package / lockfile、HardwareService 版本字段、Renderer 版本展示、发布构建入口和版本校验器所检查的所有字段。
4. 所有新增 IPC 必须同时更新 shared types、main、preload、Renderer 和回归测试；IPC 不能向 Renderer 暴露任意文件系统能力。
5. 所有音频行为有明确状态：加载 / 就绪 / 播放 / 暂停 / 已结束 / 文件缺失 / 格式不支持 / 输出设备不可用 / 解码失败。错误不能静默吞掉。
6. 绝不把用户文件路径、曲库数据、个人 settings 或运行日志加入仓库。曲库只保存文件引用和元数据，不拷贝或删除原始音频。
7. CI 成功只证明 hosted Windows runner 构建 / 测试通过，不能声称已实测目标扬声器、五寸屏、混合 DPI、拔插和长期播放。

## 7. 自动化与实机验收矩阵

### 自动化

- 版本门禁所有检查通过。
- 主进程构建和 Node 回归测试通过。
- Renderer TypeScript 与 Vite production build 通过。
- 曲库格式过滤、元数据回退、播放列表 / 队列边界、无自动续播、端点缺失状态、单一音源约束的回归测试通过。
- Windows .NET build / hardware-storage tests 不回归。
- 安装包和 SHA-256 在 Release 阶段生成；CI 与 Release 发布状态单独记录。

### 目标 PC 实测（仅用户真实机器能确认）

- 五寸屏喇叭可被枚举、选择、实际出声，且其它系统音频继续走用户自己的输出设备。
- 播放中切换输出设备、拔插 USB 音频设备、睡眠恢复和程序重启后的恢复行为。
- 六种显示模式切换、桌面壁纸 + 音乐模式不占副屏窗口、Windows 壁纸不被覆盖。
- 主界面隐藏到托盘 / Dock / HUD / USB 输出之间控制同步；不会突然停播或双响。
- 每种宣称支持的格式使用实际文件播放，并验证时长、拖动进度和下一首边界。
- EQ / 重采样 / 独占模式的信号链需要单独测试，不通过推断标记通过。
- Turing COM3、天气、硬件监控、主题和其它既有功能无回归。
