# NexusMonitor 2.2.12 — 构建与发布报告

**版本：** 2.2.12  
**基线：** 2.2.11  
**目标：** 垂直悬浮窗固定尺寸与内容卡片防压缩  
**状态：** 已正式发布  
**日期：** 2026-11-26

## 正式交付

- GitHub Release：[v2.2.12](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.12)
- Windows CI：[Run #258 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/45735313607)
- 安装包：[NexusMonitor-2.2.12-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.12/NexusMonitor-2.2.12-Setup.exe)
- 文件大小：160,069,864 bytes（约 152.65 MiB）
- SHA-256：`979a2a8c7c4fbefaf593d0e5e076cadda73862409ca6f790ecc27de9a5bf04ac`
- SHA 文件：[NexusMonitor-2.2.12-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.12/NexusMonitor-2.2.12-Setup.exe.sha256)
- 安装包未代码签名（项目未配置代码签名证书）。

## 变更摘要

- 垂直 HUD 使用 340×1200 逻辑像素的固定设计尺寸；在显示器可用工作区不足时自动约束实际窗口尺寸。
- 垂直方向不可手动缩放，启动和方向切换时忽略旧版保存的手动高度；横向 HUD 仍支持缩放。
- 品牌栏、硬件指标、迷你播放器、天气卡片与时钟保持自然高度，避免数据异步加载、文字换行后被 flex 压缩。
- 可用高度不足时整块隐藏可选的未来三天预报；剩余内容仍在 HUD 自己的滚动区域中显示。

## Windows CI Run #258 验证结果

| 项目 | 结果 |
|---|---|
| 版本一致性门禁 | 通过 |
| Main / Node 回归测试 | 271/271 通过，0 failed |
| Renderer TypeScript / Vite | 通过 |
| Windows native WASAPI 构建 | 通过 |
| PawnIO 官方 MCHBAR 资源校验 | 通过 |
| .NET HardwareService | 通过 |
| Hardware / Storage tests | 通过 |
| Windows NSIS 安装包 | 通过 |
| SHA-256 生成 | 通过 |
| GitHub Release 发布 | 通过 |
| Workflow artifact 上传 | 通过 |

## 变更文件索引

- `src/main/index.ts`：固定启动尺寸、方向切换缩放权限、忽略已保存的竖向高度。
- `src/main/widget-docking.ts`：方向切换使用 1200px 竖向设计高度，实际 bounds 仍受工作区限制。
- `src/renderer/App.tsx`、`src/renderer/styles.css`：整块标记三天预报并防止卡片收缩。
- `tests/widget-vertical-layout.test.cjs`、`tests/widget-docking.test.cjs`：尺寸、缩放状态、自然高度和短屏规则回归。
- 本次新增的 Release 文案维护：`.github/release-notes.json`、`scripts/sync-release-notes.cjs`、`tests/release-notes.test.cjs`。

## 目标机验收边界

Hosted Windows CI 不等于目标 PC 的视觉验收。仍需在真实 Windows 电脑上确认：冷启动并等待所有硬件与天气字段加载后，文字始终留在卡片内；1080p 和更短的工作区上三天预报整体隐藏、小时预报与时钟正常，滚动不再压扁卡片；拖动、四边停靠、自动隐藏、横竖方向切换与独立详情窗均正常。
