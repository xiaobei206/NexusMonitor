# NexusMonitor 2.2.6 — 构建与验收报告

**版本：** 2.2.6  
**基线：** NexusMonitor 2.2.5 Release  
**发布状态：** 已正式发布，GitHub Release v2.2.6；Windows CI Run #201 全部成功。

## 主要变更

- 新增 QWeather V1、WeatherCN 标准 API、Caiyun V2.6 三种天气源，保留 Open-Meteo、WeatherAPI、OpenWeather。
- QWeather 本机 Ed25519 / JWT 设置向导；私钥由 Electron safeStorage 加密。
- WeatherCN 使用 X-Gw-API-Key Header，Location Key 缓存 24 小时。
- Caiyun App Key + App Secret HMAC-SHA256 签名；中国 AQI 优先。
- WeatherSnapshot 新增 AQI 标准与来源声明；分类文字区分 China-MEP 与 US-EPA。主界面、悬浮窗、USB 天气卡与 Turing 天气时钟均按标准显示，Turing Canvas 同时显示来源名称。
- 竖向 HUD 首次默认高度从 2.2.5 的 1200px 降至 960px；保存每显示器手动调整高度，下次启动和方向切换恢复，范围 700–1200px。

## API 额度与隐私

- Open-Meteo 无需密钥。
- 华风爱科标准测试 Key 官方额度每日 500 次、5 QPS。按 15 分钟刷新、每轮 4 个请求估算约 384 次/日；手动连通测试会增加用量。
- QWeather 与 Caiyun 需要用户自己的账户凭据；代码不会自动申请账户或创建 Key。
- QWeather 私钥、Caiyun App Secret 和其他 API Keys 均由 safeStorage 加密。没有把 API 密钥 / Secret 暴露给 Renderer。
- 手动“测试连接”会强制绕过 12 分钟缓存；失败结果不接受旧缓存伪装成功。普通自动刷新仍使用缓存节流。
- 接入代码不代表真实账户权限或线上连通性已通过。

## 自动化验证

**Windows CI：** [Run #201 — success](https://github.com/xiaobei206/NexusMonitor/actions/runs/42378652196)，目标提交 `7ee687003ee151b4dd22ea41b5394c65091953d8`。

- 版本同步门禁：通过。
- Main TypeScript 构建及回归测试：通过。
- Renderer TypeScript 检查及 Vite 生产构建：通过。
- Native WASAPI 模块构建：通过（本版本未更改实现）。
- PawnIO MCHBAR 资源验证：通过。
- .NET 10 HardwareService 构建：通过。
- 硬件 / 存储回归：通过。
- Windows NSIS 安装包：构建成功。
- SHA-256 sidecar：生成成功。
- GitHub Release 发布及 workflow artifact 上传：成功。

正式 Release：[v2.2.6](https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.6)，发布日期 2026-11-07。安装包 `NexusMonitor-2.2.6-Setup.exe`（160,023,304 bytes）及 `NexusMonitor-2.2.6-Setup.exe.sha256` 均已挂载。Release tag 指向上述 CI 目标提交。

## 目标机验收清单

- [ ] 竖向 HUD 默认高度约 960px；用户拖到其他高度后，关闭并重新启动仍按同一显示器恢复。
- [ ] 不同显示器分别记住自己的 HUD 高度；高度始终受工作区约束。
- [ ] QWeather V1 公钥登记 / JWT / API Host / 实况与 AQI 请求。
- [ ] WeatherCN 标准 Key、实况、24 小时逐小时、10 日预报与 China-MEP AQI；监视每日调用量。
- [ ] Caiyun V2.6 App Key / Secret 签名成功，China AQI 显示正确。
- [ ] Open-Meteo / WeatherAPI / OpenWeather 原有选择仍可用。
- [ ] Turing / USB 五寸副屏 / 多显示器下天气源切换正常。
- [ ] P4 普通共享输出继续可听；本版本未修改 WASAPI Exclusive native path。

Hosted CI 不代表用户机器的真实屏幕、实体扬声器或天气账号验收。
