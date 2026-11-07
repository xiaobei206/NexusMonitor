# NexusMonitor 2.2.2 — 当前开发交接

**状态：开发代码已提交 main，Windows CI 待验证。**  
**目标版本：** 2.2.2  
**工作方式：** 直接在 main 开发，不创建功能分支 / PR。  
**上一正式版本：** 2.2.1（2026-11-07）。

## 本轮改动

1. WASAPI Probe 现在遍历 Stereo / Mono 两种通道数。
2. 每个 PCM 元组分别尝试 `WAVEFORMATEXTENSIBLE` 和传统 `WAVEFORMATEX`。
3. 读取 Windows shared mix format 的 channels / sample rate 并加入候选采样率。
4. 实际独占 `IAudioClient::Initialize` 增加 classic WAVEFORMATEX retry。
5. Stereo 格式优先；仅在无可用 stereo 候选时使用 mono。
6. Renderer PCM transport 仍为 stereo Float32；native mono endpoint 接收 `(L+R)/2` 下混。
7. native 声道数同步到格式布局、speaker mask、block alignment、ring buffer、统计信息与 Renderer 状态。
8. Probe 失败错误附加候选数、Classic/Extensible 命中数、shared mix format 与 HRESULT。
9. `music-only` 模式动作按钮由长句改为 **「应用模式」**。

## 重要实现边界

- 该方案能覆盖驱动仅接受传统 WAVEFORMATEX、设备只报告单声道 PCM 的情况，但不保证每一种 USB 音频驱动都支持独占模式。
- Probe 的候选通过不代表最终 Initialize 必然成功；Initialize 失败时必须保留真实 HRESULT。
- Mono downmix 是声道转换，bit-perfect 必须为 false。
- 当前 Renderer WebAudio → Float32 PCM → native WASAPI 路径本身仍不是 bit-perfect。
- Hosted CI 不能确认用户 P4 实际出声、Windows 其它程序音频分流、端点拔插、长期 underrun。
- Gapless / Crossfade 双 Deck 未包含在 2.2.2。

## 测试新增

- `tests/music-exclusive-format.test.cjs`：Stereo 优先、mono-only fallback、下混标志、原生 mono、不支持通道布局、unknown channels / resample。
- `tests/music-wasapi-mono-source.test.cjs`：Classic / Extensible 双探测、Initialize fallback、声道帧长、mono 下混与诊断字段。
- `tests/usb-display-page.test.cjs`：music-only 按钮必须为「应用模式」，不得出现长文案。

## 验证与发布

- 版本校验：待 Windows CI。
- Node 主进程测试：待 Windows CI。
- Renderer / Vite：待 Windows CI。
- Windows native N-API WASAPI：待 Windows CI。
- PawnIO / .NET / Storage：待 Windows CI。
- 2.2.2 installer / SHA-256 / GitHub Release：由 main workflow 在成功后生成。
- 目标 Windows PC：需用户实测 P4 Mono UAC Direct v62；如果仍失败，新的错误应带出候选统计和 HRESULT，用来继续定位驱动限制。

