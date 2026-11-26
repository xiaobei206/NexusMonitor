# NexusMonitor 2.2.14 — 构建与发布报告

**版本：** 2.2.14  
**基线：** 2.2.13  
**状态：** 已正式发布，Windows CI 全流程成功  
**Workflow Run：** [Run #45743775825](https://github.com/xiaobei206/NexusMonitor/actions/runs/45743775825)  
**GitHub Release：** [NexusMonitor 2.2.14](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.14)

## 变更摘要

- 主程序与悬浮窗详情的共享历史曲线添加低对比度水平、垂直网格线。
- 悬浮窗大卡片中的智能功耗摘要增加最近 60 次有效采样的总功耗曲线。
- 曲线使用现有功耗摘要逻辑；来源模式切换时重置历史，避免把不同来源的瓦特值误连为同一趋势。

## 验证结果

- 版本一致性门禁：14/14 通过。
- Main / Node 回归测试：278/278 通过，0 失败。
- Renderer TypeScript 与 Vite 生产构建：成功。
- 原生 WASAPI 模块：成功。
- PawnIO MCHBAR 资源校验与准备：成功。
- .NET HardwareService 构建：成功。
- Hardware/Storage 测试：成功。
- Windows NSIS 安装包打包：成功。
- SHA-256 生成：成功。
- GitHub Release 发布、Release 描述同步、workflow artifact 上传：成功。

## 安装包与校验值

- 文件：`NexusMonitor-2.2.14-Setup.exe`
- 大小：**160,070,599 bytes**
- SHA-256：`047927336373a2ce5f9b40160fa2007e5266723ac2f7b2d19bd26a5528fdd308`
- [下载安装包](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.14/NexusMonitor-2.2.14-Setup.exe)
- [SHA-256 sidecar](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.14/NexusMonitor-2.2.14-Setup.exe.sha256)
- 未代码签名：项目没有配置代码签名证书。

## 尚待目标 PC 实测

Hosted Windows CI 成功不等同于目标电脑 GUI/DPI 验收。仍需确认深浅色主题下网格对比度、主程序小卡片空间、曲线辨识度、悬浮窗大卡片滚动、功耗来源切换及真实硬件遥测。
