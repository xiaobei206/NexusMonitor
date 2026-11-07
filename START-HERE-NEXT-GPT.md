# NexusMonitor — 新接手 GPT 请先看这里

**当前开发基线：main / 2.2.3；上一个正式版本：2.2.2。**

用户在 Windows 目标机实测 2.2.2 后报告：选择 P4 Mono UAC Direct v62 时 WASAPI 显示已打开（mono/S16/48 kHz），但音乐立即无声；取消独占后也未立即恢复，之后才从 Windows 默认设备出声。用户另要求歌词联网自动搜索，找不到可忽略，不接受手动准备 LRC 文件。

## 本轮改动目标（2.2.3）

1. **WASAPI 安全切换：** PCM tap 进入独占采集状态后，先保留普通音频可听输出；只有原生状态显示已接受 PCM 且渲染了帧，才将共享输出静音。若播放中 2.5 秒仍无已接受 PCM / 已渲染帧，自动关闭原生端点并恢复普通音频。关闭、打开失败和运行时错误都显式恢复 AudioContext、输出路由与此前正在播放的 HTMLAudioElement。
2. **状态准确性：** 不再在仅完成 endpoint open 时宣称音频已正常输出；先显示等待 PCM，原生接受并渲染 PCM 后才报告 PCM 输出流已确认。不能声称物理扬声器已经有声音。
3. **自动歌词：** 同名本地 LRC 优先；无可用本地歌词则请求 LRCLIB，优先取同步 LRC，无同步歌词时显示纯文本；查不到、离线、超时、429 均不影响播放。只发送曲名/艺术家/专辑/时长，不上传音频文件或本地路径。仅使用内存缓存，成功缓存 24h，未命中缓存 10min，缓存上限 300 首。
4. 版本递增到 2.2.3，更新所有 14 项门禁和 release 入口。

## 当前源码地图

- `src/main/music-exclusive-output.ts`：WASAPI 原生端点生命周期、格式协商。
- `native/wasapi-output/binding.cpp`：Windows WASAPI worker、ring buffer、native PCM 输出。
- `src/renderer/music-pcm-tap.worklet.js`：从单一 HTMLAudioElement 捕获 PCM，并在确认 native 输出前保留共享可听输出。
- `src/renderer/music-player.tsx`：音频图、输出恢复、WASAPI 状态监控、歌词面板。
- `src/main/music-lyrics.ts`：LRC 解析与 LRCLIB provider。
- `src/main/index.ts`：本地歌词优先、在线歌词内存缓存与 IPC。
- `tests/music-lyrics.test.cjs`、`tests/music-player-source.test.cjs`、`tests/music-wasapi-mono-source.test.cjs`：相关回归。
- `NexusMonitor-2.2.3-BUILD-RELEASE.cjs`：2.2.3 版本校验/构建入口。
- `NexusMonitor-2.2.3-HANDOFF-CN.md`：本轮接手文档。

## 验收边界

Hosted CI 只能证明自动化和 Windows 编译，不证明 P4 实体扬声器有声。目标 PC 必须验证：开启独占后持续有声；关闭独占立即恢复原输出；模拟打开失败/无 PCM 时普通声音不被切断；确认切换不会重复播放或留下静音音频图；歌词在本地无 LRC 时可联网加载，纯文本/未命中/离线都优雅处理。

## 工程规则

用户明确偏好个人项目直接在 `main` 开发，默认不建分支、不建 PR。正式行为改动必须递增版本号、同步版本门禁、先更新文档并增加回归测试。2.2.2 正式发布仍是稳定回滚点。
