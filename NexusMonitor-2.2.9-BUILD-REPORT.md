# NexusMonitor 2.2.9 — Windows 构建与发布报告

**版本：** 2.2.9  
**基线：** 2.2.8  
**状态：** 源码提交后等待 Windows CI / Release 验证；成功后补充 Actions、安装包大小与 SHA-256。

## 变更概要

- 将两个独立的随机/循环按钮合并为一个垂直四态菜单：随机播放、顺序播放、单曲循环、列表循环。
- 随机播放采用整轮无重复的 shuffle bag；轮次完成后重新洗牌继续。上一首按随机播放历史回退，下一首继续当前洗牌袋。
- 播放模式由主进程 MusicState 统一管理并持久化，所有界面通过现有共享 Music Service 同步。
- 迁移旧 shuffle / repeat 配置；保留单个 Renderer 音频宿主与 USB 视频模式边界。

## 验证结果

| 检查 | 状态 |
|---|---|
| 版本元数据一致性 | 等待 Windows CI |
| Main / Node 回归测试 | 等待 Windows CI |
| Renderer TypeScript / Vite | 等待 Windows CI |
| Native WASAPI / PawnIO / .NET HardwareService | 等待 Windows CI |
| 硬件 / 存储测试 | 等待 Windows CI |
| NSIS 安装包、SHA-256、GitHub Release | 等待 Windows CI |
| 用户目标机音频实际验收 | 待用户安装后测试 |
