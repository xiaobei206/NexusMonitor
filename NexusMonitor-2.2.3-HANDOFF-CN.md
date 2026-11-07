# NexusMonitor 2.2.3 — 实机问题修复与自动歌词

**状态：** 源码已提交到 main；CI 与正式安装包结果待验证。  
**版本：** 2.2.3（从 2.2.2 递增）  
**稳定回滚点：** [v2.2.2](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.2)

## 用户实机反馈

P4 Mono UAC Direct v62 显示 WASAPI 独占已打开（mono/S16/48000 Hz），但音乐停止输出；关闭独占后音乐也未立即恢复，后来才从 Windows 默认音频设备播放。此问题说明之前只确认 endpoint open 不足以确认音频输出。

## WASAPI 变更

- AudioWorklet 独占采集与共享输出静音拆成两个状态。
- 开启独占时，PCM tap 继续把 Float32 stereo PCM 送给 native，但先保留共享输出可听，防止原生输出没有数据时静音。
- native 的 `acceptedBytes` 和 `framesRendered` 都大于零后才静音共享输出，并显示 PCM 输出流已确认。
- 播放中 2.5 秒仍没有接受 PCM 或渲染帧，自动关闭 native endpoint 并恢复普通输出。
- 关闭独占、打开失败、native runtime error 使用统一恢复函数：关闭 WASAPI、关闭 tap 独占/静音、恢复 AudioContext、重新应用用户所选 output sink；若之前状态仍在播放而 HTMLAudioElement 已暂停，则尝试恢复播放。
- endpoint open 与 PCM output status 分离；仍不宣称实体扬声器有声，需目标 PC 验收。

## 自动歌词

- 同名本地 LRC 优先。
- 没有有效本地 LRC 时调用 LRCLIB `/api/get`，未命中后使用 `/api/search`。
- 搜索只使用曲名、艺术家、专辑、时长；绝不发送音频文件、绝对路径或曲库文件。
- 同步 LRC 按播放时间显示；只有纯文本时展示可滚动的完整歌词，不伪造时间戳。
- 无歌词、超时、离线和 429 均降级为空结果，不影响播放器。
- 仅内存缓存：成功 24h，未命中 10min，上限 300 首。LRCLIB 文档要求客户端遵守 429 限流响应。

## 自动化与目标机验收

本次提交后检查 Windows CI：Node tests、Renderer TypeScript/Vite、WASAPI native MSVC build、.NET Release、Storage Tests、NSIS 和版本一致性 14/14。Mock tests 覆盖同步/纯文本/未命中/429。

目标机仍需验证：
1. P4 WASAPI 独占开启后能听到连续音乐。
2. 开启过程中共享输出在 native PCM 未确认前不静音。
3. 关闭独占、打开失败和无 PCM watchdog 都能立即恢复普通播放。
4. 输出设备路由回到用户所选 endpoint，不意外留在系统默认设备。
5. 自动歌词在线命中/纯文本/未命中/断网行为。
