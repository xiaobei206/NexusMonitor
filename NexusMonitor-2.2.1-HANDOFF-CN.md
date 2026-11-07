# NexusMonitor 2.2.1 — 当前开发交接

**本文件是 2.2.1 唯一当前交接入口。** 新会话请先读 [START-HERE-NEXT-GPT.md](START-HERE-NEXT-GPT.md)、[AGENTS.md](AGENTS.md)，再读本文与 [2.2.1 音乐平台重构设计](docs/MUSIC-PLATFORM-2.2.1-CN.md)，最后读 [跨版本唯一开发日志](NexusMonitor-DEVELOPMENT-LOG-CN.md)。

## 目前状态（必须在每次接手时重新核实）

- 基线正式版本：2.2.0，`main` 起点 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`。
- 当前开发分支：`feature/2.2.1-music-platform`，由上述 main 基线创建。
- 目标版本：2.2.1。
- 开发策略：文档先行，随后分批接入曲库元数据 / 常用格式导入 / 第六显示模式；每个阶段都要经 Windows CI 验证。
- 当前已完成首批源代码接入（详见下方进度）；尚未创建 PR / 未运行 2.2.1 Windows CI / 未通过目标机实测。每次接手都必须重新读取当前 branch HEAD 和 Actions。
- 当前 2.2.0 问题事实：`src/main/index.ts` 的音乐扩展集合只含 `.mp3`；主播放器 UI / 导入提示也硬编码 MP3；旧静态 / GIF 壁纸另有音频元素与音乐路径；USB 输出模式当前只有五个；曲库没有完整标签 / 封面 / 音频设备数据模型。
- 2.2.0 main 的测试基线曾报告主测试 188/188，Renderer/Vite 构建、PawnIO、.NET、Storage Tests 全通过；这是历史基线，不是本分支新代码的测试结果。

## 当前实现进度（2026-11-07；每次接手重新核实）

- 稳定基线：`main` 2.2.0，提交 `bc0d29f19fbb98f7ea994fbe30dc68dfb35a38c9`。当前开发分支：`feature/2.2.1-music-platform`，目标版本 `2.2.1`。
- 文档基座已建立：当前入口、交接、设计、统一开发日志都在仓库；新会话首先读 `START-HERE-NEXT-GPT.md`、本文和音乐平台设计文档。
- 元数据模块：`src/main/music-metadata.ts` 可 best-effort 读取 ID3v1/v2、FLAC Vorbis comments / STREAMINFO / artwork、WAV INFO / fmt、Ogg Vorbis / Opus comments 和 M4A atoms。当前有合成 MP3 / FLAC / WAV fixtures；内嵌封面存入应用 data 目录。
- 曲库导入：白名单扩展至 MP3 / WAV / FLAC / OGG / OGA / Opus / M4A / M4B / AAC。**这是导入过滤范围，不等于已实测每种编码的 Chromium 解码能力。** WMA / ALAC / AIFF / APE / WavPack / TTA / Musepack / DSF / DFF 仍未纳入支持承诺。
- 曲库界面：歌曲、专辑、艺术家、流派、文件夹、自定义歌单入口已实现；按标签 / 文件路径分组；封面卡片读取嵌入封面。支持在当前视图搜索。
- 播放器 UI：去除 MP3-only 提示和硬编码格式列；所有音乐仍由长期存活的主 Renderer 唯一播放宿主播放。Dock、HUD、USB 输出只发送命令 / 显示状态。
- 静态 / GIF：旧背景音乐控件、旧音频 URL IPC 和第二个 HTMLAudioElement 已移除；全部改用统一 Music Service，避免双响。
- 第六模式 `music-only`：选择后关闭 USB 输出 BrowserWindow；程序启动恢复时也保持窗口隐藏，Windows 原生桌面壁纸可见，主 Renderer 的 Music Service 仍继续运行。视频模式仍独立。
- 输出设备：音乐库已加入 Windows 输出设备选择、设备枚举 / 变化刷新、保存 device ID/label、`HTMLMediaElement.setSinkId` 路由状态、设备选择弹窗与 440 Hz 测试音。当前不支持时提示 unsupported，设备消失时保留用户选择并提示 unavailable。**尚未在用户真实电脑确认五寸屏扬声器实际出声。**
- 当前 Windows CI：Run #44 **成功**，HEAD `fafbe3e24c9e5127de6608bb72c9cacd3a65aaea`。14/14 版本门禁、195/195 Node 测试、Renderer TypeScript + Vite 生产构建、PawnIO 官方资源校验、.NET Release（0 Warning / 0 Error）、Storage Tests 全部通过。<https://github.com/xiaobei206/NexusMonitor/actions/runs/42344000038>
- 当前 PR #2：<https://github.com/xiaobei206/NexusMonitor/pull/2>。本次记录后还会有新提交；每次接手必须重新读取 PR HEAD 与最新 Actions，不能把上述 HEAD 当作永远的最新版本。
- 未完成：WASAPI Exclusive 原生后端 / 实际采样率与位深协商、bit-perfect 验证、EQ / ReplayGain / gapless / crossfade / 同步歌词 / 波形与频谱、每种宣称支持的格式真实文件播放矩阵、安装包发布与目标 PC 实机验收。未通过实机测试前不能声称这些能力已完成。

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
