本文记录 2.1.8 当前代码保留的 HUD 行为；其中部分机制最初于 2.0.4 引入。发生冲突时以当前主进程源码和回归测试为准。全屏让位是 best-effort，不保证所有独占全屏、DirectFlip 或多屏驱动场景。


## 右键菜单

悬浮窗右键菜单使用 Electron 原生 Menu：固定位置、始终置顶、靠边自动隐藏、全屏时自动让位、打开主界面、退出 NexusMonitor。置顶只作用于 HUD，不再与主界面设置共享。

## 边缘吸附

拖动释放时，若窗口距当前显示器 workArea 四边不超过 42 px，则吸附到最近边。否则保留自由位置。固定位置开启后，renderer 不再移动窗口，主进程也会拒绝 move IPC。

## 自动隐藏

自动隐藏默认关闭，且仅对已吸附窗口生效。鼠标离开 HUD 2 秒后，主进程把窗口缩到边缘，保留 10 px 感应条。鼠标重新进入时恢复保存的 bounds 和之前的 min-size。关闭自动隐藏或通过快捷键再次显示也会恢复原窗口。

## 展开方向

- 左右边吸附的竖向 HUD：右边吸附时详情面板向左展开；左边吸附时向右。
- 上下边吸附的横向 HUD：顶部向下展开；底部向上。
- 多显示器位置按 Windows display id 保存 x/y/dock edge；重新启动时优先恢复上次使用的显示器，若显示器已不存在则回退到主显示器并限制在可用工作区。

## 全屏让位

Windows PowerShell helper 通过 Win32 `GetForegroundWindow`、`GetWindowRect`、`MonitorFromWindow` 和 `GetMonitorInfo` 读取前台窗口矩形及其显示器，再与 HUD HWND 所在显示器比较。若前台窗口覆盖同一显示器，临时关闭 HUD topmost；退出时恢复 `widgetAlwaysOnTop`。不以进程名识别 YouTube、Bilibili 或 Steam，避免误判同屏普通窗口。

检测间隔约 800ms。无边框全屏通常可以按窗口矩形识别；独占全屏、DirectFlip、驱动覆盖层及不同 DPI 多显示器仍需在目标 Windows 11 电脑上实测，因此不承诺所有独占全屏游戏都 100% 让位。
