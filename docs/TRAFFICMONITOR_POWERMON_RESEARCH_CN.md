# TrafficMonitor HardwareMonitor / PowerMon 参考实现与 NexusMonitor 移植记录

**日期：** 2026-11-02  
**目标源码：** NexusMonitor 2.0.0-next（TrafficMonitor + PowerMon follow-up）

## 上游项目核查结论

本次对照了以下项目：

- TrafficMonitor 主项目：<https://github.com/zhongyang219/TrafficMonitor>
- TrafficMonitorPlugins：<https://github.com/zhongyang219/TrafficMonitorPlugins>
- HardwareMonitor V1.00：<https://github.com/zhongyang219/TrafficMonitorPlugins/releases/tag/HardwareMonitor_V1.00>
- PowerMonPlugin：<https://github.com/AzulEterno/PowerMonPlugin-For-TrafficMonitor>
- 插件列表：<https://github.com/zhongyang219/TrafficMonitorPlugins/blob/main/download/plugin_download.md#硬件监控插件>

HardwareMonitor 和 PowerMon 都不是独立的硬件访问驱动，也没有绕开 LibreHardwareMonitor 的秘密 API。两者都采用 LHM 传感器模型；PowerMon 发布包要求把匹配版本的 `LibreHardwareMonitorLib.dll` 与插件一起使用，避免依赖版本不兼容。NexusMonitor 已引用 LHM 0.9.6，因此本次不复制另一份 LHM DLL，也不把第三方 TrafficMonitor DLL 直接装进本项目。

HardwareMonitor 的可借鉴点是完整枚举 LHM 的传感器类型，并按“硬件路径 + 传感器类型 + 名称”建立较稳定的项目标识；无值项目保留并显示 `--`。其可枚举类型包括电压、电流、功率、时钟、温度、负载、风扇、流量、控制、等级、数据、吞吐、时间、能量、噪声、电导率和湿度等。

PowerMon 的可借鉴点是把电池、CPU、GPU、平台功率分别作为可选显示项目，并根据硬件支持程度显示；智能功耗摘要在电池放电时优先展示负数的电池放电功率，接入外部电源时展示 CPU/GPU 功率汇总。电池充电功率、电量、电压、电流、容量和剩余时间是独立的电池指标；平台功率也单独列示，不能冒充 CPU/GPU 子系统合计或墙上插座功率。它并不能令不支持或未暴露的 CPU/GPU 功率传感器凭空出现。

## 本次移植到 NexusMonitor 的内容

### 硬件采集

- LHM 初始化时开启 `IsBatteryEnabled`、`IsPowerMonitorEnabled`、`IsPsuEnabled` 和 `IsNetworkEnabled`，并保留已有 CPU/GPU/主板/存储/控制器硬件组。是否实际出现电池、平台电源或 PSU 项目仍取决于设备与驱动支持。
- 传感器清单包含有枚举但值为 null 的项目；空值继续序列化为 null，前端显示 `—`，不将其伪装成 0。
- 为每条传感器生成稳定 ID：父级硬件 Identifier 路径 + SensorType + 传感器名称。设置可保存用户收藏的传感器 ID，重新启动后继续尝试匹配。
- 增加/保留电压、电流、功率、频率、风扇、流量、吞吐、时间、能量、噪声、电导率和湿度等类型的单位显示。
- 电池的 `Discharge Rate` / `Discharge Current` 在展示层按负值表示放电；原始采集值不被写回或修改。
- CPU Package 功耗只采信正值 Package Power；不会把 CPU Cores 子项冒充整颗 CPU Package。GPU 功耗只选择有效正值 Power 类传感器，零值保持不可用。

### CPU 动态频率

- 删除 `CallNtPowerInformation(...).CurrentMhz` 作为实时频率回退的旧路径，因为目标机器实测它长期固定为 2500 MHz。
- 优先显示 LHM 的有效 per-core Clock 平均值，并排除 Effective Clock。
- LHM Clock 为空时，可使用 Windows Processor Information 性能计数器的 `ProcessorFrequency × PercentProcessorPerformance / 100` 对活跃逻辑处理器进行估算。UI 通过 `~` 和悬浮提示明确标识为估算值，而非直接硬件时钟。若估算输入不可用，则显示 `—`。
- 此估算不是精密的逐核 Turbo 频率仪表；应以 PawnIO 正常工作后 LHM 实际 Clock 传感器为优先。

### GPU 选择

- 温度优先 GPU Core，其次 GPU Temperature，再退回第一个有效温度。
- 功耗优先 GPU Power、GPU Package、Total、GPU Core，最后才选其它有效 Power 类传感器；不接受 0 W 作为有效功耗。
- Iris Xe 的 IGCL 温度传感器是否出现，仍取决于该驱动和硬件的实际遥测支持；不能承诺每台 Intel 核显都有 GPU 功耗。

### HUD 和天气

- 竖向悬浮栏从 184 px 加宽到 268 px；字体、主要数值、标签、辅助文字、时间和天气信息一起放大。窗口最小宽度与 CSS 固定栏宽度一致，避免用户缩到栏内容之外。
- 竖向 HUD 默认尺寸为 268 × 780（按显示器工作区自动收缩），展开面板最大宽度 1080 px；仍需目标 Windows 显示器实机观察。
- 悬浮栏新增天气图标、气温、天气描述、AQI 和湿度；展开卡片显示体感温度、风速、降水概率、PM2.5/PM10、臭氧、NO₂、今日高低温和未来小时预报。
- 主界面天气卡片扩为两列，并放大温度、天气图标和空气质量数据。
- 设置中增加独立的悬浮窗模块开关：CPU、GPU、内存、磁盘、网络、天气、自选传感器。主界面总览显示项目与 HUD 开关互不影响。
- “硬件与网络 → 全部硬件传感器”中可勾选任意传感器加入展开 HUD；空值也可以收藏，读数恢复后会自动显示。
- 增加 PowerMon 风格智能功耗摘要：电池放电时优先显示放电功率；非放电状态下只合计正值 CPU Package + GPU 读数。电池充电功率、电量、电压、电流、剩余容量和剩余时间作为独立字段；平台 Power Monitor/PSU 功率独立显示，不与 CPU/GPU 合计混淆。没有实际读数时显示 —。

## 已知限制与验证要求

- 目标电脑最近一次诊断显示 PawnIO 未安装；CPU 温度和逐核 Clock 传感器存在但数值均为 null，CPU Power 为 0 W；Iris Xe 有 300 MHz Clock 和约 0.262 V Voltage，但没有温度传感器，GPU Power 为 0 W。这个状态不能靠 UI 修复。
- 本源码只报告 PawnIO 安装/运行状态，不自动下载、安装或启动内核驱动。若用户决定安装，必须使用官方签名版本并先核对来源。
- 本次容器没有 .NET SDK，不能声称完成 C# 编译或 C# HardwareService 测试。用户 Windows 开发环境具备 .NET SDK 10.0.403，需在新源码解压目录重新执行 `npm.cmd ci`、`npm.cmd run test:main`、`npm.cmd run build:renderer`、`npm.cmd run test:storage`，再以 `npm.cmd run dev` 验证。此阶段不制作 Release/安装包。
- 本环境对现有 Node 测试套件运行结果为 52/52 通过；`tsconfig.test-utils.json` 编译通过，13 个 TS/TSX/MTS 实现文件语法转译检查通过。由于当前容器未安装完整 npm 依赖，不能把语法转译检查称为完整 Renderer 类型检查或 Vite 生产构建。
- Windows 实机仍需确认：PawnIO 安装状态改变后的 CPU 温度/Clock/Package Power；Iris Xe IGCL 温度；电池/平台电源/PSU 设备组是否有传感器；Dell U3415DW 上竖向 HUD 的字号与展开面板；天气实时字段；设置开关保存与恢复。

## 参考链接

- <https://github.com/zhongyang219/TrafficMonitorPlugins>
- <https://github.com/zhongyang219/TrafficMonitorPlugins/releases/tag/HardwareMonitor_V1.00>
- <https://github.com/zhongyang219/TrafficMonitorPlugins/blob/main/download/plugin_download.md#硬件监控插件>
- <https://github.com/AzulEterno/PowerMonPlugin-For-TrafficMonitor>
- <https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/releases>
- <https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/discussions/2149>
