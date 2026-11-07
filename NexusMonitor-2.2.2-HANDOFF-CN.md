# NexusMonitor 2.2.2 — 正式交付交接

<badge>正式发布</badge>

**当前工作基线：** `main`  
**正式版本：** 2.2.2  
**应用代码提交：** `99e76745ae978ae3e0dd8dc9eaefa6785dadb022`  
**Windows CI：** [Run #179](https://github.com/xiaobei206/NexusMonitor/actions/runs/42357228488) — success  
**GitHub Release：** [v2.2.2](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.2)

## 正式交付物

- 安装包：`NexusMonitor-2.2.2-Setup.exe`
- 文件大小：160,011,997 bytes
- SHA-256：`4622fae70bc5a0b9770ab90c40c8de964b6f5f0f0f442b33fc829e54d4b2bc03`
- SHA sidecar：`NexusMonitor-2.2.2-Setup.exe.sha256`
- 下载：[Windows x64 NSIS installer](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.2/NexusMonitor-2.2.2-Setup.exe)
- 校验文件：[SHA-256 sidecar](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.2/NexusMonitor-2.2.2-Setup.exe.sha256)
- 安装包未代码签名（项目未配置签名证书）。

## Run #179 最终验证

| 项目 | 结果 |
|---|---|
| VERSION / package / .NET 等版本门禁 | 14/14 通过 |
| Node 主进程与源码回归测试 | 234/234 通过，0 failed |
| Renderer TypeScript | 通过 |
| Vite production build | 通过 |
| Windows N-API WASAPI addon | 编译成功 |
| PawnIO 官方 MCHBAR 资源 | 下载及 SHA-256 验证成功 |
| HardwareService .NET Release | 成功 |
| Hardware / Storage Tests | 成功 |
| Windows NSIS x64 installer | 成功 |
| Installer SHA-256 | 成功 |
| GitHub Release 与 workflow artifact | 成功 |

## 本轮 WASAPI 修正

2.2.1 的探测仅覆盖 stereo `WAVEFORMATEXTENSIBLE`，不能据此判断 P4 Mono endpoint 完全不支持 WASAPI Exclusive。2.2.2 调整如下：

1. 同时枚举 mono 与 stereo PCM。
2. 每个候选同时使用传统 `WAVEFORMATEX` 与 `WAVEFORMATEXTENSIBLE` 查询。
3. 读取 Windows shared mix format，将设备 mix sample rate 加入候选。
4. 实际 `IAudioClient::Initialize` 也有 classic WAVEFORMATEX fallback。
5. 兼容 stereo 时始终优先 stereo；没有可用 stereo tuple 才选择 mono。
6. Renderer 输入仍是 stereo Float32；mono-only endpoint 在 native 输出边界做 `(L+R)/2` 下混。
7. 声道数贯穿 native format / speaker mask / block alignment / bytes-per-frame / ring buffer / UI status。
8. 如果所有候选都失败，错误信息附带候选次数、classic/extensible 命中数、shared mix channels/rate 和最后 HRESULT。

**限制：** Probe 通过不代表 Initialize 一定成功；实际打开失败仍需以 HRESULT 为准。当前 Renderer → Float32 → WASAPI 路径不是 bit-perfect；mono downmix 更明确属于 channel conversion。

## UI 修正

五寸副屏 `music-only`（Windows 桌面壁纸 + 后台音乐）动作按钮改为 **「应用模式」**，不再显示长句「应用桌面壁纸音乐模式」。其它可见副屏输出模式仍显示「启动副屏」。模式说明文字保留，按钮只承担动作。

## 仍需目标 PC 实测

1. P4 Mono UAC Direct v62 在 2.2.2 下能否打开 WASAPI Exclusive，并且扬声器真实出声。
2. stereo 歌曲下混后 L/R 内容完整，无单边丢声、削波或明显音量异常。
3. Windows 其它程序继续走用户指定的 endpoint；独占期间其它程序声音表现符合预期。
4. 切换 endpoint、设备拔插、默认输出变化、关闭独占与 sleep/wake 行为。
5. 长时间播放的 underruns / dropped frames 计数与恢复。
6. 真实 MP3/WAV/FLAC/OGG/Opus/AAC/M4A 文件播放、时长、seek、下一首和损坏文件错误处理。
7. 六种 USB 模式、music-only 不遮挡 Windows 壁纸、主窗托盘隐藏期间持续播放。
8. Turing COM3、天气、硬件监控、主题、多屏/DPI 与长期运行无回归。

Hosted CI 通过只证明 runner 构建和自动化；不代替以上目标 Windows PC 实测。

## 后续工程规则

用户已明确偏好个人项目直接在 `main` 开发。后续默认 main-only，不开 feature branch，不建 PR。下一轮行为修改从 2.2.3 开始，必须同步 14 项版本门禁。持续维护唯一开发日志和本交接文档。
