# NexusMonitor 2.2.13 — 构建与发布报告

**版本：** 2.2.13  
**基线：** 2.2.12  
**目标：** 垂直 HUD 自动记忆尺寸与可持久化的右键缩放锁定  
**状态：** 等待本版本 Windows CI 实际运行并回填最终发布数据；此占位报告不代表构建或发布已成功。

## 变更摘要

- 垂直 HUD 启动时恢复每显示器保存的宽度和高度，并校验迁移旧版本有效的纵向尺寸。
- 首次启动或无有效尺寸时默认 340×900 逻辑像素，最终窗口受显示器工作区约束。
- 右键「允许调整窗口大小」默认勾选；用户取消勾选后禁用原生拉伸，尺寸与锁定状态持久保存。
- 纵向尺寸独立保存在 `widgetVerticalDisplaySizes`，不与横向 HUD 默认尺寸互相覆盖。
- 垂直最小尺寸为 280×420；内容列随窗口宽度响应，既有卡片自然高度、短屏预报折叠和内部滚动保持有效。

## Windows CI 结果

- Workflow run / 完成状态：待本提交实际运行后回填。
- Main / Node 测试数：待回填实际通过数与失败数。
- Renderer TypeScript / Vite：待回填。
- Native WASAPI、PawnIO MCHBAR、.NET HardwareService、Hardware/Storage tests：待回填。
- NSIS 安装包、SHA-256、GitHub Release、workflow artifact：待回填。

## 正式交付信息

- GitHub Release：待 CI 实际创建后回填。
- 安装包：`NexusMonitor-2.2.13-Setup.exe`；文件大小与 SHA-256 待构建成功后回填。
- 安装包未代码签名（项目未配置代码签名证书）。

## 实机验收边界

Hosted Windows CI 不等同于目标 Windows PC 的 GUI 验收。仍需确认原生边缘/角落拉伸、尺寸跨重启恢复、右键锁定跨重启恢复、横竖切换、多显示器/DPI 工作区、较短窗口下内容滚动、拖动/吸附/自动隐藏及完整天气加载后的布局。
