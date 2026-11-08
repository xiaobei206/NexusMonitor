# NexusMonitor 2.2.9 — Windows 构建与发布报告

**版本：** 2.2.9  
**基线：** 2.2.8  
**状态：** 已正式发布；Windows CI Run #213 全部成功。  
**Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.9  
**CI：** https://github.com/xiaobei206/NexusMonitor/actions/runs/42501046745

## 变更概要

- 将两个独立的随机/循环按钮合并为一个垂直四态菜单：随机播放、顺序播放、单曲循环、列表循环。
- 随机播放采用整轮无重复的 shuffle bag；轮次完成后重新洗牌继续。上一首按随机播放历史回退，下一首继续当前洗牌袋。
- 播放模式由主进程 MusicState 统一管理并持久化，所有界面通过现有共享 Music Service 同步。
- 迁移旧 shuffle / repeat 配置；保留单个 Renderer 音频宿主与 USB 视频模式边界。

## 验证结果

| 检查 | 状态 |
|---|---|
| 检查 | 结果 |
|---|---|
| 版本元数据一致性 | <badge color="success">通过</badge> |
| Main / Node 回归测试 | <badge color="success">通过</badge> |
| Renderer TypeScript / Vite | <badge color="success">通过</badge> |
| Native WASAPI / PawnIO / .NET HardwareService | <badge color="success">通过</badge> |
| 硬件 / 存储测试 | <badge color="success">通过</badge> |
| NSIS 安装包、SHA-256、GitHub Release | <badge color="success">通过</badge> |
| 用户目标机音频实际验收 | 待用户安装后测试 |

## 交付物

- 安装包：**NexusMonitor-2.2.9-Setup.exe**
- 大小：**160,025,547 bytes（152.61 MiB）**
- SHA-256：`05091f0ea3d15981798586043290e0a27c9aa77b2ca15dd8e17657549d66efb2`
- [下载 Windows 安装包](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.9/NexusMonitor-2.2.9-Setup.exe)
- [SHA-256 校验文件](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.9/NexusMonitor-2.2.9-Setup.exe.sha256)

Hosted CI 不会实际播放用户本机的曲库，因此真实音频行为仍需用户目标 Windows PC 验收。
