# NexusMonitor 2.2.11 — 构建与发布报告

**版本：** 2.2.11  
**基线：** 2.2.10  
**目标：** 动态国务院节假日日历  
**状态：** 已正式发布  
**发布日期：** 2026-11-23

## 正式交付

- GitHub Release：[v2.2.11](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.11)
- Windows CI：[Run #254 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/45144691021)
- 安装包：[NexusMonitor-2.2.11-Setup.exe](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.11/NexusMonitor-2.2.11-Setup.exe)
- 文件大小：160,069,433 bytes（约 152.65 MiB）
- SHA-256：`7c3f0238e185e8b5930d93e75f224bdae2c0f721311cdf82e064d397b4b9e994`
- SHA 文件：[NexusMonitor-2.2.11-Setup.exe.sha256](https://github.com/xiaobei206/NexusMonitor/releases/download/v2.2.11/NexusMonitor-2.2.11-Setup.exe.sha256)

## 变更摘要

- 内置 2017—2027 年国务院年度放假/调休安排。
- 实现官方通知规则解析器，覆盖区间日期、简写日期、跨年日期、补休、上班日期及日期括号注释。
- 未来年份按需后台查询，成功解析后写入年度 JSON 缓存并即时刷新日历。
- 官方解析失败时尝试 Google / 百度搜索页 AI JSON 回显；所有候选结果经过相同官方来源与日期校验。
- 查询失败不覆盖旧缓存，不猜测未公布安排。
- 统一同步 2.2.11 版本元数据。

## Windows CI Run #254 验证结果

| 项目 | 结果 |
|---|---|
| 版本一致性门禁 | 通过 |
| Main / Node 回归 | 通过，270/270 |
| Renderer TypeScript / Vite | 通过 |
| Windows native WASAPI | 通过 |
| PawnIO 官方 MCHBAR 资源 | 通过 |
| .NET HardwareService | 通过 |
| Hardware / Storage tests | 通过 |
| Windows NSIS 安装包 | 通过 |
| SHA-256 生成 | 通过 |
| GitHub Release 发布 | 通过 |
| Workflow artifact 上传 | 通过 |

完整记录：[GitHub Actions Run #254](https://github.com/xiaobei206/NexusMonitor/actions/runs/45144691021)。

## 发布后发现的历史数据校正项

2020 年年度假期通知后来被国务院办公厅另行调整：2020-01-26 的后续通知将春节假期延长至 2020-02-02，并明确 2020-02-03 起正常上班。2.2.11 内置数据仍采用最初年度安排（2020-01-24 至 2020-01-30，2020-02-01 补班），尚未合并后续修订。下一行为版本需将 2020-01-31 至 2020-02-02 加入休假日期，并从补班列表移除 2020-02-01。官方原文：https://app.www.gov.cn/govdata/gov/202001/27/453442/article.html。

2027 年日期列表已与两家 AI 搜索回显一致；源码表当前记录的政府网 URL 来自百度返回的 `zhengceku/...7085102.htm`，另检索到该通知的政府网正文入口 `zhengce/content/...7085101.htm`，规范来源 URL 后续宜统一。

## 真实年度验证边界

截至 2026-11-23，2027 年官方通知已经公布并随软件内置；2028 年安排尚未公布。因此本版使用 2017—2027 年历史通知样本和合成 2028 样本验证规则解析、未知年份、缓存和界面刷新。2028 年真实公文的联网命中只能在其正式公布后验收。

Google / Baidu AI 回显属于尽力而为的后备，不是稳定 API；普通 HTTP 请求可能无法获得搜索页面中的 AI 回显。Hosted Windows CI 通过也不代表用户目标 PC 的实际网络访问已验收。官方通知获取、搜索引擎访问及 AI 后备仍需在目标机检查。

**本版本正式发布成功；不要把 CI 成功等同于 2028 年真实年度联网验收完成。**
