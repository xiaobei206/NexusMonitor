using System.Management;
using System.IO;
using System.Text.RegularExpressions;
using LibreHardwareMonitor.Hardware;
using Microsoft.Extensions.Logging;
using NexusMonitor.HardwareService.Models;

namespace NexusMonitor.HardwareService.Monitoring;

public sealed class StorageMonitor
{
    private sealed record DiskInfo(
        string Id,
        string LegacyIndex,
        string Model,
        ulong? SizeBytes,
        string InterfaceType,
        string MediaType,
        string? PnpDeviceId,
        string? SerialNumber,
        IReadOnlyList<string> Aliases);

    private static readonly Regex DeviceIdPattern = new(
        "DeviceID\\s*=\\s*\"([^\"]+)\"",
        RegexOptions.IgnoreCase | RegexOptions.Compiled);

    private readonly ILogger<StorageMonitor> _logger;
    private IReadOnlyList<DiskInfo> _diskCache = Array.Empty<DiskInfo>();
    private DateTime _diskCacheAt = DateTime.MinValue;
    private IReadOnlyList<VolumeSnapshot> _volumeCache = Array.Empty<VolumeSnapshot>();
    private DateTime _volumeCacheAt = DateTime.MinValue;
    private readonly object _gate = new();
    private bool _wmiAvailable;
    private string? _lastWmiError;
    private DateTime? _lastWmiAttemptAt;
    private int _storageHardwareCount;
    private int _diskPerformanceMatchedDiskCount;
    private DateTime _diskPerformanceCacheAt = DateTime.MinValue;
    private Dictionary<string, DiskPerformance> _diskPerformanceByIndex = new(StringComparer.OrdinalIgnoreCase);
    private bool _diskPerformanceAvailable;
    private string? _diskPerformanceError;
    private DateTime _lastDiskPerformanceLogAt = DateTime.MinValue;
    private sealed record DiskPerformance(double ReadBytesPerSec, double WriteBytesPerSec, double LoadPercent);
    private string? _lastErrorSignature;
    private DateTime _lastErrorLogAt = DateTime.MinValue;

    public StorageMonitor(ILogger<StorageMonitor> logger)
    {
        _logger = logger;
    }

    public StorageStatus GetStatus()
    {
        lock (_gate)
        {
            return new StorageStatus(
                _wmiAvailable,
                _lastWmiError,
                _lastWmiAttemptAt,
                _diskCache.Count,
                _volumeCache.Count,
                _storageHardwareCount,
                _diskPerformanceAvailable,
                _diskPerformanceError,
                _diskPerformanceByIndex.Count,
                _diskPerformanceMatchedDiskCount);
        }
    }

    public (IReadOnlyList<DiskSnapshot> Disks, IReadOnlyList<VolumeSnapshot> Volumes) Read(IEnumerable<IHardware> hardware)
    {
        lock (_gate)
        {
            var now = DateTime.UtcNow;
            if (now - _diskCacheAt > TimeSpan.FromSeconds(15)) RefreshDiskCache(now);
            if (now - _volumeCacheAt > TimeSpan.FromSeconds(5)) RefreshVolumeCache(now);
            if (now - _diskPerformanceCacheAt > TimeSpan.FromSeconds(1)) RefreshDiskPerformanceCache(now);

            var storageSensors = hardware.Where(h => h.HardwareType == HardwareType.Storage).SelectMany(Flatten).ToArray();
            _storageHardwareCount = storageSensors.Length;
            var volumeNamesByDisk = BuildVolumeNamesByDisk();
            _diskPerformanceMatchedDiskCount = 0;

            var found = new List<DiskSnapshot>(_diskCache.Count);
            foreach (var disk in _diskCache)
            {
                var matching = storageSensors.FirstOrDefault(h =>
                    h.Name.Contains(disk.Model, StringComparison.OrdinalIgnoreCase) ||
                    disk.Model.Contains(h.Name, StringComparison.OrdinalIgnoreCase));
                ISensor[] sensors = matching?.Sensors ?? Array.Empty<ISensor>();
                double? Pick(SensorType type, string? token = null)
                {
                    var sensor = sensors.Where(x => x.SensorType == type && FiniteSensorValue.FromFloat(x.Value).HasValue &&
                            (token is null || x.Name.Contains(token, StringComparison.OrdinalIgnoreCase)))
                        .OrderByDescending(x => x.Value).FirstOrDefault();
                    return sensor is null ? null : FiniteSensorValue.FromFloat(sensor.Value);
                }

                var realTemperature = StorageClassifier.SelectRealTemperature(
                    sensors.Where(sensor => sensor.SensorType == SensorType.Temperature)
                        .Select(sensor => (sensor.Name, FiniteSensorValue.FromFloat(sensor.Value))));

                var isOptane = StorageClassifier.IsOptane(disk.Model, disk.PnpDeviceId, disk.SizeBytes);
                var volumeNames = volumeNamesByDisk.TryGetValue(disk.Id, out var names)
                    ? names
                    : Array.Empty<string>();
                var hasDiskPerformance = _diskPerformanceByIndex.TryGetValue(disk.LegacyIndex, out var performance);
                if (hasDiskPerformance) _diskPerformanceMatchedDiskCount++;
                found.Add(new DiskSnapshot(
                    disk.Id,
                    disk.Model,
                    disk.SizeBytes,
                    disk.InterfaceType,
                    disk.MediaType,
                    isOptane,
                    realTemperature,
                    performance?.LoadPercent ?? Pick(SensorType.Load),
                    performance?.ReadBytesPerSec ?? Pick(SensorType.Throughput, "read"),
                    performance?.WriteBytesPerSec ?? Pick(SensorType.Throughput, "write"),
                    disk.Aliases,
                    disk.PnpDeviceId,
                    disk.SerialNumber,
                    volumeNames,
                    hasDiskPerformance));
            }

            return (found, _volumeCache);
        }
    }


    /// <summary>
    /// Uses Windows' PhysicalDisk performance provider for throughput and busy time.
    /// These values do not depend on whether an SSD/HDD exposes a vendor sensor through LHM.
    /// Instances are keyed by the leading Win32_DiskDrive Index token (for example "0 C:").
    /// </summary>
    private void RefreshDiskPerformanceCache(DateTime now)
    {
        var next = new Dictionary<string, DiskPerformance>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Name, DiskReadBytesPersec, DiskWriteBytesPersec, PercentDiskTime FROM Win32_PerfFormattedData_PerfDisk_PhysicalDisk");
            using var rows = searcher.Get();
            foreach (ManagementObject row in rows)
            {
                try
                {
                    var instance = Convert.ToString(row["Name"])?.Trim();
                    if (string.IsNullOrWhiteSpace(instance) || instance.Equals("_Total", StringComparison.OrdinalIgnoreCase)) continue;
                    var diskIndex = StorageClassifier.PerformanceInstanceDiskIndex(instance);
                    if (diskIndex is null) continue;
                    static double ReadNumber(object? value)
                    {
                        try
                        {
                            if (value is null) return 0d;
                            var number = Convert.ToDouble(value, System.Globalization.CultureInfo.InvariantCulture);
                            return double.IsFinite(number) ? Math.Max(0d, number) : 0d;
                        }
                        catch { return 0d; }
                    }
                    next[diskIndex] = new DiskPerformance(
                        ReadNumber(row["DiskReadBytesPersec"]),
                        ReadNumber(row["DiskWriteBytesPersec"]),
                        Math.Clamp(ReadNumber(row["PercentDiskTime"]), 0d, 100d));
                }
                finally
                {
                    row.Dispose();
                }
            }

            _diskPerformanceByIndex = next;
            _diskPerformanceAvailable = next.Count > 0;
            _diskPerformanceError = next.Count > 0 ? null : "Windows PhysicalDisk 性能实例暂未返回；将保留可用硬件传感器数据";
        }
        catch (Exception exception)
        {
            // Do not keep stale throughput values after the provider has failed.
            _diskPerformanceByIndex = new Dictionary<string, DiskPerformance>(StringComparer.OrdinalIgnoreCase);
            _diskPerformanceAvailable = false;
            _diskPerformanceError = $"Windows 磁盘性能计数器不可用：{exception.GetType().Name} {exception.Message}";
            if (now - _lastDiskPerformanceLogAt > TimeSpan.FromMinutes(5))
            {
                _lastDiskPerformanceLogAt = now;
                _logger.LogWarning(exception, "Windows PhysicalDisk performance provider unavailable; LHM fallback remains active");
            }
        }

        _diskPerformanceCacheAt = now;
    }

    private void RefreshDiskCache(DateTime now)
    {
        var found = new List<DiskInfo>();
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Index, Model, Size, InterfaceType, MediaType, SerialNumber, PNPDeviceID FROM Win32_DiskDrive");
            using var result = searcher.Get();
            foreach (ManagementObject disk in result)
            {
                try
                {
                    var index = Convert.ToString(disk["Index"]) ?? Guid.NewGuid().ToString("N");
                    ulong? size = null;
                    try
                    {
                        if (disk["Size"] is not null) size = Convert.ToUInt64(disk["Size"]);
                    }
                    catch
                    {
                        size = null;
                    }

                    // Empty card-reader slots and disconnected USB media report no
                    // usable capacity. They are not physical disks for this UI.
                    if (!StorageClassifier.HasUsableSize(size)) continue;

                    var model = Convert.ToString(disk["Model"])?.Trim() ?? $"Physical disk {index}";
                    var serial = Convert.ToString(disk["SerialNumber"])?.Trim();
                    var pnp = Convert.ToString(disk["PNPDeviceID"])?.Trim();
                    var id = StorageClassifier.BuildStableId(serial, pnp, index);
                    if (!seen.Add(id)) continue;

                    found.Add(new DiskInfo(
                        id,
                        index,
                        model,
                        size,
                        Convert.ToString(disk["InterfaceType"]) ?? "",
                        Convert.ToString(disk["MediaType"]) ?? "",
                        string.IsNullOrWhiteSpace(pnp) ? null : pnp,
                        string.IsNullOrWhiteSpace(serial) ? null : serial,
                        StorageClassifier.BuildAliases(index, model, serial, pnp)));
                }
                finally
                {
                    disk.Dispose();
                }
            }

            _wmiAvailable = true;
            _lastWmiAttemptAt = now;
            _lastWmiError = null;
            _lastErrorSignature = null;
            _diskCache = found;
        }
        catch (Exception exception)
        {
            var accessDenied = StorageClassifier.IsAccessDenied(exception);
            var message = accessDenied
                ? "Win32_DiskDrive 访问被拒绝，请检查服务运行账户的 WMI 权限"
                : "Win32_DiskDrive 枚举失败，物理磁盘数据保留上次成功结果";
            RecordWmiError("Win32_DiskDrive", message, exception, now);
        }

        _diskCacheAt = now;
    }

    private void RefreshVolumeCache(DateTime now)
    {
        var diskByVolume = ReadVolumeDiskMap(now);
        var volumes = new List<VolumeSnapshot>();

        foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady && d.DriveType == DriveType.Fixed))
        {
            try
            {
                var total = drive.TotalSize;
                var free = drive.AvailableFreeSpace;
                var used = total - free;
                var associationKey = drive.Name.TrimEnd('\\');
                var diskIds = diskByVolume.TryGetValue(associationKey, out var ids)
                    ? ids
                    : Array.Empty<string>();
                volumes.Add(new VolumeSnapshot(drive.Name, drive.VolumeLabel, total, free, used,
                    total == 0 ? 0 : Math.Round(used * 100d / total, 1), diskIds));
            }
            catch (Exception exception)
            {
                _logger.LogWarning(exception, "读取卷 {Volume} 的基础信息失败", drive.Name);
            }
        }

        _volumeCache = volumes;
        _volumeCacheAt = now;
    }

    private IReadOnlyDictionary<string, IReadOnlyList<string>> ReadVolumeDiskMap(DateTime now)
    {
        var resultMap = new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var diskIndexByPartition = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
            using (var partitionSearcher = new ManagementObjectSearcher(
                       "SELECT DeviceID, DiskIndex FROM Win32_DiskPartition"))
            using (var partitions = partitionSearcher.Get())
            {
                foreach (ManagementObject partition in partitions)
                {
                    try
                    {
                        var deviceId = Convert.ToString(partition["DeviceID"]);
                        var diskIndex = Convert.ToInt32(partition["DiskIndex"]);
                        if (!string.IsNullOrWhiteSpace(deviceId)) diskIndexByPartition[deviceId] = diskIndex;
                    }
                    finally
                    {
                        partition.Dispose();
                    }
                }
            }

            var stableIdByIndex = _diskCache
                .Where(disk => !string.IsNullOrWhiteSpace(disk.LegacyIndex))
                .ToDictionary(disk => disk.LegacyIndex, disk => disk.Id, StringComparer.OrdinalIgnoreCase);

            var disksByVolume = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
            using (var associationSearcher = new ManagementObjectSearcher(
                       "SELECT Antecedent, Dependent FROM Win32_LogicalDiskToPartition"))
            using (var associations = associationSearcher.Get())
            {
                foreach (ManagementObject association in associations)
                {
                    try
                    {
                        var partitionPath = Convert.ToString(association["Antecedent"]);
                        var volumePath = Convert.ToString(association["Dependent"]);
                        var partitionId = ExtractDeviceId(partitionPath);
                        var volumeId = ExtractDeviceId(volumePath);
                        if (string.IsNullOrWhiteSpace(partitionId) ||
                            string.IsNullOrWhiteSpace(volumeId) ||
                            !diskIndexByPartition.TryGetValue(partitionId, out var diskIndex))
                        {
                            continue;
                        }

                        if (!stableIdByIndex.TryGetValue(diskIndex.ToString(), out var stableId)) continue;
                        if (!disksByVolume.TryGetValue(volumeId, out var ids))
                        {
                            ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                            disksByVolume[volumeId] = ids;
                        }
                        ids.Add(stableId);
                    }
                    finally
                    {
                        association.Dispose();
                    }
                }
            }

            foreach (var (volume, ids) in disksByVolume)
                resultMap[volume] = ids.ToArray();
        }
        catch (Exception exception)
        {
            // Association failure is non-fatal: DiskSnapshot and VolumeSnapshot
            // base information must still be returned.
            var accessDenied = StorageClassifier.IsAccessDenied(exception);
            var message = accessDenied
                ? "Win32_LogicalDiskToPartition 访问被拒绝，卷与磁盘关联不可用"
                : "Win32_LogicalDiskToPartition 查询失败，卷与磁盘关联不可用";
            RecordWmiError("Win32_LogicalDiskToPartition", message, exception, now);
        }

        return resultMap;
    }

    private Dictionary<string, IReadOnlyList<string>> BuildVolumeNamesByDisk()
    {
        var result = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
        foreach (var volume in _volumeCache)
        {
            if (volume.DiskIds is null) continue;
            foreach (var diskId in volume.DiskIds)
            {
                if (!result.TryGetValue(diskId, out var names))
                {
                    names = new List<string>();
                    result[diskId] = names;
                }
                names.Add(volume.Name);
            }
        }

        return result.ToDictionary(
            pair => pair.Key,
            pair => (IReadOnlyList<string>)pair.Value,
            StringComparer.OrdinalIgnoreCase);
    }

    private void RecordWmiError(string operation, string message, Exception exception, DateTime now)
    {
        _lastWmiError = $"{message}：{exception.GetType().Name} (0x{exception.HResult:X8}) {exception.Message}";
        _lastWmiAttemptAt = now;
        if (operation == "Win32_DiskDrive") _wmiAvailable = false;

        var signature = $"{operation}|{exception.GetType().FullName}|0x{exception.HResult:X8}|{exception.Message}";
        if (string.Equals(signature, _lastErrorSignature, StringComparison.Ordinal) &&
            now - _lastErrorLogAt < TimeSpan.FromMinutes(5))
        {
            return;
        }

        _lastErrorSignature = signature;
        _lastErrorLogAt = now;
        _logger.LogWarning(exception, "{StorageWmiFailure}", _lastWmiError);
    }

    private static string? ExtractDeviceId(string? managementPath)
    {
        if (string.IsNullOrWhiteSpace(managementPath)) return null;
        var match = DeviceIdPattern.Match(managementPath);
        return match.Success ? match.Groups[1].Value : null;
    }

    private static IEnumerable<IHardware> Flatten(IHardware hardware)
    {
        yield return hardware;
        foreach (var child in hardware.SubHardware)
            foreach (var nested in Flatten(child)) yield return nested;
    }
}
