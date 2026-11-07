# NexusMonitor 2.2.2 — 构建与验收报告

**状态：源码提交 main；Windows CI 待验证。**  
**目标版本：** 2.2.2  
**目标设备反馈：** P4 Mono UAC Direct v62 的 WASAPI Exclusive 没有被 2.2.1 的立体声格式探测接受。

## 本轮源码变更

- Probe 双通道枚举：Stereo + Mono。
- Probe 双结构：WAVEFORMATEX + WAVEFORMATEXTENSIBLE。
- 读取 Windows shared mix format，纳入采样率候选。
- 实际 Initialize 增加 WAVEFORMATEX 回退。
- 立体声优先；mono-only endpoint 使用 native stereo-to-mono 下混。
- PCM 输出声道数驱动 channel mask、block alignment、bytes-per-frame、ring-buffer frame size。
- WASAPI 诊断信息包含探测次数、支持数、两种结构命中数、shared mix format 与最后的 HRESULT。
- USB music-only 动作按钮显示「应用模式」。

## 当前自动化验证

尚未以这次 2.2.2 提交运行的 Hosted Windows CI 作为通过依据。应以该提交触发的 main Windows CI 最新结论补齐本报告。2.2.1 的 225/225 测试与其安装包不代表 2.2.2 验证结果。

## 目标 Windows PC 验收

请在 2.2.2 installer 上至少验证：

1. P4 Mono UAC Direct v62 是否在 WASAPI Exclusive 模式成功打开。
2. 播放立体声音乐时，mono endpoint 是否能左右声道正确混合、没有单边声道丢失。
3. 设备是否真实出声，音量与 EQ 变化正常。
4. 普通 WASAPI / Windows 默认输出切换后能否正常恢复。
5. 独占模式期间其他应用音频表现，关闭独占后是否恢复。
6. USB 拔插、默认设备变化与睡眠唤醒。
7. 长时间运行的 underrun / dropped-frame 计数。
8. 其它 USB 副屏模式、music-only 桌面壁纸及 Turing COM3 无回归。

**能力边界：** mono downmix 不是 bit-perfect；Hosted CI 不代替目标设备音频验收；Gapless / Crossfade 双 Deck 未在本版本实现。
