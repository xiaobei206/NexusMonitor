# NexusMonitor 2.2.14 — 构建与发布报告

**版本：** 2.2.14  
**基线：** 2.2.13  
**状态：** 源码已提交；Windows CI 验证中，尚未确认安装包发布。  
**Workflow Run：** 待实际 workflow 启动后补充  
**GitHub Release：** 待验证

## 变更摘要

- 主程序与悬浮窗详情的共享历史曲线添加低对比度水平、垂直网格线。
- 悬浮窗大卡片中的智能功耗摘要增加最近 60 次有效采样的总功耗曲线。
- 曲线使用现有功耗摘要逻辑；来源模式切换时重置历史，避免把不同来源的瓦特值误连为同一趋势。

## 验证状态

- 版本一致性门禁：待 CI。
- Main / Node 回归测试：待 CI。
- Renderer TypeScript 与 Vite 生产构建：待 CI。
- WASAPI、PawnIO、.NET HardwareService、Hardware/Storage 测试：待 CI。
- Windows NSIS 安装包、SHA-256、GitHub Release 与 artifact 上传：待 CI。

## 安装包与校验值

CI 未完成前不填写安装包大小、SHA-256 或发布链接，以免把未验证数据误当成最终结果。

## 尚待目标 PC 实测

需在目标 Windows 电脑验证深色/浅色主题下的网格对比度、曲线辨识度、主程序小卡片空间、悬浮窗大卡片滚动、功耗源切换及真实硬件遥测。Hosted Windows CI 不等同于目标机实测。
