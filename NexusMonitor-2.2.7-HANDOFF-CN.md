# NexusMonitor 2.2.7 — 音乐循环播放竞态修复交接

**当前正式版本：** 2.2.7  
**主线：** `main`  
**源码发布提交：** `2f882c6348869b3406ab6b93aee7d112ebf7631f`  
**正式 Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.7  
**Windows CI：** [Run #204 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/42494116368)  
**下一正式行为版本：** 2.2.8

## 本次处理

用户反馈循环播放时出现 `The play() request was interrupted by a call to pause()`。

根因是 ended → restart 的状态竞争：主进程还保留播放意图，但 Renderer 在 play() promise 兑现前从媒体元素读到临时 paused 状态，再回传为正式暂停。React 根据同步后的状态调用 pause()，取消了尚在启动中的播放请求。

### 修改点

- `src/renderer/music-player.tsx`：集中处理所有 `audio.play()` 调用；使用 attempt ID 识别并丢弃过期启动请求；playing pending 与 ended 窗口不发送过期 `playing:false`；取消请求导致的 `AbortError` 不作为播放故障显示。
- 手动暂停、切曲、卸载清理都使旧播放尝试失效。
- `tests/music-player-source.test.cjs` 增加回归合同，保护 repeat-one / repeat-all 状态同步、统一播放入口和事件回调签名。
- 不改主进程循环队列语义，不改 native WASAPI backend，不引入第二个音频引擎。

## CI 与 Release

Run #203 的 Main / Node 测试通过，但 Renderer 首次遇到 TS2769（带参数的 report 函数不能直接作为 EventListener）。使用无参数 wrapper 后，Run #204 全部成功：
- 14 个版本一致性检查；
- Main / Node 回归；
- Renderer TypeScript / Vite；
- native WASAPI build；
- PawnIO 资源校验；
- .NET HardwareService；
- 硬件 / 存储测试；
- NSIS 安装器、SHA-256、Release 和 artifact。

Release：v2.2.7  
安装包：[NexusMonitor-2.2.7-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe)  
SHA 文件：[NexusMonitor-2.2.7-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.7/NexusMonitor-2.2.7-Setup.exe.sha256)  
安装包 SHA-256：`b370eda5aa93bc7fd9ab8b5f78f8612aa23ea01d734e402ae704497007b89e89`

## 仍需目标机确认

CI 的回归测试不是实体音频验收。安装后应验证：
1. 单曲循环；
2. 多首歌曲列表循环；
3. 只有一首歌曲时选择列表循环；
4. 循环切换后手动暂停、下一首 / 上一首后状态正确，错误条不再误报。

已知边界：P4 Mono UAC Direct v62 的 WASAPI Exclusive 输出历史问题保持不变，本版没有碰 native backend，不得声称它已修复。

## 之前版本基线

2.2.6 的天气 Provider、AQI 分类和 HUD 高度记忆功能仍保持；详情见 `NexusMonitor-DEVELOPMENT-LOG-CN.md` 中的 2.2.6 条目与该版本历史交接。
