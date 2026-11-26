# NexusMonitor 2.2.13 — 构建与发布报告

**版本：** 2.2.13  
**基线：** 2.2.12  
**状态：** 已正式发布，Windows CI 成功  
**Workflow Run：** [Run #45739133551](https://github.com/xiaobei206/NexusMonitor/actions/runs/45739133551)  
**GitHub Release：** [NexusMonitor 2.2.13](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.13)

## 变更摘要

- 垂直 HUD 启动时恢复每显示器保存的宽度和高度，并校验迁移旧版本有效的纵向尺寸。
- 首次启动或无有效尺寸时默认 340×900 逻辑像素；实际窗口受显示器工作区约束。
- 右键「允许调整窗口大小」默认勾选；取消勾选后禁用原生拉伸，尺寸与锁定状态持久保存。
- 纵向尺寸独立保存在 `widgetVerticalDisplaySizes`，不与横向 HUD 默认尺寸互相覆盖。
- 垂直最小尺寸为 280×420；内容列随窗口宽度响应，保留卡片自然高度、短屏预报折叠和内部滚动。

## Windows CI 实际结果

- 版本一致性门禁：**14/14 checks passed**。
- Main / Node：**277/277 tests passed，0 failed**。
- Renderer TypeScript 与 Vite 生产构建：成功。
- Native WASAPI 输出模块：成功。
- PawnIO MCHBAR 资源验证：成功。
- .NET HardwareService Release 构建：成功。
- Hardware / Storage tests：成功。
- Windows NSIS 安装包：成功。
- SHA-256 生成：成功。
- GitHub Release 发布、Release 描述同步、workflow artifact 上传：成功。

## 安装包与校验值

- 文件：`NexusMonitor-2.2.13-Setup.exe`
- 大小：**160,069,900 bytes**
- SHA-256：`7649d3046d7849ce3b9803a55a57ea792c7525dacb0e04b29204f1a0283a2dfd`
- [下载安装包](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.13/NexusMonitor-2.2.13-Setup.exe)
- [SHA-256 sidecar](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.13/NexusMonitor-2.2.13-Setup.exe.sha256)
- 未代码签名：项目没有配置代码签名证书。

## 尚待目标 PC 实测

Hosted Windows CI 成功不等同于目标电脑 GUI/DPI 验收。仍需确认原生边缘/角落拉伸、尺寸跨重启恢复、右键锁定跨重启恢复、横竖切换、多显示器/DPI 工作区、较短窗口下内容滚动、拖动/吸附/自动隐藏及天气完整加载后的实际布局。
