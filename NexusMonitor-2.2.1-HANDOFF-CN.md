# NexusMonitor 2.2.1 — 当前开发交接

**本文件是 2.2.1 唯一当前交接入口。** 新会话请先读 [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md)、[AGENTS.md](AGENTS.md)，再读本文与 [2.2.1 音乐平台重构设计](docs/MUSIC-PLATFORM-2.2.1-CN.md)，最后读 [跨版本唯一开发日志](NexusMonitor-DEVELOPMENT-LOG-CN.md)。

## 目前状态（必须在每次接手时重新核实）

- 基线正式版本：2.2.0，`main` 起点 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`。
- 当前开发分支：`feature/2.2.1-music-platform`，由上述 main 基线创建。
- 目标版本：2.2.1。
- 开发策略：文档先行，随后分批接入曲库元数据 / 常用格式导入 / 第六显示模式；每个阶段都要经 Windows CI 验证。
- 当前 PR #2 已存在且仍开放；最近完整成功 Windows CI 为 Run #109，检查当前 HEAD `3152aa5a16b4ff52d0bf026fcd5e1d962cf19f4c`。该 Run 覆盖当前分支 tip。接手者仍须重新检查 PR HEAD 和 Actions。
- 当前 2.2.0 问题事实：`src/main/index.ts` 的音乐扩展集合只含 `.mp3`；主播放器 UI / 导入提示也硬编码 MP3；旧静态 / GIF 壁纸另有音频元素与音乐路径；USB 输出模式当前只有五个；曲库没有完整标签 / 封面 / 音频设备数据模型。
- 2.2.0 main 的测试基线曾报告主测试 188/188，Renderer/Vite 构建、PawnIO、.NET、Storage Tests 全通过；这是历史基线，不是本分支新代码的测试结果。

## 当前实现进度（2026-11-07；每次接手重新核实）

- 稳定基线：`main` 2.2.0，提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`。当前开发分支 `feature/2.2.1-music-platform`，PR #2，目标版本 2.2.1。
- **统一 Music Service：** 主 Renderer 持有唯一媒体宿主；Dock / HUD / USB 输出只发送控制或展示状态。静态/GIF 旧音频 IPC 与第二个 audio 已移除。
- **格式与标签：** 本地导入 MP3 / WAV / FLAC / OGG / OGA / Opus / M4A / M4B / AAC；best-effort 读取 ID3v1/v2、FLAC STREAMINFO / Vorbis comments / picture、WAV INFO / fmt、Ogg Vorbis / Opus identification + comments、M4A audio sample entry / atoms、ReplayGain Track/Album Gain + Peak。Ogg/Opus/M4A 已补 channel / sample-rate fields。**导入白名单不等于每个 codec 的实际文件解码已验收。**
- **旧库升级：** 2.2.0 旧曲目如果缺少 2.2.1 新字段，仅在首次加载时读取一次原始音频标签 / 封面并回写 music-library.json；保存后下次启动不重复扫描。旧文件名标题和“本地音乐/未知艺术家”占位会在找到真实 tag 时补全。播放列表、当前曲目、音量与进度原值保留。**此项是 Run #162 之后的新提交，须由当前最新 CI #164 验证。**
- **曲库 UI：** 歌曲、专辑、艺术家、流派、文件夹、自定义歌单；封面卡片、当前视图搜索；M3U/M3U8 本地歌单导入/导出，拒绝网络 URI。
- **音效：** 10 段 EQ（31 Hz–16 kHz、±12 dB、9 个预设、默认平直）；ReplayGain Track/Album + Peak 防削波；本地同名 LRC 同步歌词；15/30/45/60/90 分钟睡眠定时；解码/文件错误状态可见。
- **普通 endpoint 路由：** Windows 输出设备枚举 / Chromium selector / 保存 deviceId / setSinkId / 440 Hz 测试音 / unsupported & unavailable 提示。
- **WASAPI Exclusive 原生输出现已接入代码：** N-API addon `native/wasapi-output/nexus_wasapi.node`；主进程 singleton 与受信任 IPC；原生端点列表、format probe、open / start / pause / close / stats；Renderer AudioWorklet 抽取 2ch Float32 PCM，按 `AudioContext.sampleRate` 协商 WASAPI exclusive，再经 PCM IPC/ring buffer 输出。暂停时 Stop native client 并清空积压 PCM；运行错误时关闭独占、解除 Worklet 静音并恢复普通输出；面板显示格式、采样率、缓冲量与欠载数。PCM IPC 每块限制 64 KiB 且须按 stereo float32 帧对齐。
- **bit-perfect 真实性：** 当前实际路径是 Chromium 解码 / Web Audio → Float32 PCM → native WASAPI；状态与 UI 始终 `bitPerfect: false`。格式协商只显示“源格式/设备能力匹配候选”，不宣称 bit-perfect。要做真正 bit-perfect，需直接由 native decoder → exclusive endpoint，不经 Chromium/WebAudio。
- **六种 USB 模式：** 硬件监控、静态壁纸、GIF、天气时钟、视频、`music-only` 桌面壁纸 + 后台音乐。第六模式隐藏 USB 输出 BrowserWindow，但主 Music Service 继续播放。
- **Run #162 已完整成功（PR CI）：** <https://github.com/xiaobei206/NexusMonitor/actions/runs/42353103480>。14/14 版本门禁、Node 224/224、Renderer TypeScript + Vite production build、native WASAPI N-API build、PawnIO official resource validation、.NET Release、Storage Tests 全部通过。原生构建日志明确显示 Node 24.22.2 + node-gyp 13.1.0 + Python 3.15.2 + Visual Studio 2026 18.11，产物 `native/wasapi-output/build/Release/nexus_wasapi.node` 已成功生成。
- **当前最新代码 HEAD：** `35e4d5e12829e116d8e2a36966436dbbddc90379`，包含 Run #162 后的一次性旧库元数据迁移与新回归测试；当前 CI Run #164 正在验证。必须以其最终结论决定下一步，不能把 #162 当作最新代码完整通过。
- **PR #2**：<https://github.com/xiaobei206/NexusMonitor/pull/2>，尚未合并；PR CI 按设计跳过 NSIS / GitHub Release，所以还没有 2.2.1 安装包。
- **待做 / 未实机验证：** gapless / crossfade 双 Deck；支持格式的实际音频文件播放矩阵；WASAPI 五寸屏喇叭实机、endpoint 拔插 / 默认设备变化、独占占用期间其他程序表现、长时间 PCM underrun 验收；六种 USB 模式在目标机验收；正式 NSIS 安装包和 SHA-256；目标 PC 安装验收。
- 任何时候都要区分：Hosted CI ≠ 用户 PC 实测；导入 ≠ 解码播放；WASAPI Exclusive ≠ bit-perfect。


## 本轮目标

把当前播放器从“只适合验证链路的 MP3 最小实现”升级成可持续扩展的本地音乐平台，不是只重绘封面或增加按钮。完整决策、六种副屏行为、格式验收清单、输出设备及独占模式边界以 [音乐平台设计文档](docs/MUSIC-PLATFORM-2.2.1-CN.md) 为准。

### 不可退让的架构约束

- Nora：曲库、导航、歌曲 / 艺术家 / 专辑 / 文件夹、搜索、播放列表、队列、迷你 / 完整播放器交互的主要参考。
- NewAmp：解码与格式回退、音质链路、EQ / ReplayGain / gapless / crossfade / 歌词 / WASAPI 能力参考。
- NexusMonitor 拥有唯一 Music Service 与队列、状态、持久化和输出设备管理；不将 Nora / NewAmp 整个套壳或拉起外部播放器。
- 只有主 Renderer 持有音频播放宿主。HUD、Dock、USB 显示输出仅作为控制端。
- 模式 1 监控、2 静态壁纸、3 GIF、4 天气时钟、5 视频、6 桌面壁纸 + 后台音乐。第六模式隐藏 / 不创建可见 USB 输出窗，Music Service 不停止；视频模式不显示音乐 UI。
- 静态 / GIF 不再拥有独立背景音引擎；严禁双重音频。
- 输出 endpoint 与副屏显示模式独立；允许选择五寸屏喇叭，目标设备不可用时显示状态并允许恢复，不暗中切回默认设备。
- 不自动续播；不拷贝、重编码或删除原始音乐文件。
- 不改变现有监控、天气、Turing、HUD 布局、主题等无关功能。

## 建议推进顺序

1. **文档基座（当前阶段）：** 建立交接文档、架构决策与日志，再更新 README / START HERE 中的版本指向。
2. **版本与模型：** 将版本升至 2.2.1；统一 `MusicTrack`、`MusicState`、设置与 IPC 类型；建立格式 / 元数据能力字段。保留对无标签文件和缺失路径的处理。
3. **统一音频路径：** 取消静态 / GIF 的旧音频元素，确保主 Renderer 的单一播放宿主在模式切换、主面板隐藏和托盘期间持续存在。
4. **曲库 UI 与导入体验：** Nora 风格的信息架构（歌曲、专辑、艺术家、文件夹、播放列表、搜索、队列、封面 / 元数据）；不使用“添加本地 MP3”等假设全库仅 MP3 的提示。
5. **解码与音频格式：** 先列明经过真实文件验证的内置格式，再引入解码回退或依赖。扩展格式支持必须有实测文件与错误提示，不可以只把扩展名加入 Set。
6. **输出设备：** endpoint 查询 / 选择 / 持久化 / 测试音 / 断连状态；再评估 WASAPI 独占原生后端，清楚分开“已实现”“可协商”“未验证”，禁止虚称 bit-perfect。
7. **第六模式：** 更新 shared type、设置 UI、窗口生命周期与 startup restore；切换时隐藏 USB 输出窗但不停止 Music Service；切回其它模式恢复原窗口。
8. **自动化回归：** 新增格式、队列、单播放器、旧音频移除、六模式、输出设备状态、版本元数据门禁测试。
9. **版本文档 / CI / 发布：** 完整同步 version files、build-release 入口、README、开发日志、handoff、构建报告、SHA-256；确认 Actions 新运行全绿后再合入 main 并打正式 Release。若本轮暂停，准确记录下一步与失败点。

## 源码地图（每次仍需核对现状）

| 路径 | 重点 |
|---|---|
| `src/main/index.ts` | 单一曲库与 IPC、持久化、音乐格式白名单、显示输出窗生命周期、显示器拓扑 |
| `src/shared/types.ts` | `MusicTrack` / `MusicState` / `MusicCommand`、`AppSettings.usbDisplayMode` |
| `src/preload/index.ts` | 受控 music / endpoint IPC |
| `src/renderer/music-player.tsx` | Music runtime、主曲库、Dock、HUD MiniPlayer |
| `src/renderer/music-player.css` | 主界面播放器与迷你播放器样式 |
| `src/renderer/App.tsx` | 六个 USB 输出模式、旧壁纸音频、控制可见性、主 UI 路由 |
| `src/renderer/vite-env.d.ts` | preload API 的类型声明 |
| `tests/music-player-source.test.cjs` | 音频唯一实例、HUD / USB 模式、窗口生命周期的源码回归 |
| `scripts/validate-release-version.cjs` | 版本字段一致性 |
| `.github/workflows/windows-ci.yml` | Windows CI / Release 打包与发布 |

## 验证命令（Windows PowerShell）

```powershell
npm.cmd ci --include=dev --no-audit --no-fund
node .\scripts\validate-release-version.cjs
npm.cmd run test:main
npm.cmd run build:renderer
dotnet build .\HardwareService\HardwareService.csproj -c Release
npm.cmd run test:storage
```

如果缺失官方 PawnIO MCHBAR 资源，使用现有的 `scripts/fetch-mchbar-module.ps1` 获取并验证；不要放入空文件或不明二进制代替。

## 验收边界

- 自动化通过才能说 Hosted CI / tests 通过。
- 五寸屏喇叭实际出声、端点独立性、六模式切换、壁纸不被覆盖、USB 拔插 / 睡眠恢复、COM3 Turing 长时间运行，必须在用户真实 Windows 电脑实测后才能勾选。
- 此文档每完成一个阶段都要更新：当前分支 HEAD、CI run ID / URL、已通过测试和尚未执行项。不要依赖 ChatGPT 聊天记录作为状态存储。
