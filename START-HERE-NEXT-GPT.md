# NexusMonitor — 新接手 GPT 请先看这里

**当前正式发布：2.2.6；Windows CI Run #201 全部成功。唯一工作基线：GitHub main。接手时先核对 main 最新 HEAD；下一个正式行为版本从 2.2.7 开始。**

- 当前正式发布：[NexusMonitor 2.2.6](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.6)
- 当前交接：[NexusMonitor-2.2.6-HANDOFF-CN.md](NexusMonitor-2.2.6-HANDOFF-CN.md)
- 当前构建报告：[NexusMonitor-2.2.6-BUILD-REPORT.md](NexusMonitor-2.2.6-BUILD-REPORT.md)
- 唯一跨版本日志：[NexusMonitor-DEVELOPMENT-LOG-CN.md](NexusMonitor-DEVELOPMENT-LOG-CN.md)
- 架构与硬性约束：[AGENTS.md](AGENTS.md)
- 2.2.6 已发布；下一正式行为版本为 2.2.7。CI #201：https://github.com/xiaobei206/NexusMonitor/actions/runs/42378652196

## 2.2.6 变更落点

- HardwareService/Monitoring/WeatherService.cs：QWeather V1、WeatherCN 标准 API、Caiyun V2.6，并保留 Open-Meteo / WeatherAPI / OpenWeather。
- src/main/index.ts：本机 QWeather Ed25519/JWT、Windows safeStorage 加密、天气凭据 IPC、每显示器 HUD 高度保存。
- src/renderer/App.tsx：六个天气源选择与配置向导、天气连通性测试、数据来源声明、按 AQI 标准区分标签。
- src/renderer/aqi.ts：China-MEP 与 US-EPA 分类文字分开处理。
- src/main/widget-docking.ts：竖向 HUD 默认 960px；切换方向时恢复该显示器已保存高度，夹在 700–1200px 并按工作区裁剪。
- 回归测试：tests/weather-provider-contract.test.cjs、tests/widget-docking.test.cjs、tests/ui-readability.test.cjs。

## 天气凭据说明

- Open-Meteo 无需 Key。
- QWeather V1：本机生成 Ed25519 密钥；只上传公钥到控制台，再填写 Developer ID、Project ID、Credential ID、API Host。私钥仅保存在本机加密设置中。
- 华风爱科：标准 API Key 走 X-Gw-API-Key Header，Location Key 缓存 24 小时；标准测试 Key 额度 500 次/日、5 QPS。
- 彩云：V2.6 App Key + App Secret，按请求 HMAC-SHA256 签名。
- WeatherAPI 与 OpenWeather 仍按其各自套餐 / 权限使用。没有提供 API 凭据的源不能做实网验收。

## 音频 / 显示边界

P4 Mono UAC Direct v62 在目标机器启用 WASAPI Exclusive 时无声，关闭后普通输出立即恢复。用户已接受普通播放。本版本不修改 WASAPI native backend，不声称独占已修复或实机通过。Hosted CI 不能替代真实 P4 扬声器、显示器、COM3 Turing 验收。

