using LibreHardwareMonitor.Hardware;
using NexusMonitor.HardwareService.Models;
using Microsoft.Extensions.Logging;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Management;
using Microsoft.Win32;

namespace NexusMonitor.HardwareService.Monitoring;

public sealed class HardwareMonitor : IDisposable
{
    private readonly Computer _computer;
    private readonly ILogger<HardwareMonitor> _logger;
    private readonly object _gate = new();
    private bool _opened;
    private DateTime _pawnIoCheckAt = DateTime.MinValue;
    private bool? _pawnIoInstalled;
    private bool? _pawnIoRunning;
    private DateTime _cpuClockCacheAt = DateTime.MinValue;
    private double? _cpuClockEstimateCache;
    private readonly HashSet<string> _nonFiniteSensorWarnings = new(StringComparer.Ordinal);
    private AlderLakeGtTemperatureProbe? _alderLakeGtTemperatureProbe;

    public HardwareMonitor(ILogger<HardwareMonitor> logger)
    {
        _logger = logger;
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsStorageEnabled = true,
            IsNetworkEnabled = true,
            IsControllerEnabled = true,
            // TrafficMonitor HardwareMonitor / PowerMon also enumerate battery,
            // platform power-monitor and supported PSU hardware groups. These
            // expose optional Battery, Energy, Current and Power sensors when
            // the machine/vendor hardware supports them.
            IsBatteryEnabled = true,
            IsPowerMonitorEnabled = true,
            IsPsuEnabled = true
        };
        try { _computer.Open(); _opened = true; }
        catch (Exception exception)
        {
            _opened = false;
            _logger.LogError(exception, "LibreHardwareMonitor failed to open hardware providers. Sensor values will be unavailable until the service is restarted with compatible permissions.");
        }
    }

    public SystemSnapshot Snapshot(NetworkMonitor network, StorageMonitor storage)
    {
        lock (_gate)
        {
            if (_opened)
            {
                foreach (var hardware in _computer.Hardware) UpdateRecursive(hardware);
            }
            var cpuHw = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.Cpu);
            ISensor[] cpuSensors = cpuHw is null ? Array.Empty<ISensor>() : Flatten(cpuHw).SelectMany(h => h.Sensors).ToArray();
            var cpuLoad = Find(cpuSensors, SensorType.Load, "total") ?? Find(cpuSensors, SensorType.Load, "cpu");
            var cpuLoadValue = Value(cpuLoad) ?? Average(cpuSensors, SensorType.Load, "core");
            var cpuTempValue = CpuSensorSelector.SelectTemperature(cpuSensors
                .Where(sensor => sensor.SensorType == SensorType.Temperature)
                .Select(sensor => (sensor.Name, Value(sensor))));
            // Prefer real LHM per-core Clock sensors. When the provider exposes the
            // sensors but leaves their values null, use a clearly-labelled estimate
            // from Windows Processor Information rather than stale CurrentMhz.
            var lhmCpuClock = CpuSensorSelector.SelectClock(cpuSensors
                .Where(sensor => sensor.SensorType == SensorType.Clock)
                .Select(sensor => (sensor.Name, Value(sensor))));
            var windowsCpuClock = lhmCpuClock is null ? ReadWindowsCpuClockEstimate(DateTime.UtcNow) : null;
            var cpuClockValue = lhmCpuClock ?? windowsCpuClock;
            var cpuClockSource = lhmCpuClock.HasValue ? "LibreHardwareMonitor"
                : windowsCpuClock.HasValue ? "WindowsPerformanceEstimate" : null;
            // Do not let a zero/uninitialized package-power sensor block a valid alternative.
            var cpuPowerValue = CpuSensorSelector.SelectPower(cpuSensors
                .Where(sensor => sensor.SensorType == SensorType.Power)
                .Select(sensor => (sensor.Name, Value(sensor))));
            var cores = cpuSensors.Where(s => Value(s).HasValue && s.Name.Contains("Core", StringComparison.OrdinalIgnoreCase) && s.SensorType is SensorType.Load or SensorType.Temperature or SensorType.Clock)
                .GroupBy(s => CoreKey(s.Name)).Where(g => !string.IsNullOrWhiteSpace(g.Key)).Select(g => new CoreSnapshot(
                    g.Key,
                    Value(g.FirstOrDefault(s => s.SensorType == SensorType.Load)),
                    Value(g.FirstOrDefault(s => s.SensorType == SensorType.Temperature)),
                    Value(g.FirstOrDefault(s => s.SensorType == SensorType.Clock)))).ToArray();
            var cpu = new CpuSnapshot(cpuHw?.Name ?? "Unknown CPU", cpuLoadValue, cpuTempValue, cpuClockValue, cpuPowerValue, cores, cpuClockSource);

            // Keep the provider's original GPU order for the main dashboard. The Turing
            // display selects the Intel integrated GPU explicitly via HardwareType.
            // When IGCL/LHM does not expose an Intel GPU temperature, attempt a separate
            // Alder Lake-only, read-only MCHBAR GT thermal register probe.
            double? alderLakeGtTemperature = null;
            var gtProbeStatus = "not-needed";
            var intelGpuHardware = _computer.Hardware.FirstOrDefault(h => h.HardwareType == HardwareType.GpuIntel);
            if (intelGpuHardware is not null)
            {
                var intelGpuSensors = Flatten(intelGpuHardware).SelectMany(x => x.Sensors).ToArray();
                var igclTemperature = GpuSensorSelector.SelectTemperature(intelGpuSensors
                    .Where(sensor => sensor.SensorType == SensorType.Temperature)
                    .Select(sensor => (sensor.Name, Value(sensor))));
                if (igclTemperature.HasValue)
                {
                    gtProbeStatus = "not-needed-lhm-temperature-available";
                }
                else
                {
                    _alderLakeGtTemperatureProbe ??= new AlderLakeGtTemperatureProbe(_logger);
                    if (_alderLakeGtTemperatureProbe.TryReadTemperature(out var gtTemperature))
                        alderLakeGtTemperature = gtTemperature;
                    gtProbeStatus = _alderLakeGtTemperatureProbe.Status;
                }
            }

            var gpus = _computer.Hardware.Where(h => h.HardwareType is HardwareType.GpuNvidia or HardwareType.GpuAmd or HardwareType.GpuIntel)
                .Select(h =>
                {
                    var sensors = Flatten(h).SelectMany(x => x.Sensors).ToArray();
                    double? MemoryMb(string token)
                    {
                        var small = Find(sensors, SensorType.SmallData, token);
                        if (small is not null) return Value(small);
                        var data = Find(sensors, SensorType.Data, token);
                        return Value(data) is double gb ? gb * 1024d : null;
                    }
                    var gpuPowerValue = GpuSensorSelector.SelectPower(sensors
                        .Where(sensor => sensor.SensorType == SensorType.Power)
                        .Select(sensor => (sensor.Name, Value(sensor))));
                    var lhmTemperature = GpuSensorSelector.SelectTemperature(sensors
                        .Where(sensor => sensor.SensorType == SensorType.Temperature)
                        .Select(sensor => (sensor.Name, Value(sensor))));
                    var useMchbarTemperature = h.HardwareType == HardwareType.GpuIntel
                        && !lhmTemperature.HasValue && alderLakeGtTemperature.HasValue;
                    var temperature = lhmTemperature ?? (useMchbarTemperature ? alderLakeGtTemperature : null);
                    var temperatureSource = lhmTemperature.HasValue ? "LibreHardwareMonitor"
                        : useMchbarTemperature ? "MCHBAR GT" : null;
                    var gpuClock = GpuSensorSelector.SelectClock(sensors
                        .Where(sensor => sensor.SensorType == SensorType.Clock)
                        .Select(sensor => (sensor.Name, Value(sensor))));
                    return new GpuSnapshot(h.Name, h.HardwareType.ToString(),
                        Value(Find(sensors, SensorType.Load, "core") ?? Find(sensors, SensorType.Load, "d3d") ?? Max(sensors, SensorType.Load)),
                        temperature,
                        gpuClock.Value,
                        MemoryMb("memory used"),
                        MemoryMb("memory total"),
                        gpuPowerValue,
                        temperatureSource,
                        gpuClock.SensorName);
                }).ToArray();

            var allHardware = _computer.Hardware.SelectMany(Flatten).ToArray();
            // Include enumerated sensors even when their current value is null. This
            // separates 'sensor not exposed' from 'sensor exists but unavailable now'
            // in the diagnostics UI, without inventing zero values.
            var sensorInventory = allHardware.SelectMany(h => h.Sensors
                .Select(sensor => new NexusMonitor.HardwareService.Models.SensorValue(
                    h.Name, sensor.Name, DisplayValue(sensor), Unit(sensor.SensorType), sensor.SensorType.ToString(), SensorId(sensor))))
                .ToList();
            if (intelGpuHardware is not null && gtProbeStatus != "not-needed-lhm-temperature-available")
            {
                // Keep a stable diagnostic row even when the optional MCHBAR module is
                // absent or the register is invalid. A null remains unavailable, never 0°C.
                sensorInventory.Add(new NexusMonitor.HardwareService.Models.SensorValue(
                    intelGpuHardware.Name,
                    "GPU Core Temperature (MCHBAR GT)",
                    alderLakeGtTemperature,
                    "°C",
                    SensorType.Temperature.ToString(),
                    "gpu-intel/mchbar-gt/temperature"));
            }
            var sensors = sensorInventory.ToArray();
            var fans = allHardware.SelectMany(h => h.Sensors
                .Where(sensor => sensor.SensorType == SensorType.Fan)
                .Select(sensor => new FanSnapshot(h.Name, sensor.Name, Value(sensor))))
                .ToArray();
            var memorySensors = _computer.Hardware
                .Where(hardware => hardware.HardwareType == HardwareType.Memory)
                .SelectMany(Flatten)
                .SelectMany(hardware => hardware.Sensors)
                .Where(sensor => sensor.SensorType == SensorType.Temperature)
                .Select(sensor => (sensor.Name, Value(sensor)));
            var memoryTemperature = StorageClassifier.SelectRealTemperature(memorySensors);
            var memory = ReadMemory(memoryTemperature);
            var networks = network.Read();
            var (disks, volumes) = storage.Read(_computer.Hardware);
            var identity = WindowsIdentity.GetCurrent();
            var elevated = new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
            RefreshPawnIoStatus(DateTime.UtcNow);
            return new SystemSnapshot(DateTime.Now, Environment.TickCount64 / 1000, cpu, gpus, memory, networks, disks, volumes, fans, sensors,
                new ServiceInfo(_opened ? "online" : "degraded", "2.1.8", elevated, _pawnIoInstalled, _pawnIoRunning, gtProbeStatus), storage.GetStatus());
        }
    }


    // LHM itself identifies PawnIO installation from its HKLM Uninstall\PawnIO
    // registry entry. Its driver service can be demand-started, so report install
    // state separately from the current Win32_SystemDriver state. This is read-only:
    // never install or start a kernel driver implicitly.
    private void RefreshPawnIoStatus(DateTime now)
    {
        if (now - _pawnIoCheckAt < TimeSpan.FromSeconds(30)) return;
        try
        {
            _pawnIoInstalled = QueryPawnIoInstalled();
            if (_pawnIoInstalled != true)
            {
                _pawnIoRunning = _pawnIoInstalled == false ? false : null;
            }
            else
            {
                using var searcher = new ManagementObjectSearcher(
                    "SELECT Name, State, Started FROM Win32_SystemDriver WHERE Name = 'PawnIO'");
                using var drivers = searcher.Get();
                using var driver = drivers.Cast<ManagementObject>().FirstOrDefault();
                if (driver is null)
                {
                    _pawnIoRunning = false;
                }
                else
                {
                    var state = Convert.ToString(driver["State"]);
                    var started = driver["Started"] is bool isStarted && isStarted;
                    _pawnIoRunning = started || string.Equals(state, "Running", StringComparison.OrdinalIgnoreCase);
                }
            }
        }
        catch (Exception exception)
        {
            _pawnIoInstalled = null;
            _pawnIoRunning = null;
            _logger.LogDebug(exception, "Unable to query PawnIO driver status; low-level sensor availability remains unknown");
        }
        _pawnIoCheckAt = now;
    }

    private static bool? QueryPawnIoInstalled()
    {
        var registryQueried = false;
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
                using var key = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\PawnIO");
                registryQueried = true;
                if (Version.TryParse(key?.GetValue("DisplayVersion") as string, out _)) return true;
            }
            catch
            {
                // Try the other registry view before reporting an unknown state.
            }
        }
        return registryQueried ? false : null;
    }

    private static void UpdateRecursive(IHardware hardware)
    {
        try { hardware.Update(); } catch { }
        foreach (var child in hardware.SubHardware) UpdateRecursive(child);
    }
    private static IEnumerable<IHardware> Flatten(IHardware hardware)
    {
        yield return hardware;
        foreach (var child in hardware.SubHardware)
            foreach (var nested in Flatten(child)) yield return nested;
    }
    private ISensor? Find(ISensor[] sensors, SensorType type, string token) =>
        sensors.FirstOrDefault(s => s.SensorType == type && Value(s).HasValue && s.Name.Contains(token, StringComparison.OrdinalIgnoreCase));

    private ISensor? Max(ISensor[] sensors, SensorType type) =>
        sensors.Where(s => s.SensorType == type && Value(s).HasValue)
            .OrderByDescending(s => Value(s))
            .FirstOrDefault();

    private double? Average(ISensor[] sensors, SensorType type, string token)
    {
        var values = sensors.Where(s => s.SensorType == type && s.Name.Contains(token, StringComparison.OrdinalIgnoreCase))
            .Select(Value)
            .Where(value => value.HasValue)
            .Select(value => value!.Value)
            .ToArray();
        return values.Length == 0 ? null : values.Average();
    }

    private double? Value(ISensor? sensor)
    {
        if (sensor is null) return null;
        var finiteValue = FiniteSensorValue.FromFloat(sensor.Value);
        if (finiteValue.HasValue) return finiteValue;
        if (sensor.Value is not float reading) return null;

        // A few hardware providers return NaN/Infinity instead of null for
        // unsupported/transient sensors. Log each offending sensor once and
        // omit its reading so one bad value cannot poison derived metrics.
        var key = $"{sensor.Hardware.Identifier}/{sensor.SensorType}/{sensor.Name}";
        if (_nonFiniteSensorWarnings.Add(key))
            _logger.LogWarning("Ignoring non-finite LHM sensor value from {Hardware}/{Sensor} ({SensorType}): {Reading}",
                sensor.Hardware.Name, sensor.Name, sensor.SensorType, reading);
        return null;
    }

    private double? DisplayValue(ISensor sensor)
    {
        var value = Value(sensor);
        if (!value.HasValue) return null;
        // Match PowerMon's battery convention: discharge is negative, charging is positive.
        if (sensor.Hardware.HardwareType == HardwareType.Battery
            && sensor.SensorType == SensorType.Power
            && sensor.Name.Equals("Discharge Rate", StringComparison.OrdinalIgnoreCase))
            return -Math.Abs(value.Value);
        if (sensor.Hardware.HardwareType == HardwareType.Battery
            && sensor.SensorType == SensorType.Current
            && sensor.Name.Equals("Discharge Current", StringComparison.OrdinalIgnoreCase))
            return -Math.Abs(value.Value);
        return value;
    }
    private double? ReadWindowsCpuClockEstimate(DateTime now)
    {
        if (now - _cpuClockCacheAt < TimeSpan.FromMilliseconds(750)) return _cpuClockEstimateCache;
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Name, ProcessorFrequency, PercentProcessorPerformance, PercentProcessorTime FROM Win32_PerfFormattedData_Counters_ProcessorInformation");
            using var collection = searcher.Get();
            var samples = collection.Cast<ManagementObject>().Select(item => new ProcessorPerformanceSample(
                Convert.ToString(item["Name"]) ?? string.Empty,
                TryDouble(item["ProcessorFrequency"]),
                TryDouble(item["PercentProcessorPerformance"]),
                TryDouble(item["PercentProcessorTime"]))).ToArray();
            _cpuClockEstimateCache = WindowsCpuClockEstimator.EstimateAverageMHz(samples);
        }
        catch (Exception exception)
        {
            _cpuClockEstimateCache = null;
            _logger.LogDebug(exception, "Windows Processor Information clock estimate is unavailable");
        }
        _cpuClockCacheAt = now;
        return _cpuClockEstimateCache;
    }

    private static double? TryDouble(object? value)
    {
        try
        {
            if (value is null) return null;
            var number = Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
            return double.IsFinite(number) ? number : null;
        }
        catch { return null; }
    }

    // Match TrafficMonitor's stable sensor-key strategy: full hardware identifier
    // ancestry + sensor type + name. LHM's sensor Identifier can change between runs.
    private static string SensorId(ISensor sensor)
    {
        var hardwarePath = new List<string>();
        for (var hardware = sensor.Hardware; hardware is not null; hardware = hardware.Parent)
            hardwarePath.Add(hardware.Identifier.ToString());
        hardwarePath.Reverse();
        hardwarePath.Add(sensor.SensorType.ToString());
        hardwarePath.Add(sensor.Name);
        return string.Join("/", hardwarePath);
    }

    private static string Unit(SensorType type) => type switch
    {
        SensorType.Temperature => "°C", SensorType.Clock => "MHz", SensorType.Load or SensorType.Control or SensorType.Level or SensorType.Humidity => "%",
        SensorType.Power => "W", SensorType.Voltage => "V", SensorType.Current => "A", SensorType.Fan => "RPM",
        SensorType.Throughput => "B/s", SensorType.SmallData => "MB", SensorType.Data => "GB", SensorType.Frequency => "Hz",
        SensorType.TimeSpan => "s", SensorType.Timing => "ns", SensorType.Energy => "mWh", SensorType.Noise => "dBA", SensorType.Flow => "L/h", SensorType.Factor => "×", SensorType.Conductivity => "µS/cm", _ => ""
    };
    private static string CoreKey(string name)
    {
        var index = name.IndexOf("Core", StringComparison.OrdinalIgnoreCase);
        return index < 0 ? "" : name[index..].Split([' ', '(', ')', '-'], StringSplitOptions.RemoveEmptyEntries).Take(2).Aggregate((a,b)=>$"{a} {b}");
    }
    private static MemorySnapshot ReadMemory(double? temperature)
    {
        var status = new MemoryStatusEx(); status.Length = (uint)Marshal.SizeOf<MemoryStatusEx>();
        if (!GlobalMemoryStatusEx(ref status)) return new MemorySnapshot(0,0,0,0,temperature);
        var used = status.TotalPhys - status.AvailPhys;
        return new MemorySnapshot(status.TotalPhys, used, status.AvailPhys, status.TotalPhys == 0 ? 0 : Math.Round(used * 100d / status.TotalPhys, 1), temperature);
    }
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
    private struct MemoryStatusEx
    {
        public uint Length; public uint MemoryLoad; public ulong TotalPhys; public ulong AvailPhys; public ulong TotalPageFile; public ulong AvailPageFile; public ulong TotalVirtual; public ulong AvailVirtual; public ulong AvailExtendedVirtual;
    }
    [DllImport("kernel32.dll", SetLastError = true)] private static extern bool GlobalMemoryStatusEx(ref MemoryStatusEx buffer);
    public void Dispose() { try { _alderLakeGtTemperatureProbe?.Dispose(); } catch { } try { if (_opened) _computer.Close(); } catch { } }
}
