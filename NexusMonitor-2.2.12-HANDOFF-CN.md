# NexusMonitor 2.2.12 — 垂直悬浮窗固定布局交接

**版本：** 2.2.12  
**开发基线：** 2.2.11  
**唯一工作基线：** GitHub main  
**目标：** 修复垂直 HUD 在异步加载硬件/天气数据后，文字溢出内部卡片的问题。  
**Windows CI：** [Run #258 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/45735313607)  
**正式 Release：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.12  
**安装包：** 160,069,864 bytes；SHA-256 `979a2a8c7c4fbefaf593d0e5e076cadda73862409ca6f790ecc27de9a5bf04ac`  
**实机验收：** 等用户在目标 Windows PC 上确认完整加载后的 HUD 文字均留在卡片内。

## 文件索引

- src/main/index.ts：启动固定尺寸；竖向禁用窗口缩放；方向切换时正确恢复或禁用缩放。
- src/main/widget-docking.ts：垂直方向默认设计尺寸 340×1200，工作区不足时自动约束实际 bounds。
- src/renderer/App.tsx：给未来三天预报整块增加专用 class，方便短屏整体折叠。
- src/renderer/styles.css：垂直卡片禁止 flex-shrink；工作区高度不足时折叠三天预报；非常短的窗口继续压缩间距。
- tests/widget-vertical-layout.test.cjs、tests/widget-docking.test.cjs：垂直尺寸、不可缩放、自然高度和短屏规则的回归测试。
- NexusMonitor-2.2.12-BUILD-REPORT.md：Windows CI、安装包与 SHA-256 的唯一版本化构建报告。
- NexusMonitor-2.2.12-Windows-验收命令.txt：目标机检查步骤与标准构建命令。
- NexusMonitor-2.2.12-BUILD-RELEASE.cjs：本地一键版本一致性、测试与安装包构建入口。
- NexusMonitor-DEVELOPMENT-LOG-CN.md：跨版本累计开发记录。

## 行为说明

1. 垂直 HUD 设计尺寸为 340×1200 逻辑像素。启动和方向切换时忽略旧版保存的手动高度。
2. 如果显示器工作区不足以容纳 1200px 高度，实际窗口按该工作区约束；该模式不允许用户手动拉伸，也不会超出屏幕。
3. 横向 HUD 仍可缩放。移动、靠边停靠、靠边自动隐藏、置顶、全屏让位、日历入口、独立详情窗和音乐播放引擎维持既有行为。
4. 卡片保持自然内容高度，不会被 flex 布局压扁。工作区高度低于设计值时先整块隐藏未来三天预报；低于 920px 时进一步压缩间距。内容高度仍超过工作区时，滚动发生在 HUD 栏内部。
5. 该修改不改变硬件采样、天气 API、音乐播放链路或独立 USB 副屏。

## Windows 验证

执行 NexusMonitor-2.2.12-Windows-验收命令.txt 中的版本一致性、Main/Node、Renderer、WASAPI、PawnIO、.NET 与存储测试。以 GitHub Actions 的实际输出为准。

## 目标机验收清单

- 结束并重新启动程序，检查垂直 HUD 是否采用适合当前屏幕的固定尺寸。
- 等 CPU/GPU、磁盘、网络、功耗、迷你播放器和天气预报全部加载后，检查每一张卡片的文字都留在边框内。
- 在可用高度足够的屏幕上检查未来三天预报；在 1080p 和更矮的工作区上确认整块预报隐藏且标题不残留。
- 检查小时天气、时钟、日历按钮、内部滚动、拖动、四边停靠、自动隐藏，以及切换到横向再切回竖向。
- CI 成功不等于目标机布局实测成功；只有完成以上检查后才记录为实机验收通过。
