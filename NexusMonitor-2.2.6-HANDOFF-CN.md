# NexusMonitor 2.2.6 — 天气 Provider 扩展与 HUD 高度记忆交接

**当前版本：** 2.2.6  
**基线：** 2.2.6 正式 Release（已发布）  
**主线：** main  
**CI：** Windows Run #201 全部成功  
**正式发布：** https://github.com/xiaobei206/NexusMonitor/releases/tag/v2.2.6  
**发布提交：** `7ee687003ee151b4dd22ea41b5394c65091953d8`  
**下一正式行为版本：** 2.2.7。

## 用户目标

1. 2.2.5 的竖向 HUD 默认 1200px 太长，希望高度合适，不需要每次重新拖动。
2. 增加华风爱科、和风新版、彩云等备用天气源，尽量利用服务商标准 / 免费测试额度。
3. 保留免密默认天气源，不要求用户为使用应用先注册商业天气账户。

## 天气源适配

| Provider | 认证 / 说明 | 内容 |
|---|---|---|
| Open-Meteo | 无 Key | 实况、小时、逐日、US AQI |
| QWeather V1 | 本机 Ed25519 私钥签发 JWT；Developer ID、Project ID、Credential ID、API Host | 当前、240 小时逐时、7 日逐日、AQI |
| WeatherCN / 华风爱科 | 标准 API Key 走 X-Gw-API-Key Header；Location Key 缓存 24h | 实况、24 小时逐时、10 日逐日、中国国标 AQI |
| Caiyun V2.6 | App Key + App Secret；每请求 HMAC-SHA256 签名 | 综合接口：实况、小时、逐日、AQI |
| WeatherAPI | 既有 Key / 套餐 | 保留原适配 |
| OpenWeather | 既有 Key / One Call 3.0 权限 | 保留原适配 |

核心代码：
- HardwareService/Monitoring/WeatherService.cs
- HardwareService/Models.cs
- HardwareService/Program.cs
- src/main/index.ts
- src/preload/index.ts
- src/renderer/vite-env.d.ts
- src/shared/types.ts
- src/renderer/App.tsx
- src/renderer/aqi.ts

### QWeather V1 安全流程

1. 设置页点击“本机生成 Ed25519 密钥”，私钥保存于 Electron safeStorage。
2. 只复制公钥至 QWeather 控制台 JWT 凭据，不上传私钥。
3. 回填 Developer ID、Project ID、Credential ID 与账号分配的 *.qweatherapi.com API Host。
4. 主进程签发 / 缓存 EdDSA JWT；请求走 Bearer 认证。
5. getPublicSettings() 必须继续剔除 qweatherPrivateKeyEncrypted、weatherApiKeysEncrypted、weatherApiSecretsEncrypted。

### WeatherCN 与额度

- 必须通过 Header X-Gw-API-Key 传 Key，不将凭据写入 URL。
- Location Key 按地点缓存 24h；标准 Key 每日 500 次、5 QPS。
- 15 分钟刷新一次时，四个 API 请求理论约 384 次/日。额外手动测试会增加用量；不得假设可以无限刷新。
- 当前使用标准 24hour 小时预报；120 / 240 / 360 小时需要额外开通进阶能力，不要假设测试 Key 可调用。

### Caiyun V2.6

- 使用 GCJ-02 转换后的苏州 / 吴江坐标。
- 路径 /v2.6/{app_key}/{longitude},{latitude}/weather。
- 签名字符串为 GET:{path}:{sortedQuery}:{appKey}:{nonce}:{timestamp}；HMAC-SHA256 输出 Base64URL。
- 请求头：x-cy-nonce、x-cy-timestamp、x-cy-signature。
- App Secret 只在主进程使用，并由 safeStorage 加密保存。
- 中国区域优先 result.realtime.air_quality.aqi.chn；无该值时才回退 usa。

### AQI 标准

- WeatherSnapshot.aqiStandard 区分 China-MEP 与 US-EPA；主界面、两种 HUD 和 Turing 3.5 寸天气时钟都必须保留对应 CN AQI / US AQI 标识与分类文字。Turing Canvas 显示数据来源名称；QWeather attribution URL 同时保留在展开天气卡片。
- 不允许将中国国标 AQI 标为 US AQI，也不允许用同一分类文字混合两种标准。
- QWeather 按返回的 cn-mee / us-epa 索引优先匹配中国标准。
- 华风爱科固定标注 China-MEP；Open-Meteo 固定标注 US-EPA；彩云优先 China-MEP。

## HUD 高度

- 新安装竖向 HUD 默认 340×960 逻辑像素。
- 手动调整后，主进程以 350ms debounce 保存每显示器 x/y/width/height/dockEdge 到 widgetDisplayPositions。
- 启动时按显示器恢复；切换回竖向时也恢复保存高度。
- 记忆高度范围 700–1200px；最终窗口仍裁剪到显示器 work area。
- 代码：src/main/index.ts、src/main/widget-docking.ts。
- 回归：tests/widget-docking.test.cjs、tests/ui-readability.test.cjs。

## P4 / WASAPI

沿用 2.2.5 验收边界：P4 Mono UAC Direct v62 在目标机 WASAPI Exclusive 开启后无声，关闭后普通播放立即恢复。本版本不修改 native backend，不声称 Exclusive 已修复或设备已被证明全面不支持独占。

## 手动测试与缓存

- 天气“测试连接”设置 ForceRefresh，绕过 WeatherService 的 12 分钟缓存；强制请求失败时不能返回旧缓存作为连接成功。
- 普通自动刷新仍使用 12 分钟服务缓存与约 15 分钟应用刷新节奏；不得因 UI 重绘重复请求 WeatherCN。

## 发布 / 验收边界

- 版本元数据统一 2.2.6；发布入口 NexusMonitor-2.2.6-BUILD-RELEASE.cjs。
- Windows CI Run #201 已全绿，证明 Hosted Windows 编译、自动化回归与 NSIS 安装包生成成功；没有用户真实 Key 时，仍不能声称新 Provider 账户权限和实时请求已在目标机验收。
- 用户目标机需要测试 HUD 高度记忆、多显示器独立记忆、QWeather V1 控制台登记 / JWT、WeatherCN 免费 Key 日用量、Caiyun 签名连接、AQI 分类，以及 USB 5 寸屏 / COM3 Turing。
- 下一正式行为版本从 2.2.7 开始。

