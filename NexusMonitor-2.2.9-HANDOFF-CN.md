# NexusMonitor 2.2.9 — 四态统一播放模式交接

**版本：** 2.2.9  
**基线：** NexusMonitor 2.2.8 正式 Release  
**状态：** 源码提交后等待 Windows CI / Release 验证。  
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

## 验证

Main / Node 测试、Renderer TypeScript / Vite、版本一致性、native WASAPI、PawnIO、.NET HardwareService、硬件/存储测试及安装包结果，待 Windows CI 确认。CI 不替代用户目标 PC 的实际音频体验验收。
