# NexusMonitor 版本、交付文件与交接记录规则

当前源码版本：`2.1.8`。

## 正式版本

- **每一轮完成并交付的开发迭代都必须递增正式版本号**；补丁级修复也递增 PATCH（例如 `2.1.0` → `2.1.1` → `2.1.2` → `2.1.3` → `2.1.4` → `2.1.5` → `2.1.6` → `2.1.7` → `2.1.8`），不得继续沿用旧版本号交付源码补丁，也不以 FIX/FIX1/FIX2 作为版本名。
- 同步 `package.json`、`package-lock.json` 根项目、`VERSION`、Renderer/About、HardwareService API/状态、.NET Assembly/File/InformationalVersion 与发布校验器。
- 源码目录与 ZIP 使用 `NexusMonitor-<version>`。
- 构建报告、交接文档、Windows 验收命令、源码清单、SHA-256 文件、构建入口等版本专属文件都必须使用 `NexusMonitor-<version>-...` 命名。

## 唯一跨版本开发日志

项目只有一个持续更新的开发日志：`NexusMonitor-DEVELOPMENT-LOG-CN.md`。不要每个版本另建日志，也不要删除旧版本章节。每次发布在同一文件中追加版本、日期、改动、根因、失败尝试、测试结果和未完成验收项。由于它必须跨版本保持同一个路径，因此文件名本身不带版本号；当前版本在文件头明确标注。

## 唯一当前交接文档

每个源码包只保留一份当前交接说明，例如 `NexusMonitor-2.1.8-HANDOFF-CN.md`。它必须说明架构、源码位置、版本同步规则、构建入口、已知故障/踩坑、测试边界、设备验收清单，并明确要求新对话先读交接说明和唯一开发日志。旧版本的 build report/handoff/prompt 应在新信息合并后清理，避免互相矛盾。

## 用户数据路径

配置、日志与插件数据继续使用 Electron userData（`%APPDATA%\NexusMonitor`）；升级版本不能改变数据路径或丢失现有设置。
