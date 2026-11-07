# NexusMonitor 2.2.2 — 构建与验收报告

**报告状态：正式发布完成。**  
**应用代码提交：** `99e76745ae978ae3e0dd8dc9eaefa6785dadb022`  
**正式版本：** 2.2.2  
**报告日期：** 2026-11-07

## 正式 Release

- [NexusMonitor 2.2.2 GitHub Release](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.2)
- 安装包：`NexusMonitor-2.2.2-Setup.exe`
- 文件大小：160,011,997 bytes
- SHA-256：`4622fae70bc5a0b9770ab90c40c8de964b6f5f0f0f442b33fc829e54d4b2bc03`
- SHA sidecar：`NexusMonitor-2.2.2-Setup.exe.sha256`
- 无代码签名证书，安装包未签名。

## 最终 Windows CI：Run #179

[查看 GitHub Actions Run #179](https://github.com/xiaobei206/NexusMonitor/actions/runs/42357228488)

- 结果：workflow completed / success；Windows job completed / success。
- 版本一致性门禁：14/14。
- Node 主进程与回归测试：234/234，fail 0，cancelled 0，skipped 0。
- Renderer TypeScript 与 Vite production build：成功。
- Windows N-API WASAPI native addon：编译成功。
- PawnIO 官方 MCHBAR 资源：下载与 SHA-256 校验通过。
- HardwareService .NET Release：成功。
- Hardware / Storage Tests：成功。
- NSIS x64 installer：成功生成。
- SHA-256 sidecar：成功生成。
- GitHub Release 与 workflow artifact：成功上传。

## 本轮代码实现

### WASAPI Exclusive 兼容性

- 探测 mono / stereo PCM。
- 每个格式元组分别探测 classic `WAVEFORMATEX` 与 `WAVEFORMATEXTENSIBLE`。
- 读取 Windows shared mix format 并补充其 sample rate 候选。
- 实际独占初始化在 WAVEFORMATEXTENSIBLE 不可接受时使用 classic WAVEFORMATEX 回退。
- Stereo 优先；只有 stereo 没有兼容候选时才落到 mono。
- Renderer 仍输出 stereo Float32；native mono endpoint 通过 `(L+R)/2` 下混。
- native output frame size、channel mask、block alignment、ring buffer 与 UI 状态统一使用协商声道数。
- Probe 不通过时错误信息包括候选数、两种结构命中数、Windows shared mix rate/channels 和 HRESULT。

### music-only 按钮

`music-only` 桌面壁纸 + 后台音乐模式按钮缩短为「应用模式」。其它副屏启动按钮不变。

## 明确能力边界

- Mono downmix 会改变声道，不能标记 bit-perfect。
- 即使 stereo 模式，当前路径仍经过 Chromium/WebAudio 和 Float32 PCM，整个 WASAPI 路径不宣称 bit-perfect。
- Gapless / Crossfade 双 Deck 未实现。
- 该 Probe 覆盖常见 PCM 格式与声道布局，但不是所有 USB 音频驱动的保证；Initialize 最终返回的 HRESULT 才是实际打开结果。
- 实际 codec profile 播放与 seek 矩阵未因导入白名单而自动视作通过。

## 用户目标机验收（Hosted CI 不代替）

1. P4 Mono UAC Direct v62 的 WASAPI 独占输出能否打开、扬声器是否真实出声。
2. 立体声音乐 mono downmix 完整，左右声道均被混合。
3. Windows 其它程序与 NexusMonitor 的 endpoint 分流行为。
4. WASAPI 独占打开/关闭、设备拔插、默认 endpoint 更换与异常恢复。
5. 长时间播放的 underrun / dropped-frame 计数。
6. 真实音频文件各格式解码、时长、seek、下一首和坏文件处理。
7. 六种 USB 模式，尤其 music-only Windows 桌面壁纸可见性与音频持续性。
8. 托盘隐藏、sleep/wake、混合 DPI、多屏负坐标、COM3 Turing 长期稳定性。

**结论：** 2.2.2 源码、自动化测试、Windows native 编译、.NET / Storage、安装包、SHA-256 和 GitHub Release 均经 Hosted Windows CI 验证并正式发布；P4 真实扬声器与 endpoint 行为仍需用户目标 Windows PC 最终验收。
