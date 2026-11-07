# NexusMonitor — 新接手 GPT 请先看这里

**当前主线源码版本：2.2.5；唯一工作基线：GitHub `main`。请首先核对本轮 Windows CI / Release 结果。**

- 上一正式发布基线：[NexusMonitor 2.2.4](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.4)
- 本轮交接：[NexusMonitor-2.2.5-HANDOFF-CN.md](NexusMonitor-2.2.5-HANDOFF-CN.md)
- 本轮构建报告：[NexusMonitor-2.2.5-BUILD-REPORT.md](NexusMonitor-2.2.5-BUILD-REPORT.md)
- 唯一跨版本记录：[NexusMonitor-DEVELOPMENT-LOG-CN.md](NexusMonitor-DEVELOPMENT-LOG-CN.md)
- 架构与硬性约束：[AGENTS.md](AGENTS.md)
- 下一轮正式行为变更应从 2.2.6 开始（须先确认 2.2.5 发布已完成）。

## 本轮目标与代码落点

- `src/renderer/styles.css`：提高全局常用字号；竖向 HUD 关键文本与短屏压缩规则。
- `src/renderer/music-player.css`：音乐库、曲目、播放器弹层、输出设备设置的可读性。
- `src/main/index.ts` 与 `src/main/widget-docking.ts`：竖向 HUD 首选高度 340×1200；实际尺寸受显示器工作区限制。
- 回归测试：`tests/ui-readability.test.cjs`、`tests/widget-vertical-layout.test.cjs`、`tests/widget-docking.test.cjs`。

## P4 / WASAPI

用户在目标电脑确认：选择 `P4 Mono UAC Direct v62` 时，WASAPI 独占开启后无声；关闭独占立即恢复普通输出。用户现阶段接受普通模式，本轮不再冒险改 WASAPI native backend。独占仍为可选项；不可宣称已修复，亦不能仅凭当前观察断言设备在所有配置下都不支持独占。

## 版本与构建

- VERSION、package / lockfile、HardwareService、Renderer 和 `NexusMonitor-2.2.5-BUILD-RELEASE.cjs` 应全部同步为 2.2.5。
- 本轮 workflow 结束后，将真实测试结果和安装包 SHA-256 写回构建报告；禁止沿用 2.2.4 的 238/238 结果。
- Hosted Windows CI 不等于目标机真实 UI 或 P4 扬声器验收。
