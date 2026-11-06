# Alder Lake Iris Xe GT 温度 — 2.0.4 当前构建要求

2.0.4 继续使用本文件描述的只读 MCHBAR GT 温度探测代码。与早期可选资源配置不同，`HardwareService/HardwareService.csproj` 现在将 `Resources\PawnIO\IntelMCHBAR.bin` 作为必需的 EmbeddedResource；缺失时 .NET 构建会直接失败，不允许生成一个悄悄不含 GT 温度模块的服务。

从 2.0.3 源码包恢复工程后，先在项目根目录执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1
```

脚本对官方 PawnIO.Modules 0.2.11 发布 ZIP 做 SHA-256 校验后才提取模块。当前 2.0.4 源码 ZIP 不包含该二进制，因为上传的 2.0.3 基线中没有该文件；不要自行创建空文件或用来源不明的 `.bin` 冒充。

运行脚本并成功生成 `HardwareService\Resources\PawnIO\IntelMCHBAR.bin` 后，再执行 `npm.cmd run test:storage` / `dotnet build`。服务启动后仍要看真实状态 `gpuTemperatureProbeStatus`；只有状态为 `available` 且 Iris Xe 温度有实际读数时，才能说温度已恢复。

---

# Alder Lake Iris Xe GT 温度攻关 — 历史技术记录

## 目标机器与现状

当前目标是 Intel Core i9-12900H + Intel Iris Xe（Alder Lake-H）。PawnIO 已安装并运行；LHM 0.9.6 已能读取 CPU 温度/频率/封装功耗，以及 Iris Xe 的负载、动态频率、电压、功耗和 Video Decode 负载，但没有枚举出 GPU Temperature 传感器。

2.0.1 不修改已验证正常的 CPU/GPU IGCL/LHM 路径。普通 LHM GPU 温度优先；只有 Intel GPU 没有可用温度时，才尝试本页的 MCHBAR 方案。

## 技术依据

- Intel 12th Gen 处理器资料定义 `THERM_STATUS_GT`，寄存器地址为 `MCHBAR + 0x59C0`。bit 31 是 VALID，bits 23:16 是距离 TjMax 的温差。
- TjMax 从 `IA32_TEMPERATURE_TARGET` MSR `0x1A2` 的 bits 23:16 读取。
- 官方 PawnIO.Modules `IntelMCHBAR` 模块的 CPUID 映射包含 family 6 model `0x97`（Alder Lake）和 `0x9A`（Alder Lake-L），并提供对 MCHBAR 的 `ioctl_read_dword` 读取接口。
- LHM 社区的 MCHBAR GPU 温度实现仍是开放 PR，并明确说明其温度寄存器路径只在 Meteor Lake 实机验证过。因此 2.0.1 将其视为 Alder Lake-H 的实验性只读探测，不声称已被 Intel/LHM 官方验证。

## 安全边界

探测仅对 GenuineIntel + CPUID family 6 model `0x97` / `0x9A` 开启。只读 `IA32_TEMPERATURE_TARGET` 和 `MCHBAR + 0x59C0`；不写 PCI 配置空间、不写 MCHBAR、不更改功耗限制/电压/风扇，也不安装或启动驱动。

输出必须同时满足：

1. PawnIO 已安装；
2. 官方签名 `IntelMCHBAR.bin` 模块已成功加载；
3. TjMax 在 70–125°C 的合理范围；
4. `THERM_STATUS_GT` bit 31 VALID 已置位；
5. `TjMax - delta` 在 0–125°C 范围内。

任一条件失败，GPU 温度保持 `null` / `—`，服务诊断字段 `gpuTemperatureProbeStatus` 记录失败原因。不会拿 CPU 温度代替 GPU 温度。

## 一次性准备模块

源码包不直接再分发 PawnIO 内核模块。请在 Windows 项目根目录运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1
```

脚本固定下载 PawnIO.Modules 官方 0.2.11 发布归档，并先校验整个 ZIP 的 SHA-256：

`43608cb89bc84247fef1368a139013f7d043e17db6d6c8dfc9b46bf0905a81f4`

校验成功后才提取 `IntelMCHBAR.bin` 到 `HardwareService\Resources\PawnIO\`，作为 HardwareService 嵌入资源。不会安装 PawnIO 驱动；目标电脑需已安装官方 PawnIO 驱动并以管理员权限运行硬件服务。

## Windows DEV 验证顺序

在解压后的 `NexusMonitor-2.0.4` 项目根目录，以管理员 PowerShell 执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\fetch-mchbar-module.ps1
npm.cmd run test:main
npm.cmd run build:renderer
npm.cmd run test:storage
npm.cmd run dev
```

开发版启动后另开 PowerShell 检查：

```powershell
$s = Invoke-RestMethod 'http://127.0.0.1:18765/api/snapshot'
$s.service | Format-List
$s.gpus | Format-List name,load,temperature,temperatureSource,clockMHz,powerW
$s.sensors | Where-Object { $_.id -eq 'gpu-intel/mchbar-gt/temperature' } | Format-List
```

预期状态：

- 成功：`gpuTemperatureProbeStatus : available`，Iris Xe `temperature` 是实测数值，`temperatureSource : MCHBAR GT`。
- 未成功：Iris Xe 温度继续为 `—`，但快照/API 不受影响；检查 `gpuTemperatureProbeStatus`，不要把 null 改成估算温度。

可能的状态包括 `unsupported-cpu`、`mchbar-module-missing`、`mchbar-module-not-loaded`、`invalid-tjmax`、`register-not-valid`、`invalid-temperature-delta`、`mchbar-read-failed`。

## 上游参考

- Intel 12th Gen Processor Datasheet：`THERM_STATUS_GT` / `MCHBAR + 0x59C0`。
- PawnIO.Modules 官方源码：`https://github.com/namazso/PawnIO.Modules/blob/main/IntelMCHBAR.p`
- PawnIO.Modules 官方 0.2.11 Release：`https://github.com/namazso/PawnIO.Modules/releases/tag/0.2.11`
- LHM 上游实验实现（开放 PR，Meteor Lake 实测）：`https://github.com/LibreHardwareMonitor/LibreHardwareMonitor/pull/2551`

本功能最初在 2.0.1 引入，2.0.4 继续使用的仍是实验性硬件读取路径，是否能在 i9-12900H + 当前 BIOS/主板上返回有效温度，必须以目标电脑的实测为准。
