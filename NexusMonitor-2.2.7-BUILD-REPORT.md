# NexusMonitor 2.2.7 — 音乐循环播放竞态修复构建报告

**版本：** 2.2.7  
**基线：** 2.2.6 正式 Release  
**状态：** 已正式发布  
**Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.7  
**源码发布提交：** `2f882c6348869b3406ab6b93aee7d112ebf7631f`  
**Windows CI：** [Run #204 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/42494116368)

## 用户问题与根因

用户在单曲循环 / 列表循环过程中看到：

`播放启动失败：The play() request was interrupted by a call to pause()`

根因定位为播放状态竞态：曲目发出 ended 后，主进程要求从 0 秒重新播放；Renderer 在播放请求尚未完成时读取到媒体元素临时的 paused 状态，将旧暂停状态发回主进程，主进程据此更新为暂停，再触发 pause() 中止新发起的 play()。这条信息本身不能说明音频文件已损坏。

## 修复内容

- `src/renderer/music-player.tsx` 将媒体元素播放调用统一收敛到 `playAudioSafely()`。
- 通过递增的 playback attempt ID 使已过期的播放启动请求失效，避免旧的 play() promise 覆盖新的暂停 / 切曲决定。
- ended 或播放请求 pending 时不再把元素短暂的 paused 状态作为正式 `playing: false` 同步给主进程。
- 正常状态切换引起的 `AbortError` 不再作为新播放失败提示；其它播放错误仍会上报。
- 新增回归合同测试，覆盖循环播放状态竞态、统一播放调用、过期请求保护和事件监听器包装。
- 保持音乐单一 Renderer 音频引擎；未修改 native WASAPI backend。

## 自动化验证

Run #204 全部成功：
- 版本一致性门禁：14 项通过（2.2.7）。
- Main TypeScript 构建与 Node 回归测试：通过，包括新增循环播放回归。
- Renderer TypeScript 与 Vite 生产构建：通过。
- native WASAPI 模块构建：通过（本版未更改其实现）。
- PawnIO MCHBAR 官方资源 SHA-256 验证：通过。
- .NET 10 HardwareService 构建：通过。
- 硬件 / 存储测试：通过。
- Windows NSIS 安装器构建：通过。
- 安装器 SHA-256 与 GitHub Release / workflow artifact 上传：成功。

CI 迭代如实记录：Run #203 的 Main 和新增回归测试通过，但 Renderer 因媒体事件回调签名不兼容报 TS2769；改为无参数 listener 包装后 Run #204 全部成功。

## 正式交付

- Release：[v2.2.7](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.7)
- 安装器：[NexusMonitor-2.2.7-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe)
- SHA-256 文件：[NexusMonitor-2.2.7-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe.sha256)
- 安装器大小：160,023,400 bytes
- 安装器 SHA-256：`b370eda5aa93bc7fd9ab8b5f78f8612aa23ea01d734e402ae704497007b89e89`

## 目标机验收边界

Hosted CI 验证了源码回归、类型构建、依赖模块、.NET、存储测试和 Windows 安装包，但不能替代目标 PC 播放真实音乐的验收。安装后建议分别检查单曲循环、多曲列表循环、只有一首歌时的列表循环，以及循环切换时错误提示是否消失。P4 WASAPI Exclusive 的既有无声问题独立存在；本版未更改该后端，也不宣称该问题已修复。
