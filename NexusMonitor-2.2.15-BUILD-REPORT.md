# NexusMonitor 2.2.15 — 构建与发布报告

**版本：** 2.2.15  
**基线：** 2.2.14  
**状态：** 已正式发布，Windows CI 全流程成功  
**Workflow Run：** [Run #45931132667](https://github.com/xiaobei206/NexusMonitor/actions/runs/45931132667)  
**GitHub Release：** [NexusMonitor 2.2.15](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.15)

## 变更摘要

- 竖向悬浮窗改为按当前可见内容自然高度设置 Windows 原生最小高度；正常显示器上向上拖动时，窗口在内容刚好放得下的位置停止缩小，不再进入内部滚动状态。
- ResizeObserver / MutationObserver 监听内容尺寸、宽度换行、实时天气/音乐及模块可见性变化。
- 内容变多且当前窗口不足时自动扩展；底边停靠时保留底部锚定。
- 最低保留 420px 下限，并裁剪到显示器工作区；横向 HUD 完全不变。

## 验证结果

- 版本一致性门禁：14/14 通过。
- Main / Node 回归测试：280/280 通过，0 失败。
- Renderer TypeScript 与 Vite 生产构建：成功。
- 原生 WASAPI 模块：成功。
- PawnIO MCHBAR 资源校验与准备：成功。
- .NET HardwareService 构建：成功。
- Hardware/Storage 测试：成功。
- Windows NSIS 安装包打包：成功。
- SHA-256 生成：成功。
- GitHub Release 发布、Release 描述同步、workflow artifact 上传：成功。

## 安装包与校验值

- 文件：`NexusMonitor-2.2.15-Setup.exe`
- 大小：**160070866 bytes**
- SHA-256：`1dd1895ad45ba061264f2d7b2f2b2e577a1d9e781caad038efafb7bb697580d1`
- [下载安装包](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.15/NexusMonitor-2.2.15-Setup.exe)
- [SHA-256 sidecar](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.15/NexusMonitor-2.2.15-Setup.exe.sha256)
- 未代码签名：项目没有配置代码签名证书。

## 尚待目标 PC 实测

Hosted Windows CI 成功不等同于目标电脑 GUI/DPI 验收。仍需确认内容临界高度、宽度变化和文字换行、天气预报/指标显隐、底边停靠、短屏工作区和多屏 DPI。目标工作区小于可见内容自然高度时，可能保留滚动兜底。
