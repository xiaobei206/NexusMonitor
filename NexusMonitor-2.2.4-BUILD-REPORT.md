# NexusMonitor 2.2.4 — 构建与验收报告

**状态：正式发布完成**  
**应用代码提交：** `c7894ee83f8dfee529ecab330561b10d25db5664`  
**Windows CI：** [Run #192](https://github.com/xiaobei206/NexusMonitor/actions/runs/42361308963) — success  
**Release：** [v2.2.4](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.4)

## 交付物

- 安装包：[NexusMonitor-2.2.4-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.4/NexusMonitor-2.2.4-Setup.exe)
- 大小：160,014,176 bytes
- SHA-256：`1a82ea9cd511455c2d3c87fb0cbcf2b22eccaf7e19892f3906cb11bef0c835a7`
- SHA sidecar：[NexusMonitor-2.2.4-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.4/NexusMonitor-2.2.4-Setup.exe.sha256)
- 未配置代码签名证书，安装包未签名。

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

- AudioContext 从创建时即使用当前 `musicOutputDeviceId`；在 `createMediaElementSource(audio)` 接管单一音频源前设置并验证目标 sink。
- 非默认设备不能绑定时关闭尚未连接音源的 Context 并明确失败，避免音乐无声回退到 Windows 默认声卡。
- 回归测试要求 sink 绑定发生在 Web Audio media source 连接之前。
- WASAPI 独占期间共享普通音频路径仍可在 native PCM 确认前保持可听；关闭/失败路径恢复普通输出逻辑。

## 目标机验收边界

用户仍需实际验证 P4 Mono UAC Direct v62 在开启、关闭 WASAPI 后的真实声音输出是否保持正确设备，并测试暂停/继续、切歌、设备拔插与 Windows 默认设备变化。Hosted CI 不证明物理出声，也不证明整个 Renderer Float32 → WASAPI 路径 bit-perfect。
