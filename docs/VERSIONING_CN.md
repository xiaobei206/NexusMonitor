# NexusMonitor 版本、交付文件与交接记录规则

## 当前基线

- 唯一开发基线：GitHub `main`。
- 当前工作版本：`2.2.4`，目标是修复目标机 P4 Mono UAC Direct v62 普通输出设备路由在启用 WASAPI 后丢失的问题。
- 上一正式发布：`2.2.3`。
- 个人项目默认直接在 `main` 开发；没有明确要求时不创建功能分支或 PR。

## 正式版本规则

- 每轮正式行为改动必须递增语义版本号；补丁级修复也必须递增 PATCH，不得用 FIX/FIX1/FIX2 代替版本号。
- 同步 `VERSION`、`package.json`、`package-lock.json` 根项目、Renderer 版本与 About、HardwareService assembly/API/snapshot、版本校验器要求的版本化 release entrypoint。
- 每轮更新本文件、唯一跨版本开发日志 `NexusMonitor-DEVELOPMENT-LOG-CN.md`、当前 handoff 和 build report。日志不得拆成多个并行的主记录。
- 新正式版本完成 Windows CI、版本门禁、测试、原生模块、.NET、安装包与校验和检查后，才能标记为 Release 成功。
- Hosted CI 不证明物理设备验收；P4 音频输出、独占切换和输出设备恢复需记录用户目标机实测结果。

## 当前 2.2.4 验收要求

- 创建 Web Audio 图前绑定所选输出设备；非默认 sink 不能绑定时，拒绝接管 `HTMLAudioElement` 音源而不是回退到 Windows 默认设备。
- 打开/关闭 WASAPI 独占时保持用户已选输出目标；失败与取消路径不能让后续播放一直使用默认声卡。
- 更新版本门禁与源码回归测试，生成 Windows x64 NSIS 安装包和 SHA-256 sidecar。
- 目标机测试 P4 普通输出、开启独占、关闭独占、暂停/恢复与应用重新启动前后的设备路由。

## 数据与交接

- 用户设置、日志与缓存继续使用 Electron userData（`%APPDATA%\NexusMonitor`），版本升级不应更改路径或重置用户设置。
- 唯一跨版本开发日志为 `NexusMonitor-DEVELOPMENT-LOG-CN.md`。
- 当前接手文档：`NexusMonitor-2.2.4-HANDOFF-CN.md`。
- 当前构建报告：`NexusMonitor-2.2.4-BUILD-REPORT.md`。

