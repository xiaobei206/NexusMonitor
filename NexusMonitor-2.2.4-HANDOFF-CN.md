# NexusMonitor 2.2.4 — P4 输出设备路由修复交接

**状态：正式发布完成。**  
**开发基线：** `main`  
**应用代码提交：** `c7894ee83f8dfee529ecab330561b10d25db5664`  
**Windows CI：** [Run #192](https://github.com/xiaobei206/NexusMonitor/actions/runs/42361308963) — success  
**正式 Release：** [v2.2.4](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.4)

## 正式交付物

- 安装包：[NexusMonitor-2.2.4-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.4/NexusMonitor-2.2.4-Setup.exe)
- 大小：160,014,176 bytes
- SHA-256：`1a82ea9cd511455c2d3c87fb0cbcf2b22eccaf7e19892f3906cb11bef0c835a7`
- 校验文件：[NexusMonitor-2.2.4-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.4/NexusMonitor-2.2.4-Setup.exe.sha256)
- 未配置代码签名证书，因此安装包未签名。

## 用户实测故障

先把音乐输出设备选为 `P4 Mono UAC Direct v62`，普通播放正常。开启 WASAPI 独占后音乐立即转到 Windows 默认声卡；关闭独占、暂停后重新播放仍不能恢复到 P4，只有退出并重启 NexusMonitor 才恢复。

## 代码原因

`ensureAudioGraph()` 原来先创建默认 `AudioContext` 并连接唯一的 `HTMLAudioElement`，然后再由独立 effect 调用 `applyOutputSink()`。开启独占期间 `exclusiveActiveRef` 可能已置为 true，导致 `applyOutputSink()` 提前返回。此时 Web Audio destination 仍走默认声卡。音源一旦经 `createMediaElementSource(audio)` 接管，仅修改原 audio element 的 sink 不能保证改变整个 graph 的 destination。

## 2.2.4 修复

- 从 `outputDeviceIdRef.current` 读取最新用户选择的输出设备。
- 新建 AudioContext 时带入目标 `sinkId`，并在创建 `MediaElementAudioSourceNode` 之前显式调用 `context.setSinkId(requestedDeviceId)`。
- 检查实际 `context.sinkId`。非默认目标无法绑定或路由不匹配时，关闭尚未连接媒体源的 AudioContext 并让独占初始化失败，而不是将普通音乐静默送到 Windows 默认声卡。
- 新增源码回归断言，确保 sink 绑定发生在 `createMediaElementSource(audio)` 之前。
- 2.2.4 仍不宣称 bit-perfect；Renderer Float32 PCM 路径不具备 bit-perfect 条件。

## Run #192 验证结果

- 版本一致性：14/14。
- Node 主进程与回归测试：238/238 通过，0 failed。
- Renderer TypeScript / Vite production build：通过。
- Windows N-API WASAPI native addon：编译成功。
- PawnIO 官方资源下载与 SHA-256 验证：通过。
- HardwareService .NET Release 与 Hardware / Storage Tests：通过。
- NSIS x64 安装包、SHA-256 sidecar、GitHub Release 与 workflow artifact 上传：成功。

## 目标 PC 验收仍待用户确认

1. P4 普通播放 → 开启 WASAPI → 声音仍从 P4 输出。
2. 关闭 WASAPI、暂停/继续、切歌以后仍保持 P4，不回到 Windows 默认设备。
3. 模拟目标 sink 不支持/拒绝绑定，独占初始化明确失败，普通播放仍在 P4。
4. 测试设备拔插、默认设备变化和长时间播放。

Hosted CI 证明构建与自动化通过，不等于已经证明 P4 实体扬声器实际出声。
