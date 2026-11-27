# NexusMonitor 2.2.15 — 构建与发布报告

**版本：** 2.2.15  
**基线：** 2.2.14  
**状态：** 源码已提交；Windows CI 待验证，尚未确认安装包发布。  
**Workflow Run：** 待实际 workflow 启动后补充  
**GitHub Release：** 待验证

## 变更摘要

- 竖向悬浮窗改为按当前可见内容自然高度设置 Windows 原生最小高度；正常显示器上向上拖动时，窗口在内容刚好放得下的位置停止缩小，不再进入内部滚动状态。
- ResizeObserver / MutationObserver 监听内容尺寸、宽度换行、实时天气/音乐及模块可见性变化。
- 内容变多且当前窗口不足时自动扩展；底边停靠时保留底部锚定。
- 最低保留 420px 下限，并裁剪到显示器工作区；横向 HUD 完全不变。

## 验证状态

- 版本一致性门禁：待 CI。
- Main / Node 回归测试：待 CI。
- Renderer TypeScript 与 Vite 生产构建：待 CI。
- WASAPI、PawnIO、.NET HardwareService、Hardware/Storage 测试：待 CI。
- Windows NSIS 安装包、SHA-256、GitHub Release 与 artifact 上传：待 CI。

## 尚待目标 PC 实测

确认内容临界高度、宽度变化和文字换行、天气预报/指标显隐、底边停靠、短屏工作区和多屏 DPI。目标工作区小于可见内容总高度时，可能保留滚动兜底。
