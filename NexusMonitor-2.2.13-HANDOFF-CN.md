# NexusMonitor 2.2.13 — 垂直 HUD 自由缩放与尺寸记忆交接

**版本：** 2.2.13  
**基线：** 2.2.12  
**唯一工作基线：** GitHub main  
**目标：** 解决垂直悬浮窗固定 340×1200 过大问题，恢复用户控制的原生拉伸、自动记忆与右键锁定。  
**CI / Release：** 首轮 Windows CI 完成后回填到版本化构建报告及 Release 文案。

## 文件索引

- `src/main/index.ts`：恢复每显示器垂直尺寸；持久保存 `widgetVerticalDisplaySizes`；新增右键勾选项「允许调整窗口大小」；保留锁定状态并刷新最后一笔尺寸写入。
- `src/main/widget-docking.ts`：增加尺寸配置校验、旧记录迁移和 340×900 首次启动默认值；垂直最小尺寸调整到 280×420。
- `src/renderer/styles.css`：纵向内容列宽度跟随原生窗口宽度。
- `tests/widget-vertical-layout.test.cjs`、`tests/widget-docking.test.cjs`：测试尺寸恢复、旧配置迁移、工作区限制及右键缩放锁定。
- `NexusMonitor-2.2.13-BUILD-RELEASE.cjs`：统一版本校验、测试与本地 Windows 安装包构建入口。
- `NexusMonitor-2.2.13-Windows-验收命令.txt`：目标机行为验收步骤。
- `NexusMonitor-2.2.13-BUILD-REPORT.md`：CI、安装包、SHA-256 与目标机验收状态。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md`：跨版本累计开发日志。

## 当前行为

1. 没有有效尺寸记忆时，垂直 HUD 首选 340×900 逻辑像素；实际窗口不会超出显示器工作区。
2. 有有效记忆时恢复该显示器保存的宽度和高度。旧版本只保存于 `widgetDisplayPositions` 的尺寸会校验后迁移；横向 980×112 一类的记录不会被当作竖向尺寸。
3. 右键「允许调整窗口大小」默认勾选。允许时可从边缘/角落拉伸；取消勾选后调用 Electron `setResizable(false)`。勾选状态保存到 settings.json，重启仍保留。
4. 垂直尺寸另存于 `widgetVerticalDisplaySizes`，避免横向 HUD 的标准尺寸覆盖纵向尺寸。切换方向或关闭前会刷新待保存的尺寸。
5. 垂直最小尺寸为 280×420；内容列响应窗口宽度。既有短屏预报折叠、HUD 内部滚动、拖动、靠边停靠、自动隐藏、独立详情窗和横向 HUD 行为继续保留。

## Windows 自动化验证

执行 `NexusMonitor-2.2.13-Windows-验收命令.txt`，以实际 GitHub Actions 和构建报告为准。Hosted CI 不代表目标 PC 的 GUI/DPI 实机验收。

## 目标机验收清单

- 冷启动后首次尺寸约 340×900（工作区约束除外），而不是固定 1200px。
- 右键确认「允许调整窗口大小」默认勾选，可从边缘和角落缩放宽高。
- 调整到自选尺寸后等待自动保存；退出并重新打开，检查宽高恢复一致。
- 取消勾选后窗口不能拉伸；退出并重启，检查尺寸和未勾选状态都保留。
- 重新勾选、调整到另一个尺寸，再取消勾选，确认新尺寸继续保留。
- 检查短窗口滚动、天气/预报加载后文本、靠边隐藏/露出、吸附、横向切换再返回竖向、多显示器/DPI 与工作区边界。

不要将 Hosted CI 描述为已完成实机视觉验收。
