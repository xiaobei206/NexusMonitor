# NexusMonitor 2.2.12 — 构建与发布报告

**版本：** 2.2.12  
**基线：** 2.2.11  
**目标：** 垂直悬浮窗固定尺寸与内容卡片防压缩  
**状态：** 主分支提交后等待 Windows CI；结果以实际 Actions 运行记录为准  
**日期：** 2026-11-26

## 变更摘要

- 垂直 HUD 使用 340×1200 逻辑像素的固定设计尺寸，并且不可手动缩放。显示器工作区较小时，按可用工作区约束实际高度。
- 启动与方向切换不再恢复旧版保存的手动高度；横向 HUD 仍保持可缩放。
- 垂直 HUD 的品牌、硬件指标、迷你播放器、天气和时钟区域采用自然高度，避免实时数据加载后卡片被 flex 收缩。
- 可用高度不足时整块收起未来三天预报，超出内容仍由 HUD 自身滚动区域处理。

## 变更文件索引

- src/main/index.ts：固定启动尺寸、方向切换缩放权限、忽略已保存的竖向高度。
- src/main/widget-docking.ts：方向切换的竖向设计高度改为 1200px，仍受显示器工作区限制。
- src/renderer/App.tsx、src/renderer/styles.css：标记整块三天预报并避免卡片收缩。
- tests/widget-vertical-layout.test.cjs、tests/widget-docking.test.cjs：尺寸、缩放状态和 CSS 布局回归。
- VERSION、package.json、package-lock.json、HardwareService、Renderer 与版本化构建入口：同步为 2.2.12。
- NexusMonitor-2.2.12-HANDOFF-CN.md、NexusMonitor-2.2.12-Windows-验收命令.txt、NexusMonitor-DEVELOPMENT-LOG-CN.md：交接、验收和累计开发记录。

## Windows CI 结果

本报告初次随源码提交建立，不提前声明 CI 通过。提交触发 Windows CI and Release 工作流后，应在此处记录实际 Run 链接、版本一致性门禁、Node 回归数、Renderer 构建、WASAPI/.NET/存储验证、安装包大小与 SHA-256。

## 目标机验收边界

Hosted Windows CI 只能证明工作流中实际执行的构建和自动化测试。仍需在目标 Windows PC 上确认：垂直 HUD 冷启动、硬件与天气信息加载后卡片没有溢字；1080p 及较短工作区下三天预报整体隐藏、小时预报与时钟正常，滚动不会把文字压在格子外；拖动、四边停靠、自动隐藏、横竖方向切换和独立详情窗仍正常。
