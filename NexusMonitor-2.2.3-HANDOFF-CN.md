# NexusMonitor 2.2.3 — 正式交付交接

**状态：正式发布完成。**  
**开发基线：** `main`  
**应用代码提交：** `317a093f562ce1950e91d53e72c56a8ee0cad079`  
**Windows CI：** [Run #186](https://github.com/xiaobei206/NexusMonitor/actions/runs/42360024896) — success  
**正式 Release：** [v2.2.3](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.3)

## 正式交付物

- 安装包：[NexusMonitor-2.2.3-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.3/NexusMonitor-2.2.3-Setup.exe)
- 大小：160,013,866 bytes
- SHA-256：`bf405f570f01a72b8ad6382417a5eaed1326c795e022645f742ef16078f2c9cd`
- 校验文件：[NexusMonitor-2.2.3-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.3/NexusMonitor-2.2.3-Setup.exe.sha256)
- 安装包未代码签名（项目未配置签名证书）。

## Run #186 验证结果

- 版本一致性：14/14。
- Node 主进程与回归测试：238/238 通过，0 failed。
- Renderer TypeScript / Vite production build：通过。
- Windows N-API WASAPI native addon：编译成功。
- PawnIO 官方资源下载及 SHA-256：通过。
- HardwareService .NET Release 与 Hardware / Storage Tests：通过。
- NSIS x64 安装包、SHA-256 sidecar、GitHub Release、workflow artifact：成功。

## WASAPI 播放切换修复

- PCM tap 独占采集与共享输出静音解耦。
- 打开 WASAPI 时，先继续输出共享音频，同时向 native 提交 Float32 stereo PCM；只有 native 接受 PCM 且渲染帧后，才静音共享输出。
- 正在播放时 2.5 秒内没有接受 PCM / 渲染帧，自动关闭 native endpoint 并恢复普通播放。
- 关闭独占、打开失败、native runtime error 均统一恢复：取消独占/静音、关闭 native endpoint、恢复 AudioContext、重新应用用户所选输出设备；如果先前仍应播放而 HTMLAudioElement 已暂停，则尝试恢复。
- UI 状态区分 endpoint opened 与 PCM output stream confirmed。native 帧计数不是物理声学测量，P4 实际出声仍需目标机验收。
- 仍不宣称 bit-perfect；Renderer Float32 PCM 及单声道下混均不满足 bit-perfect 条件。

## 自动歌词

- 同名本地 LRC 优先；无可用歌词时自动请求 LRCLIB `/api/get`，再按曲名/艺术家/专辑搜索。
- 优先同步歌词；纯文本歌词完整显示为可滚动文本，不伪造时间戳。
- 未命中、超时、离线、HTTP 429 都安全返回空歌词，不影响音乐播放。
- 仅发送曲名、艺术家、专辑、时长；不发送音频文件或本地路径。
- 只在内存缓存：命中 24h、未命中 10min、最多 300 首；请求串行化并至少间隔 250ms。

## 目标 PC 验收仍未完成

1. P4 Mono UAC Direct v62 真实扬声器是否有声且连续。
2. 开启期间共享输出切换无明显中断/重复；关闭后回到所选输出设备。
3. 设备拔插、默认设备变化、系统其它程序音频隔离、长时间播放 underrun。
4. 在线同步歌词、纯文本歌词、未命中、断网的实际 UI 表现。
5. 六种 USB 模式、music-only 桌面壁纸可见性、托盘隐藏、sleep/wake、DPI、多屏、Turing COM3。

Hosted CI 通过不代表这些物理硬件场景已验收。
