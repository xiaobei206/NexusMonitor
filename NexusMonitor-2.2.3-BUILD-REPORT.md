# NexusMonitor 2.2.3 — 构建与验收报告

**状态：正式发布完成**  
**应用代码提交：** `317a093f562ce1950e91d53e72c56a8ee0cad079`  
**Windows CI：** [Run #186](https://github.com/xiaobei206/NexusMonitor/actions/runs/42360024896) — success  
**Release：** [v2.2.3](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.3)

## 交付物

- 安装包：[NexusMonitor-2.2.3-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.3/NexusMonitor-2.2.3-Setup.exe)
- 大小：160,013,866 bytes
- SHA-256：`bf405f570f01a72b8ad6382417a5eaed1326c795e022645f742ef16078f2c9cd`
- SHA sidecar：[NexusMonitor-2.2.3-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.3/NexusMonitor-2.2.3-Setup.exe.sha256)
- 未配置代码签名证书，因此安装包未签名。

## 自动化结果

| 项目 | 结果 |
|---|---|
| 版本一致性 | 14/14 |
| Node 主进程回归测试 | 238/238，0 failed |
| Renderer TypeScript / Vite | 通过 |
| Windows N-API WASAPI | 编译成功 |
| PawnIO 官方资源 SHA | 通过 |
| .NET HardwareService Release | 通过 |
| Hardware / Storage Tests | 通过 |
| NSIS x64 | 通过 |
| Installer SHA-256 | 生成成功 |
| GitHub Release / workflow artifact | 上传成功 |

## 修复范围

### WASAPI

- 独占 PCM tap 采集与共享输出静音分离。
- 打开时共享音频继续可听；只有 native 已接受 PCM 且已渲染帧才静音共享路径。
- 播放中 2.5 秒没有有效 PCM 帧则自动恢复普通输出。
- 关闭、open 失败、native runtime error 均恢复 AudioContext、output sink 和之前的播放状态。
- 状态文字不再将 endpoint open 等同于物理扬声器已出声。

### 歌词

- 同名本地 LRC 优先；否则自动调用 LRCLIB。
- 同步歌词按播放进度展示；纯文本歌词以可滚动文本展示。
- 未命中、超时、离线、429 安全降级；只上传元数据，不上传音频或本地路径。
- 内存缓存与串行请求，避免反复请求和过快请求。

## 目标机验收边界

用户仍需实测 P4 Mono UAC Direct v62 的真实扬声器输出、独占开启/关闭后的即时恢复、设备拔插与 Windows 其它应用音频行为，以及在线歌词实际命中率。Hosted CI 不能验证物理出声，也不能证明整个 Renderer Float32 → WASAPI 路径 bit-perfect。
