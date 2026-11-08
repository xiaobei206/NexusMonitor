# NexusMonitor 2.2.9 — 四态统一播放模式交接

**版本：** 2.2.9  
**基线：** NexusMonitor 2.2.8 正式 Release  
**状态：** 已正式发布；Windows CI Run #213 全部成功。  
**唯一工作基线：** GitHub main

## 四种播放模式

- **随机播放：** 洗牌袋；当前轮每首歌曲最多播放一次，播放过的歌曲不会在当前轮重复；队列耗尽后自动重新洗牌继续。
- **顺序播放：** 按当前歌单顺序播放，到最后一首停止。
- **单曲循环：** 当前歌曲结束后从头播放。
- **列表循环：** 按当前歌单顺序播放，最后一首结束后返回第一首。

## 实现范围

- MusicState.playbackMode 替换 shuffle + repeat 两个独立状态；命令统一为 set-playback-mode。
- 新增可单元测试的播放模式迁移、洗牌袋与上一首历史逻辑。
- 旧 music-library.json 自动迁移：旧 shuffle 优先映射随机；否则 repeat one/all 映射单曲/列表循环；默认映射顺序播放。迁移后保存 playbackMode、shuffleQueue、shuffleHistory。
- 共用垂直菜单嵌入主窗口底部 Dock 与 MusicMiniPlayer；后者同时用于竖向悬浮 HUD 和非视频 USB 副屏。视频模式和唯一音频引擎不变。
- 不改音乐解码、音频宿主、EQ、ReplayGain、输出设备或 WASAPI native backend。

## CI、发布与验收结果

- **最终验证提交：** [0ef3e902065c8a050ad1efea02c8287c5a163bdd](https://github.com/xiaobei206/NexusMonitor/commit/0ef3e902065c8a050ad1efea02c8287c5a163bdd)
- **Windows CI：** [Run #213 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/42501046745)。版本一致性、Main / Node 回归、Renderer TypeScript / Vite、native WASAPI、PawnIO MCHBAR、.NET HardwareService、硬件/存储测试、NSIS 安装包、SHA-256、GitHub Release 与 artifact 上传全部成功。
- **正式 Release：** [v2.2.9](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.9)
- **安装包：** [NexusMonitor-2.2.9-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.9/NexusMonitor-2.2.9-Setup.exe)，160,025,547 bytes（152.61 MiB）。
- **SHA-256：** `05091f0ea3d15981798586043290e0a27c9aa77b2ca15dd8e17657549d66efb2`。校验文件随 Release 一并发布。

CI 通过不等于目标 Windows PC 实机音频已验收。用户安装后仍需确认四种模式的切换同步、随机整轮不重复、上一首/下一首、单曲和列表循环，以及现有 EQ / ReplayGain / WASAPI 输出路径没有回归。
