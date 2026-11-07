# NexusMonitor 版本、交付文件与交接记录规则

## 当前基线

- 唯一开发基线：GitHub `main`。
- 当前正式发布：`2.2.4`。
- 下一轮应用行为改动从 `2.2.5` 开始。
- 个人项目默认直接在 `main` 开发；没有明确要求时不创建功能分支或 PR。

## 正式版本规则

- 每轮正式行为改动必须递增语义版本号；补丁级修复也必须递增 PATCH，不得用 FIX/FIX1/FIX2 代替版本号。
- 同步 `VERSION`、`package.json`、`package-lock.json` 根项目、Renderer 版本与 About、HardwareService assembly/API/snapshot、版本校验器要求的版本化 release entrypoint。
- 每轮更新本文件、唯一跨版本开发日志 `NexusMonitor-DEVELOPMENT-LOG-CN.md`、当前 handoff 和 build report。日志不得拆成多个并行的主记录。
- 新版本完成 Windows CI、版本门禁、Node tests、Renderer/Vite、原生模块、.NET、硬件/存储测试、安装包和 SHA-256 检查后，才能标记 Release 成功。
- Hosted CI 不证明物理设备验收；P4 音频输出、独占切换和输出设备恢复需记录用户目标机实测结果。

## 2.2.4 发布记录（2026-11-07）

- Release：[v2.2.4](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.4)。
- Windows CI：[Run #192](https://github.com/xiaobei206/NexusMonitor/actions/runs/42361308963) 全部成功。
- 版本门禁 14/14；Node 主进程测试 238/238，0 failed。
- 安装包大小：160,014,176 bytes。
- SHA-256：`1a82ea9cd511455c2d3c87fb0cbcf2b22eccaf7e19892f3906cb11bef0c835a7`。
- 下一轮正式行为改动递增到 2.2.5。

## 2.2.4 输出路由行为边界

- 创建 Web Audio graph 前必须绑定所选输出设备；非默认 sink 不能绑定时，拒绝接管 `HTMLAudioElement` 音源而不是回退到 Windows 默认设备。
- 打开/关闭 WASAPI 独占时保持用户选择的输出目标；失败与取消路径不能让后续播放一直使用默认声卡。
- 目标 PC 需测试 P4 普通播放、开启/关闭独占、暂停/恢复、切歌、热插拔与默认设备变化。

## 数据与交接

- 用户设置、日志与缓存继续使用 Electron userData（`%APPDATA%\NexusMonitor`），升级不改变数据路径。
- 唯一跨版本开发日志：`NexusMonitor-DEVELOPMENT-LOG-CN.md`。
- 当前交接：`NexusMonitor-2.2.4-HANDOFF-CN.md`。
- 当前构建报告：`NexusMonitor-2.2.4-BUILD-REPORT.md`。
