namespace NexusMonitor.HardwareService.Models;

public sealed record SensorValue(string Hardware, string Name, double? Value, string Unit, string Kind, string? Id = null);
public sealed record FanSnapshot(string Hardware, string Name, double? Rpm);
public sealed record CoreSnapshot(string Name, double? Load, double? Temperature, double? ClockMHz);
public sealed record CpuSnapshot(string Name, double? Load, double? Temperature, double? ClockMHz, double? PowerW, IReadOnlyList<CoreSnapshot> Cores, string? ClockSource = null);
public sealed record GpuSnapshot(string Name, string HardwareType, double? Load, double? Temperature, double? ClockMHz, double? MemoryUsedMB, double? MemoryTotalMB, double? PowerW, string? TemperatureSource = null, string? ClockSensorName = null);
public sealed record MemorySnapshot(ulong TotalBytes, ulong UsedBytes, ulong AvailableBytes, double Percent, double? Temperature = null);
public sealed record NetworkSnapshot(string Id, string Name, string Description, string Type, string? Ipv4, string Mac, string Status, long RxBytes, long TxBytes, double RxBytesPerSec, double TxBytesPerSec, long? SpeedMbps, bool IsPhysical = false, bool HasGateway = false, bool IsDefaultRoute = false);
public sealed record DiskSnapshot(string Id, string Model, ulong? SizeBytes, string InterfaceType, string MediaType, bool IsOptane, double? Temperature, double? Load, double? ReadBytesPerSec, double? WriteBytesPerSec, IReadOnlyList<string>? Aliases = null, string? PnpDeviceId = null, string? SerialNumber = null, IReadOnlyList<string>? VolumeNames = null, bool DiskPerformanceAvailable = false);
public sealed record VolumeSnapshot(string Name, string Label, long TotalBytes, long AvailableBytes, long UsedBytes, double Percent, IReadOnlyList<string>? DiskIds = null);
public sealed record StorageStatus(bool WmiAvailable, string? LastError, DateTime? LastAttemptAt, int DiskCount, int VolumeCount, int StorageHardwareCount, bool DiskPerformanceAvailable = false, string? DiskPerformanceError = null, int DiskPerformanceInstanceCount = 0, int DiskPerformanceMatchedDiskCount = 0);
public sealed record ServiceInfo(string Status, string Version, bool Elevated, bool? PawnIoInstalled = null, bool? PawnIoRunning = null, string? GpuTemperatureProbeStatus = null);
public sealed record SystemSnapshot(DateTime Timestamp, long UptimeSeconds, CpuSnapshot Cpu, IReadOnlyList<GpuSnapshot> Gpus, MemorySnapshot Memory, IReadOnlyList<NetworkSnapshot> Networks, IReadOnlyList<DiskSnapshot> Disks, IReadOnlyList<VolumeSnapshot> Volumes, IReadOnlyList<FanSnapshot> Fans, IReadOnlyList<SensorValue> Sensors, ServiceInfo Service, StorageStatus? Storage = null);
public sealed record WeatherRequest(string Location, string Source, string? ApiKey, string? ApiSecret = null, string? ApiHost = null, bool ForceRefresh = false);
public sealed record WeatherHourSnapshot(DateTimeOffset Time, double? Temperature, int? PrecipitationProbability, int? WeatherCode);
public sealed record WeatherDaySnapshot(DateTimeOffset Date, double? MaxTemperature, double? MinTemperature, int? WeatherCode, int? PrecipitationProbability, double? WindSpeedMax);
public sealed record WeatherSnapshot(
    string Location,
    DateTimeOffset FetchedAt,
    double? Temperature,
    double? ApparentTemperature,
    double? Humidity,
    double? WindSpeed,
    double? WindDirection,
    double? Precipitation,
    int? WeatherCode,
    double? Aqi,
    double? Pm25,
    double? Pm10,
    double? Ozone,
    double? No2,
    string Source,
    double? TodayMaxTemperature = null,
    double? TodayMinTemperature = null,
    int? PrecipitationProbability = null,
    IReadOnlyList<WeatherHourSnapshot>? HourlyForecast = null,
    IReadOnlyList<WeatherDaySnapshot>? DailyForecast = null,
    DateTimeOffset? Sunrise = null,
    DateTimeOffset? Sunset = null,
    string? AqiStandard = null,
    string? AttributionUrl = null);
public sealed record TuringDevice(string Port, string Name, string PnpDeviceId, bool IsTuring, string? SerialNumber = null);
public sealed record TuringConnectRequest(string? Port, int? Orientation);
public sealed record TuringOrientationRequest(int Orientation);
public sealed record TuringBrightnessRequest(int Brightness);
public sealed record TuringScreenPowerRequest(bool On);
public sealed record TuringVisualVerificationRequest(bool Verified);
public sealed record TuringPatch(int X, int Y, int Width, int Height, string DataBase64);
public sealed record TuringPatchBatch(IReadOnlyList<TuringPatch> Patches);
public sealed record TuringStatus(bool Connected, string? Port, bool DeviceFound, string Message, int Orientation, int Brightness, string? Identity = null, string? SubRevision = null, string? HelloResponseHex = null, bool CommunicationInitialized = false, bool VisualVerified = false, int? BrightnessPercent = null, int? BrightnessWireValue = null, bool? ScreenOn = null, string? LastCommandHex = null);
