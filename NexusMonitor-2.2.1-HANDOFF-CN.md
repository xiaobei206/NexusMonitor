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

- 已完成：2.2.1 架构 / 接手文档；版本升至 2.2.1 并同步 14 项版本门禁涉及文件与新构建入口。
- 已完成：新增 `src/main/music-metadata.ts`；目前实现 ID3v2 / ID3v1 基础标签、FLAC Vorbis comment / picture / STREAMINFO、WAV INFO / fmt / data、Ogg Vorbis / Opus comments、M4A atom 的尽力解析。元数据读取是 best-effort，异常标签不应阻止音频导入。
- 已完成：导入白名单从 MP3 扩至 MP3 / WAV / FLAC / OGG / OGA / Opus / M4A / M4B / AAC；新导入歌曲写入标签字段，专辑封面存至 `%APPDATA%\NexusMonitor\\music-artwork`，通过 track ID 的 IPC 返回封面 URL。此白名单只代表允许导入，不等于已验证每个编码可播放。
- 已完成：播放器 UI 删除主要 MP3-only 提示，使用歌曲格式字段和元数据搜索；旧静态 / GIF 壁纸独立音频元素与 UI 已移除，统一 Music Service 控制这些模式。
- 已完成：新增 `music-only` 第六模式：选择后主进程关闭 USB 输出 BrowserWindow，启动恢复时也不创建窗口；Windows 桌面壁纸不被 NexusMonitor 覆盖。
- 已增加：`tests/music-metadata.test.cjs`（MP3 / FLAC / WAV 合成标签文件）和 music source regressions。**测试尚未执行；需待 PR Windows CI。**
- 未完成：输出 endpoint 选择 / 持久化 / 设备切换状态 / 测试音、WASAPI Exclusive 评估落地、曲库导航完善（歌曲/专辑/艺术家/文件夹）、音频 decoder 对每个格式的实际支持验收、歌词 / EQ / ReplayGain / gapless / crossfade、CI、安装包和实机验收。

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
