# NexusMonitor 2.2.4 — P4 输出设备路由修复交接

**版本：** 2.2.4  
**开发基线：** `main`  
**状态：** 源码已提交；Windows CI 与正式发布状态待确认。P4 实机验收未完成。

## 用户实测故障

先把音乐输出设备选为 `P4 Mono UAC Direct v62`，普通播放正常。开启 WASAPI 独占后音乐立即转到 Windows 默认声卡；关闭独占、暂停后重新播放仍不能恢复到 P4，只有退出并重启 NexusMonitor 才恢复。

## 代码原因

`ensureAudioGraph()` 原来先创建默认 `AudioContext` 并连接唯一的 `HTMLAudioElement`，然后再由独立 effect 调用 `applyOutputSink()`。开启独占期间 `exclusiveActiveRef` 可能已置为 true，导致 `applyOutputSink()` 提前返回。此时 Web Audio destination 仍走默认声卡。音源一旦经 `createMediaElementSource(audio)` 接管，后续仅修改 `audio.setSinkId()` 不能保证改变整个 Web Audio graph 的 destination。

## 本轮改动

- 从 `outputDeviceIdRef.current` 读取最新用户选择的输出设备。
- 新建 AudioContext 时带上目标 `sinkId`，并在创建 `MediaElementAudioSourceNode` 之前显式调用 `context.setSinkId(requestedDeviceId)`。
- 检查实际 `context.sinkId`。若非默认目标无法绑定或路由不匹配，关闭尚未连接媒体源的 AudioContext 并让独占初始化失败，而不是将普通音乐静默送到 Windows 默认声卡。
- 保留共享普通输出在 WASAPI 输出确认前可听、原生 PCM 监视和失败恢复逻辑。
- 新增回归断言，保证 sink 绑定必须先于 `createMediaElementSource(audio)`。
- 版本递增到 2.2.4，并同步 package、lock、VERSION、App/Renderer 与 .NET service version fields 和 versioned release entrypoint。

## 关键源码

- `src/renderer/music-player.tsx` — 输出设备选择、AudioContext 初始化顺序、WASAPI 生命周期。
- `tests/music-player-source.test.cjs` — 独占恢复以及输出 sink 顺序回归。
- `NexusMonitor-2.2.4-BUILD-RELEASE.cjs` — 版本校验和 Windows 构建入口。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md` — 唯一开发主记录。

## 验收清单

1. 重启应用后先选择 P4，普通播放正常。
2. 开启 WASAPI 独占，声音仍应从 P4 输出，不应切到系统默认声卡。
3. 关闭 WASAPI 独占，声音仍保持 P4，不需要暂停/恢复或重启应用。
4. 暂停、继续播放与切歌均保持 P4。
5. 模拟 AudioContext 不支持或拒绝目标 sink 时，独占初始化明确报错、普通播放留在 P4，不应把音源接到默认输出。
6. 再测默认输出设备、其他非默认设备、设备热插拔以及 Lyrics UI 不影响音频。

CI 只能证明 Web Audio 顺序测试和 Windows 构建通过，不能替代 P4 实体设备的声音验证。
