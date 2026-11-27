# NexusMonitor 2.2.15 — 竖向 HUD 内容自适应最小高度交接

**版本：** 2.2.15  
**基线：** 2.2.14  
**唯一工作基线：** GitHub main  
**状态：** 已正式发布；Windows CI 全流程成功  
**CI：** [Run #45931132667](https://github.com/xiaobei206/NexusMonitor/actions/runs/45931132667)  
**Release：** [NexusMonitor 2.2.15](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.15)

## 文件索引

- `src/renderer/App.tsx`：测量竖向悬浮条所有可见顶层内容块的自然高度；通过 ResizeObserver / MutationObserver 在尺寸和显示内容变化时更新。
- `src/preload/index.ts`、`src/renderer/vite-env.d.ts`：新增受限 IPC 类型与桥接方法，向主进程报告内容所需高度。
- `src/main/index.ts`：校验请求来自悬浮窗自身 WebContents；更新原生窗口最小高度；内容增高时扩窗，底边停靠时保持底部锚定。
- `src/main/widget-docking.ts`：新增按工作区边界裁剪内容最小高度的纯函数。
- `tests/widget-docking.test.cjs`、`tests/widget-vertical-layout.test.cjs`：覆盖高度下限策略、工作区限制、Renderer 观察器和 IPC 授权边界。
- `NexusMonitor-2.2.15-BUILD-RELEASE.cjs`：版本校验与本地 Windows 构建入口。
- `NexusMonitor-2.2.15-Windows-验收命令.txt`：构建命令和目标机验收步骤。
- `NexusMonitor-2.2.15-BUILD-REPORT.md`：实际 CI、测试、安装包与 SHA-256 记录。

## 当前行为设计

1. 竖向 HUD 的原生最小高度由可见内容的自然高度计算，不以当前窗口的 scrollHeight/clientHeight 直接作为结果。
2. 顶层信息块不参与压缩；测量值包含 flex gap、内边距、边框和 2px 余量。窗口到达当前内容临界高度后，原生窗口停止继续缩小。
3. 监听内容块尺寸和子项增删。宽度收窄导致换行、实时天气或音乐块变化、用户隐藏/显示指标时都会更新下限。
4. 若新增内容超过当前窗口高度，主进程会扩展窗口；底边停靠时保留底边位置。
5. 最小高度至少 420px，但不超过当前显示器工作区高度。工作区本身不足以容纳内容时，优先保证窗口不越界，保留滚动兜底。
6. 横向 HUD 不调用该接口，现有横向自由压缩和尺寸记忆保持不变。

## CI 与安装包

- [Windows CI Run #269](https://github.com/xiaobei206/NexusMonitor/actions/runs/45931132667) 全流程成功。
- 版本一致性：14/14 检查通过。
- Main / Node 回归测试：280/280 通过。
- Renderer TypeScript/Vite、WASAPI、PawnIO、.NET HardwareService、Hardware/Storage、NSIS 安装包、SHA-256、Release 文案同步及 artifact 上传均成功。
- 安装包：`NexusMonitor-2.2.15-Setup.exe`，160070866 bytes。
- SHA-256：`1dd1895ad45ba061264f2d7b2f2b2e577a1d9e781caad038efafb7bb697580d1`。
- [下载 Windows 安装包](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.15/NexusMonitor-2.2.15-Setup.exe)
- 未配置代码签名证书，因此安装包未签名。

## 目标 PC 实机验收

检查竖向 HUD 向上拖动时停在内容刚好放下的位置、不会出现滚动条；宽度变化导致换行、天气预报变化、勾选/隐藏指标、边缘吸附、底边锚定、多屏/DPI 和短屏兜底。横向 HUD 应与 2.2.14 表现一致。Hosted CI 不等同于目标机 GUI/DPI 实测。
