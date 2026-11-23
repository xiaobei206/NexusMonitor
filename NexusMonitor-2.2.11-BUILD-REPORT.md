# NexusMonitor 2.2.11 — 构建与发布报告

**版本：** 2.2.11  
**基线：** 2.2.10  
**目标：** 动态国务院节假日日历  
**状态：** 源码已推送；Windows CI、安装包与 Release 待核验。

## 变更摘要

- 内置 2017—2027 年国务院年度放假/调休安排。
- 实现官方通知规则解析器，覆盖区间日期、简写日期、跨年日期、补休、上班日期及日期括号注释。
- 未来年份按需后台查询，成功解析后写入年度 JSON 缓存并即时刷新日历。
- 官方解析失败时尝试 Google / 百度搜索页 AI JSON 回显；所有候选结果经过相同校验。
- 查询失败不覆盖旧缓存，不猜测未公布安排。
- 统一同步 2.2.11 版本元数据。

## 预期验证

| 项目 | 命令 / 方式 | 当前状态 |
|---|---|---|
| 版本一致性 | node scripts/validate-release-version.cjs | 等待 CI |
| Main / Node 回归 | npm.cmd run test:main | 等待 CI |
| Renderer TypeScript / Vite | npm.cmd run build:renderer | 等待 CI |
| native WASAPI | npm.cmd run build:wasapi | 等待 CI |
| .NET HardwareService | dotnet build ... -c Release | 等待 CI |
| Hardware / Storage tests | npm.cmd run test:storage | 等待 CI |
| Windows NSIS 安装包 | GitHub Windows CI | 等待 CI |
| SHA-256 / GitHub Release | GitHub Windows CI | 等待 CI |

## 真实年度验证说明

当前时间为 2026-11-23，2027 年官方通知已内置。2028 年通知尚未公布，因此本版使用历年公文回归和合成 2028 样本验证代码路径。未来真实通知的联网命中、搜索引擎 AI 回显及用户目标机网络访问仍待实际发生后验收。

**不得将 2.2.10 或更早版本的 CI 结果写成 2.2.11 的通过记录。**
