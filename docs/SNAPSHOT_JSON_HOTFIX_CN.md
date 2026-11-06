# /api/snapshot JSON 序列化故障修复记录

日期：2026-11-02

## 现场现象

Windows DEV 模式下 Electron 与 .NET HardwareService 都已启动，`127.0.0.1:18765/api/health` 返回 `ok: true`，但主界面始终显示硬件服务启动中。`main.log` 重复记录 `/api/snapshot` 在 `HardwareService/Program.cs` 的 `Results.Ok(hw.Snapshot(...))` 序列化阶段抛出：

```text
System.ArgumentException: .NET number values such as positive and negative infinity cannot be written as valid JSON.
```

这表明快照对象中至少有一个 `double` / `double?` 值是 `NaN`、`PositiveInfinity` 或 `NegativeInfinity`。服务自身没有退出，故 `/api/health` 正常，但快照轮询持续失败。

## 源码原因

- 原 `HardwareMonitor.Value(ISensor?)` 仅判断 `sensor.Value` 是否为非 null，并将任意 `float` 转成 `double`，没有排除 NaN/Infinity。
- 传感器清单会完整包含 LHM 传感器，坏读数因此可能进入 `SensorValue.Value`；CPU/GPU/Core/Fan 等派生字段也调用同一读数方法。
- `StorageMonitor` 的 LHM 传感器和 Windows PhysicalDisk WMI 性能值有类似风险。
- `WeatherService` 的数值 JSON 解析也增加有限值检查，避免超范围数据渗入快照。

## 修复内容

1. `HardwareMonitor.Value()` 只接受有限 `float`；遇到 NaN/Infinity 时返回 null，并对每个硬件标识/传感器类型/传感器名称组合记录一次 Warning，便于从 `main.log` 找到源头。
2. CPU/GPU/Core/Fan/原始清单/内存温度全部复用有限值读取方法，坏读数不会参与聚合。
3. `StorageMonitor` 忽略非有限 LHM 读数；WMI 数值转换发现非有限数时返回 0（这些性能计数器的有效域为非负值）。
4. `WeatherService` 当前和小时数组只接受有限数值。
5. 新增 `FiniteDoubleJsonConverter` 作为 API 最后一道保护：有限 double 正常输出，NaN/Infinity 输出 JSON null；不使用 `AllowNamedFloatingPointLiterals`，也不伪造 0。
6. 新增 4 项 LHM float 过滤测试，并新增 5 项 JSON 序列化回归测试：NaN、正无穷、负无穷、有效数字、已有 null。

## Windows 验证步骤

先停止仍运行的 DEV（在原启动 PowerShell 按 Ctrl+C）。将本修复 ZIP 中的项目文件覆盖到相同项目根目录，然后在管理员 PowerShell 项目根目录运行：

```powershell
dotnet clean .\tests\HardwareService.Tests\HardwareService.Tests.csproj -c Debug
npm.cmd run test:storage
```

测试通过后再启动：

```powershell
npm.cmd run dev
```

新开 PowerShell 验证：

```powershell
$s = Invoke-RestMethod "http://127.0.0.1:18765/api/snapshot"
$s.service | Format-List
$s.cpu | Format-List
$s.gpus | Format-Table -AutoSize
```

预期：`/api/snapshot` 能正常返回完整 JSON；缺失/非有限传感器以 null 表示，前端继续渲染其他可用监控数据。若 LHM 返回 NaN/Infinity，`main.log` 会出现 `Ignoring non-finite LHM sensor value`，包含硬件、传感器名、类型和原始值（每个传感器仅一次）。

注意：这个修复解决快照 JSON 失败，不会让本来没有硬件读数的 CPU 温度/功耗或 GPU 温度/功耗凭空出现；PawnIO/IGCL 的硬件可用性仍需独立验证。

## 当前验证边界

本修复由当前工作容器生成，但此环境无 .NET SDK，尚未运行 C# 编译或 `test:storage`。必须以目标 Windows 环境的真实测试结果为准。仍然是 2.0.0-next 开发源码，不是 Release。
