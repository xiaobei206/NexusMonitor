# NexusMonitor — 新接手 GPT 请先看这里

**当前正式版本：2.2.3；唯一工作基线：GitHub `main`。**

- 正式 Release：[NexusMonitor 2.2.3](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.3)
- 最终 Windows CI：[Run #186](https://github.com/xiaobei206/NexusMonitor/actions/runs/42360024896)，结论 success。
- 应用代码基线：`317a093f562ce1950e91d53e72c56a8ee0cad079`。
- Node 主进程测试 238/238；版本一致性 14/14；Renderer/Vite、Windows N-API WASAPI、PawnIO、.NET Release、Storage Tests、NSIS、SHA-256、Release 与 artifact 上传全部成功。
- 安装包：[NexusMonitor-2.2.3-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.3/NexusMonitor-2.2.3-Setup.exe)，160,013,866 bytes。
- SHA-256：`bf405f570f01a72b8ad6382417a5eaed1326c795e022645f742ef16078f2c9cd`。

## 2.2.3 本轮修复

用户在 Windows 目标机实测 2.2.2：P4 Mono UAC Direct v62 的 WASAPI 显示已打开（mono/S16/48 kHz），但音乐无声；取消独占后未及时恢复，后来才从 Windows 默认设备出声。用户同时要求歌词联网自动搜索，不准备本地 LRC 文件。

- AudioWorklet 的独占 PCM 采集与共享输出静音拆成两个状态。
- 独占刚打开时继续保持普通输出可听；只有 native `acceptedBytes > 0` 且 `framesRendered > 0` 后才静音共享输出。
- 播放中 2.5 秒仍无有效 PCM 帧时自动恢复普通输出；关闭、打开失败、native runtime error 都显式恢复 AudioContext、output sink 和此前正在播放的 HTMLAudioElement。
- 状态文字区分 endpoint opened 与 PCM output stream confirmed；不能据此宣称实体扬声器已出声。
- 本地同名 LRC 优先；否则自动查询 LRCLIB。优先同步歌词，无同步歌词时显示可滚动纯文本；未命中、离线、超时、429 都不会影响播放。
- 只向 LRCLIB 发送曲名、艺术家、专辑、时长，不上传音频文件或绝对路径；歌词仅在内存缓存。

## 下一步目标机验收

1. 开启 P4 WASAPI 独占后确认真实扬声器连续有声。
2. 确认开启期间没有明显静音或重复声；关闭独占后立即恢复所选普通输出设备。
3. 模拟原生打开失败或无 PCM 输出，确认 watchdog 会自动恢复普通音频。
4. 本地没有 LRC 时确认在线同步歌词 / 纯文本歌词能显示；未命中和断网不影响播放。
5. 再检查六种 USB 模式、桌面壁纸 + 音乐、托盘隐藏、睡眠唤醒与 Turing COM3。

## 工程规则

用户明确偏好个人项目直接在 `main` 开发，不创建功能分支或 PR。下一轮正式行为修改从 2.2.4 开始，必须同步版本门禁。阅读顺序：本文件 → `AGENTS.md` → `NexusMonitor-2.2.3-HANDOFF-CN.md` → `NexusMonitor-2.2.3-BUILD-REPORT.md` → 唯一开发日志 → 源码与测试。
