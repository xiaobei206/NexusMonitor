# NexusMonitor 2.2.14 — 曲线网格与总功耗历史曲线交接

**版本：** 2.2.14  
**基线：** 2.2.13  
**唯一工作基线：** GitHub main  
**状态：** 已正式发布；Windows CI 全流程成功  
**CI：** [Run #45743775825](https://github.com/xiaobei206/NexusMonitor/actions/runs/45743775825)  
**Release：** [NexusMonitor 2.2.14](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.14)

## 文件索引

- `src/renderer/App.tsx`：统一历史曲线网格；新增 `WidgetHistory.power` 与来源模式记忆；为悬浮窗详情功耗卡片增加总功耗历史曲线。
- `src/renderer/styles.css`：为 Sparkline 的横向、纵向参考线设定低对比度样式，依赖当前前景色以适配主题。
- `tests/ui-readability.test.cjs`：新增图表网格、总功耗曲线和来源模式重置的源码回归断言。
- `NexusMonitor-2.2.14-BUILD-RELEASE.cjs`：版本校验与本地 Windows 构建入口。
- `NexusMonitor-2.2.14-Windows-验收命令.txt`：构建命令与目标电脑人工验收清单。
- `NexusMonitor-2.2.14-BUILD-REPORT.md`：实际 workflow、测试、安装包与 SHA-256 信息。
- `NexusMonitor-DEVELOPMENT-LOG-CN.md`：跨版本累计开发日志。

## 当前实现

1. 主程序和悬浮窗详情里使用共享 `Sparkline` 的图表都显示三条水平、三条垂直低对比度网格线；网格位于填充区和曲线下方。
2. 悬浮窗的功耗卡片增加“TOTAL POWER HISTORY”，最多保留最近 60 次有效样本，颜色与其他曲线保持区分。
3. 曲线数据来自现有 `resolvePowerSummary`。电池放电功率保持负值；来源模式变化时清空旧历史，避免混合不同语义。
4. 无有效功耗传感器时仍显示等待采样状态；不以平台功率伪装成 CPU/GPU 合计，也不声称测量插座总功率。

## CI 与安装包

- [Windows CI Run #264](https://github.com/xiaobei206/NexusMonitor/actions/runs/45743775825) 全流程成功。
- 版本一致性：14/14 检查通过。
- Main / Node 回归测试：278/278 通过。
- Renderer TypeScript/Vite、WASAPI、PawnIO、.NET HardwareService、Hardware/Storage、安装包、校验值生成、Release 文案同步及 artifact 上传均成功。
- 安装包：`NexusMonitor-2.2.14-Setup.exe`，160,070,599 bytes。
- SHA-256：`047927336373a2ce5f9b40160fa2007e5266723ac2f7b2d19bd26a5528fdd308`。
- [下载 Windows 安装包](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.14/NexusMonitor-2.2.14-Setup.exe)
- 未配置代码签名证书，因此安装包未签名。

## 实机验收

按 `NexusMonitor-2.2.14-Windows-验收命令.txt` 检查主程序小图、大卡片曲线、浅色/深色主题、功耗来源切换及悬浮窗横竖向布局。Hosted CI 成功不代表已完成目标 Windows PC 的 DPI、布局和硬件遥测实测。
