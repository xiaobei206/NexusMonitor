using System.Text.Json;
using System.IO.Ports;
using System.Reflection;
using Microsoft.Extensions.Logging.Abstractions;
using NexusMonitor.HardwareService.Display;
using NexusMonitor.HardwareService.Monitoring;
using NexusMonitor.HardwareService.Serialization;

if (args.Contains("--hold-com3", StringComparer.OrdinalIgnoreCase))
{
    using var heldPort = new SerialPort("COM3", 115200, Parity.None, 8, StopBits.One)
    {
        Handshake = Handshake.None,
        DtrEnable = true,
    };
    heldPort.Open();
    Console.WriteLine("HOLDING_COM3");
    Thread.Sleep(60_000);
    return;
}

var failures = 0;

void Check(bool condition, string name)
{
    if (condition)
    {
        Console.WriteLine($"PASS {name}");
        return;
    }

    failures++;
    Console.WriteLine($"FAIL {name}");
}

void CheckEqual<T>(T expected, T actual, string name)
{
    Check(EqualityComparer<T>.Default.Equals(expected, actual), $"{name} (expected={expected}, actual={actual})");
}

Check(AlderLakeGtTemperatureParser.IsSupportedModel(6, 0x97), "Alder Lake-S/P model 0x97 is eligible for GT temperature probe");
Check(AlderLakeGtTemperatureParser.IsSupportedModel(6, 0x9A), "Alder Lake-L model 0x9A is eligible for GT temperature probe");
Check(!AlderLakeGtTemperatureParser.IsSupportedModel(6, 0xAC), "Meteor Lake model is not enabled by the Alder Lake-only probe");
Check(!AlderLakeGtTemperatureParser.IsSupportedModel(6, 0x9E), "Kaby Lake model is not enabled by the Alder Lake-only probe");
Check(AlderLakeGtTemperatureParser.TryDecode(0x80000000u | (35u << 16), 100, out var gtTemperature, out _), "valid THERM_STATUS_GT register is accepted");
CheckEqual(65d, gtTemperature, "GT temperature is calculated as TjMax minus thermal delta");
Check(!AlderLakeGtTemperatureParser.TryDecode(35u << 16, 100, out _, out var invalidBitStatus) && invalidBitStatus == "register-not-valid", "GT temperature requires the register VALID bit");
Check(!AlderLakeGtTemperatureParser.TryDecode(0x80000000u | (35u << 16), 0, out _, out var invalidTjMaxStatus) && invalidTjMaxStatus == "invalid-tjmax", "GT temperature rejects an unavailable TjMax");
Check(!AlderLakeGtTemperatureParser.TryDecode(0x80000000u | (200u << 16), 100, out _, out var invalidDeltaStatus) && invalidDeltaStatus == "invalid-temperature-delta", "GT temperature rejects a delta larger than TjMax");

Check(FiniteSensorValue.FromFloat(float.NaN) is null, "LHM NaN sensor reading is treated as unavailable");
Check(FiniteSensorValue.FromFloat(float.PositiveInfinity) is null, "LHM positive infinity sensor reading is treated as unavailable");
Check(FiniteSensorValue.FromFloat(float.NegativeInfinity) is null, "LHM negative infinity sensor reading is treated as unavailable");
CheckEqual(24.5d, FiniteSensorValue.FromFloat(24.5f) ?? -1d, "finite LHM sensor reading remains numeric");

// A transient NaN/Infinity sensor value must not make the complete hardware
// snapshot fail JSON serialization. Nullable readings become JSON null; valid
// readings remain numeric rather than being converted to strings or fake zeroes.
var finiteJsonOptions = new JsonSerializerOptions();
finiteJsonOptions.Converters.Add(new FiniteDoubleJsonConverter());
var finiteJson = JsonSerializer.Serialize(new
{
    nan = double.NaN,
    positiveInfinity = (double?)double.PositiveInfinity,
    negativeInfinity = (double?)double.NegativeInfinity,
    valid = (double?)23.5,
    unavailable = (double?)null,
}, finiteJsonOptions);
Check(finiteJson.Contains("\"nan\":null", StringComparison.Ordinal), "non-finite required double serializes as JSON null");
Check(finiteJson.Contains("\"positiveInfinity\":null", StringComparison.Ordinal), "positive infinity nullable reading serializes as JSON null");
Check(finiteJson.Contains("\"negativeInfinity\":null", StringComparison.Ordinal), "negative infinity nullable reading serializes as JSON null");
Check(finiteJson.Contains("\"valid\":23.5", StringComparison.Ordinal), "finite nullable reading remains numeric JSON");
Check(finiteJson.Contains("\"unavailable\":null", StringComparison.Ordinal), "existing null reading remains JSON null");

var cpuTemperature = CpuSensorSelector.SelectTemperature(new[]
{
    ("CPU Package", (double?)71),
    ("Core Max", (double?)83),
    ("Core Average", (double?)64),
});
CheckEqual(64d, cpuTemperature ?? -1d, "CPU temperature prefers Core Average like Turing LHM adapter");
CheckEqual(83d, CpuSensorSelector.SelectTemperature(new[]
{
    ("CPU Package", (double?)71), ("Core Max", (double?)83),
}) ?? -1d, "CPU temperature falls back to Core Max before package");
CheckEqual(2_000d, CpuSensorSelector.SelectClock(new[]
{
    ("Core #1 Clock", (double?)1_900),
    ("Core #2 Clock", (double?)2_100),
    ("Core #1 Effective Clock", (double?)900),
}) ?? -1d, "CPU clock averages real core clocks and excludes Effective Clock");
CheckEqual(1_700d, CpuSensorSelector.SelectClock(new[]
{
    ("Average Effective Clock", (double?)3_900), ("Core Clock", (double?)1_700),
}) ?? -1d, "CPU clock fallback ignores Effective Clock");
Check(CpuSensorSelector.SelectPower(new[]
{
    ("CPU Package", (double?)0), ("CPU Cores", (double?)34), ("CPU Platform", (double?)0),
}) is null, "zero CPU Package power remains unavailable instead of misreporting CPU Cores as package power");
CheckEqual(52d, CpuSensorSelector.SelectPower(new[]
{
    ("CPU Package", (double?)52), ("CPU Cores", (double?)34),
}) ?? -1d, "CPU power uses a positive CPU Package reading");

CheckEqual(55d, GpuSensorSelector.SelectTemperature(new[]
{
    ("GPU Hot Spot", (double?)68), ("GPU Core", (double?)55),
}) ?? -1d, "GPU temperature prefers GPU Core like TrafficMonitor");
CheckEqual(61d, GpuSensorSelector.SelectTemperature(new[]
{
    ("GPU Board", (double?)61),
}) ?? -1d, "GPU temperature falls back to the first real temperature sensor");
Check(GpuSensorSelector.SelectTemperature(new[]
{
    ("GPU Core", (double?)null),
}) is null, "GPU temperature does not invent a value for a null sensor");
var gpuClock = GpuSensorSelector.SelectClock(new[]
{
    ("GPU Core", (double?)300), ("GPU Graphics Clock", (double?)1050),
    ("GPU Core Effective Clock", (double?)1_300),
    ("GPU Memory", (double?)6_000), ("Bus Speed", (double?)100),
});
CheckEqual(1_050d, gpuClock.Value ?? -1d, "GPU clock chooses the highest live core/graphics clock, not the first idle sensor");
CheckEqual("GPU Graphics Clock", gpuClock.SensorName ?? string.Empty, "GPU clock selection exposes its actual LHM source sensor");
Check(GpuSensorSelector.SelectClock(new[]
{
    ("GPU Memory", (double?)6_000), ("Bus Speed", (double?)100), ("GPU Effective Clock", (double?)0),
}).Value is null, "GPU clock ignores memory, bus and zero effective-clock fallbacks");

CheckEqual(18d, GpuSensorSelector.SelectPower(new[]
{
    ("GPU Power", (double?)0), ("GPU Core", (double?)18), ("Total", (double?)21),
}) ?? -1d, "GPU power prefers named GPU Core over generic Total when GPU Power is an unavailable zero");
CheckEqual(52d, GpuSensorSelector.SelectPower(new[]
{
    ("GPU Package", (double?)52), ("GPU Core", (double?)18), ("Total", (double?)21),
}) ?? -1d, "GPU Package remains higher priority than GPU Core and generic Total");
Check(GpuSensorSelector.SelectPower(new[]
{
    ("GPU Power", (double?)0), ("GPU Core", (double?)0),
}) is null, "GPU power remains unavailable when all power sensors are zero");

var estimatedClock = WindowsCpuClockEstimator.EstimateAverageMHz(new[]
{
    new ProcessorPerformanceSample("0,0", 2500, 100, 25),
    new ProcessorPerformanceSample("0,1", 2500, 140, 35),
    new ProcessorPerformanceSample("0,2", 2500, 80, 0.2),
    new ProcessorPerformanceSample("0,_Total", 2500, 120),
    new ProcessorPerformanceSample("_Total", 2500, 120),
});
CheckEqual(3_000d, estimatedClock ?? -1d, "Windows CPU clock estimate averages active logical processors and ignores idle/aggregate rows");
Check(WindowsCpuClockEstimator.EstimateAverageMHz(new[]
{
    new ProcessorPerformanceSample("0,0", 2500, 0, 0),
    new ProcessorPerformanceSample("0,_Total", 2500, 150, 100),
}) is null, "Windows CPU clock estimate rejects zero/aggregate-only samples");
Check(WindowsCpuClockEstimator.EstimateAverageMHz(new[]
{
    new ProcessorPerformanceSample("0,0", null, 140),
    new ProcessorPerformanceSample("0,1", 2500, null),
}) is null, "Windows CPU clock estimate requires both base frequency and performance percentage");

Check(!StorageClassifier.HasUsableSize(null), "null capacity is rejected");
Check(!StorageClassifier.HasUsableSize(0), "zero capacity is rejected");
Check(StorageClassifier.HasUsableSize(1), "positive capacity is accepted");
CheckEqual("0", StorageClassifier.PerformanceInstanceDiskIndex("0 C: D:"), "PhysicalDisk instance maps its leading disk index");
CheckEqual("12", StorageClassifier.PerformanceInstanceDiskIndex("12"), "PhysicalDisk instance supports multi-digit index");
Check(StorageClassifier.PerformanceInstanceDiskIndex("_Total") is null, "aggregate PhysicalDisk instance is ignored");
Check(StorageClassifier.PerformanceInstanceDiskIndex(null) is null, "empty PhysicalDisk instance is ignored");
CheckEqual(44d, StorageClassifier.SelectRealTemperature(new[]
{
    ("Composite Temperature", (double?)44),
    ("Temperature #1", (double?)43.85),
    ("Warning Temperature", (double?)82),
    ("Critical Temperature", (double?)89),
}) ?? -1d, "disk temperature prefers live Composite Temperature over limits");
CheckEqual(43.85d, StorageClassifier.SelectRealTemperature(new[]
{
    ("Temperature #1", (double?)43.85),
    ("Temperature #2", (double?)41.85),
    ("Warning Temperature", (double?)82),
}) ?? -1d, "disk temperature fallback chooses a real temperature sensor");
Check(StorageClassifier.SelectRealTemperature(new[]
{
    ("Warning Temperature", (double?)82),
    ("Critical Temperature", (double?)89),
}) is null, "temperature limits alone are not reported as live temperature");

Check(StorageClassifier.IsOptane("INTEL MEMPEK1J016GAL", null, 14_402_465_280), "MEMPEK is Optane");
Check(StorageClassifier.IsOptane("Intel Optane Memory", null, 16_000_000_000), "Optane model name is Optane");
Check(StorageClassifier.IsOptane("Some Intel SSD", null, 16_000_000_000), "Intel 16GB fallback is Optane");
Check(!StorageClassifier.IsOptane("Generic MassStorageClass USB Device", null, 16_000_000_000), "generic 16GB USB is not Optane");
Check(!StorageClassifier.IsOptane("YMTC PC300-1TB-B", null, 1_024_203_640_320), "1TB SSD is not Optane");

var first = StorageClassifier.BuildStableId("SERIAL-1", "PNP-1", "0");
var second = StorageClassifier.BuildStableId("SERIAL-1", "PNP-1", "9");
var different = StorageClassifier.BuildStableId("SERIAL-2", "PNP-1", "9");
CheckEqual(first, second, "stable id prefers serial and ignores index");
Check(first != different, "stable id changes with serial");
Check(first.StartsWith("disk:", StringComparison.Ordinal), "stable id has disk prefix");

var indexOnly = StorageClassifier.BuildStableId(null, null, "3");
Check(indexOnly.StartsWith("disk:", StringComparison.Ordinal), "index fallback produces a stable id");
CheckEqual(indexOnly, StorageClassifier.BuildStableId(null, null, "3"), "index fallback is deterministic");

var aliases = StorageClassifier.BuildAliases("0", "YMTC PC300-1TB-B", "SERIAL-1.", "SCSI\\DISK");
Check(aliases.Contains("0"), "alias keeps legacy index");
Check(aliases.Contains("YMTC PC300-1TB-B"), "alias keeps model");
Check(aliases.Contains("SERIAL-1"), "alias keeps trimmed serial");
Check(aliases.Contains("SCSI\\DISK"), "alias keeps PNP id");

Check(StorageClassifier.IsAccessDenied(new UnauthorizedAccessException()), "UnauthorizedAccessException is access denied");
Check(!StorageClassifier.IsAccessDenied(new InvalidOperationException("other")), "other exceptions are not access denied");

var recordError = typeof(StorageMonitor).GetMethod("RecordWmiError", BindingFlags.Instance | BindingFlags.NonPublic)
    ?? throw new InvalidOperationException("RecordWmiError method was not found");
var deniedMonitor = new StorageMonitor(NullLogger<StorageMonitor>.Instance);
recordError.Invoke(deniedMonitor, new object[]
{
    "Win32_DiskDrive",
    "Win32_DiskDrive 访问被拒绝，请检查服务运行账户的 WMI 权限",
    new UnauthorizedAccessException("denied"),
    DateTime.UtcNow,
});
var deniedStatus = deniedMonitor.GetStatus();
Check(!deniedStatus.WmiAvailable, "WMI failure marks storage unavailable");
Check(deniedStatus.LastError?.Contains("访问被拒绝", StringComparison.Ordinal) == true, "access-denied status keeps an explicit message");

var otherMonitor = new StorageMonitor(NullLogger<StorageMonitor>.Instance);
recordError.Invoke(otherMonitor, new object[]
{
    "Win32_DiskDrive",
    "Win32_DiskDrive 枚举失败，物理磁盘数据保留上次成功结果",
    new InvalidOperationException("other"),
    DateTime.UtcNow,
});
var otherStatus = otherMonitor.GetStatus();
Check(otherStatus.LastError?.Contains("枚举失败", StringComparison.Ordinal) == true, "non-access WMI error keeps a distinct message");

var pnp = @"USB\VID_1A86&PID_5722\USB35INCHIPSV2";
CheckEqual("USB35INCHIPSV2", TuringProtocol.ExtractSerial(pnp), "PnP instance id yields the serial id");
Check(TuringProtocol.LooksLikeTuring(pnp, "USB35INCHIPSV2"), "VID/PID plus official serial is a Turing device");
Check(TuringProtocol.HasOfficialIdentity(pnp, "USB35INCHIPSV2"), "official identity requires VID/PID and serial");
Check(!TuringProtocol.HasOfficialIdentity(@"USB\VID_1A86&PID_5722\OTHER", "OTHER"), "VID/PID without official serial is not the official identity");
Check(!TuringProtocol.LooksLikeTuring("", null), "unrelated COM device is not a Turing device");

CheckEqual(TuringHelloKind.NoResponse, TuringProtocol.ClassifyHello(Array.Empty<byte>()), "zero-byte HELLO is no-response");
CheckEqual(TuringHelloKind.UsbMonitor35, TuringProtocol.ClassifyHello(new byte[] { 1, 1, 1, 1, 1, 1 }), "01x6 is UsbMonitor 3.5");
CheckEqual(TuringHelloKind.UsbMonitor5, TuringProtocol.ClassifyHello(new byte[] { 2, 2, 2, 2, 2, 2 }), "02x6 is UsbMonitor 5");
CheckEqual(TuringHelloKind.UsbMonitor7, TuringProtocol.ClassifyHello(new byte[] { 3, 3, 3, 3, 3, 3 }), "03x6 is UsbMonitor 7");
CheckEqual(TuringHelloKind.Unexpected, TuringProtocol.ClassifyHello(new byte[] { 1, 1, 1, 1, 1 }), "1-5 byte response is unexpected");
CheckEqual(TuringHelloKind.Unexpected, TuringProtocol.ClassifyHello(new byte[] { 1, 1, 1, 1, 1, 2 }), "mixed response is unexpected");
CheckEqual("TURING_3_5", TuringProtocol.SubRevision(TuringHelloKind.NoResponse), "no-response defaults to Turing 3.5 only after identity");
CheckEqual("USBMONITOR_3_5", TuringProtocol.SubRevision(TuringHelloKind.UsbMonitor35), "UsbMonitor 3.5 sub-revision");
CheckEqual("official-turing-3.5", TuringProtocol.IdentityLabel(TuringHelloKind.NoResponse), "no-response identity label is official Turing 3.5");
CheckEqual("usbmonitor-3.5", TuringProtocol.IdentityLabel(TuringHelloKind.UsbMonitor35), "UsbMonitor 3.5 identity label");

CheckEqual(229, TuringProtocol.BrightnessToWire(10), "10 percent maps to wire 229");
CheckEqual(204, TuringProtocol.BrightnessToWire(20), "20 percent maps to wire 204");
CheckEqual(178, TuringProtocol.BrightnessToWire(30), "30 percent maps to wire 178");
CheckEqual(127, TuringProtocol.BrightnessToWire(50), "50 percent maps to wire 127");
CheckEqual(63, TuringProtocol.BrightnessToWire(75), "75 percent maps to wire 63");
CheckEqual(0, TuringProtocol.BrightnessToWire(100), "100 percent maps to wire 0");
CheckEqual(255, TuringProtocol.BrightnessToWire(0), "0 percent maps to wire 255");
CheckEqual("39400000006E", TuringProtocol.BrightnessCommandHex(10), "10 percent brightness command hex (packed x)");
CheckEqual("33000000006E", TuringProtocol.BrightnessCommandHex(20), "20 percent brightness command hex (packed x)");
CheckEqual("2C800000006E", TuringProtocol.BrightnessCommandHex(30), "30 percent brightness command hex (packed x)");
CheckEqual("1FC00000006E", TuringProtocol.BrightnessCommandHex(50), "50 percent brightness command hex (packed x)");
CheckEqual("0FC00000006E", TuringProtocol.BrightnessCommandHex(75), "75 percent brightness command hex (packed x)");
CheckEqual("00000000006E", TuringProtocol.BrightnessCommandHex(100), "100 percent brightness command hex (packed x)");
CheckEqual("3FC00000006E", TuringProtocol.BrightnessCommandHex(0), "0 percent brightness command hex (packed x)");
CheckEqual("00000000006C", TuringProtocol.ScreenPowerCommandHex(false), "SCREEN_OFF command hex");
CheckEqual("00000000006D", TuringProtocol.ScreenPowerCommandHex(true), "SCREEN_ON command hex");

Check(TuringProtocol.IsPortraitOrientation(100), "100 is Portrait");
Check(TuringProtocol.IsPortraitOrientation(101), "101 is Reverse Portrait");
Check(!TuringProtocol.IsPortraitOrientation(102), "102 is Landscape");
Check(!TuringProtocol.IsPortraitOrientation(103), "103 is Reverse Landscape");
CheckEqual((320, 480), TuringProtocol.FrameSizeForOrientation(100), "Portrait frame size");
CheckEqual((320, 480), TuringProtocol.FrameSizeForOrientation(101), "Reverse Portrait frame size");
CheckEqual((480, 320), TuringProtocol.FrameSizeForOrientation(102), "Landscape frame size");
CheckEqual((480, 320), TuringProtocol.FrameSizeForOrientation(103), "Reverse Landscape frame size");
CheckEqual(2560, TuringProtocol.ImageChunkSize(320), "portrait image chunk size is display_width * 8");
CheckEqual(3840, TuringProtocol.ImageChunkSize(480), "landscape image chunk size is display_width * 8");

if (failures > 0)
{
    Console.Error.WriteLine($"FAILED {failures} HardwareService test(s)");
    Environment.Exit(1);
}

Console.WriteLine("PASS all HardwareService tests");
