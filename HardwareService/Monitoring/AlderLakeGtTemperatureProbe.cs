using LibreHardwareMonitor.Hardware;
using LibreHardwareMonitor.PawnIo;
using Microsoft.Extensions.Logging;
using System.Reflection;
using System.Runtime.Intrinsics.X86;
using System.Text;

namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Experimental, strictly read-only Intel Alder Lake GT temperature probe.
/// Reads THERM_STATUS_GT (MCHBAR + 0x59C0) through the official signed PawnIO
/// IntelMCHBAR module. No PCI configuration, MCHBAR, power-limit or fan writes
/// are performed by this class.
/// </summary>
public sealed class AlderLakeGtTemperatureProbe : IDisposable
{
    public const uint TemperatureStatusRegister = 0x59C0;
    public const uint TemperatureTargetMsr = 0x1A2;
    public const string ModuleResourceName = "NexusMonitor.HardwareService.Resources.PawnIO.IntelMCHBAR.bin";

    private readonly ILogger _logger;
    private readonly Assembly _serviceAssembly;
    private readonly object _gate = new();
    private bool _initialized;
    private bool _ready;
    private bool _disposed;
    private uint _tjMax;
    private object? _mchbarModule;
    private Type? _pawnIoType;
    private MethodInfo? _executeHr;
    private IntelMsr? _intelMsr;
    private string? _lastLoggedStatus;

    public AlderLakeGtTemperatureProbe(ILogger logger, Assembly? serviceAssembly = null)
    {
        _logger = logger;
        _serviceAssembly = serviceAssembly ?? Assembly.GetExecutingAssembly();
    }

    public string Status { get; private set; } = "not-probed";
    public uint? TjMaxCelsius => _tjMax == 0 ? null : _tjMax;

    public static bool IsCurrentCpuSupported()
    {
        if (!X86Base.IsSupported) return false;
        try
        {
            var vendorRegisters = X86Base.CpuId(0, 0);
            var vendorBytes = new byte[12];
            Buffer.BlockCopy(BitConverter.GetBytes(vendorRegisters.Ebx), 0, vendorBytes, 0, 4); // EBX
            Buffer.BlockCopy(BitConverter.GetBytes(vendorRegisters.Edx), 0, vendorBytes, 4, 4); // EDX
            Buffer.BlockCopy(BitConverter.GetBytes(vendorRegisters.Ecx), 0, vendorBytes, 8, 4); // ECX
            var vendor = Encoding.ASCII.GetString(vendorBytes);
            if (!string.Equals(vendor, "GenuineIntel", StringComparison.Ordinal)) return false;

            var signature = X86Base.CpuId(1, 0).Eax;
            var baseFamily = (signature >> 8) & 0xF;
            var baseModel = (signature >> 4) & 0xF;
            var extendedFamily = (signature >> 20) & 0xFF;
            var extendedModel = (signature >> 16) & 0xF;
            var family = baseFamily == 0xF ? baseFamily + extendedFamily : baseFamily;
            var model = baseFamily is 0x6 or 0xF ? (extendedModel << 4) | baseModel : baseModel;
            return AlderLakeGtTemperatureParser.IsSupportedModel(family, model);
        }
        catch
        {
            return false;
        }
    }

    public bool TryReadTemperature(out double temperatureCelsius)
    {
        lock (_gate)
        {
            temperatureCelsius = 0;
            if (_disposed)
            {
                SetStatus("disposed");
                return false;
            }

            if (!_initialized) Initialize();
            if (!_ready || _mchbarModule is null || _executeHr is null) return false;

            try
            {
                var input = new long[] { TemperatureStatusRegister };
                var output = new long[1];
                object?[] arguments = { "ioctl_read_dword", input, 1u, output, 1u, 0u };
                var hresult = Convert.ToInt32(_executeHr.Invoke(_mchbarModule, arguments), System.Globalization.CultureInfo.InvariantCulture);
                var returnedSize = Convert.ToUInt32(arguments[5], System.Globalization.CultureInfo.InvariantCulture);
                if (hresult != 0 || returnedSize != 1)
                {
                    SetStatus("mchbar-read-failed");
                    return false;
                }

                var raw = unchecked((uint)output[0]);
                if (!AlderLakeGtTemperatureParser.TryDecode(raw, _tjMax, out temperatureCelsius, out var decodeStatus))
                {
                    SetStatus(decodeStatus);
                    return false;
                }

                SetStatus("available");
                return true;
            }
            catch (Exception exception)
            {
                SetStatus("mchbar-read-exception");
                LogStatus(exception);
                return false;
            }
        }
    }

    private void Initialize()
    {
        _initialized = true;

        if (!IsCurrentCpuSupported())
        {
            SetStatus("unsupported-cpu");
            return;
        }

        if (!PawnIo.IsInstalled)
        {
            SetStatus("pawnio-not-installed");
            return;
        }

        if (!_serviceAssembly.GetManifestResourceNames().Contains(ModuleResourceName, StringComparer.Ordinal))
        {
            SetStatus("mchbar-module-missing");
            return;
        }

        try
        {
            // LHM 0.9.6 already embeds its signed Intel MSR PawnIO module. Use the
            // public reader for IA32_TEMPERATURE_TARGET (MSR 0x1A2) to obtain TjMax.
            _intelMsr = new IntelMsr();
            if (!_intelMsr.ReadMsr(TemperatureTargetMsr, out var temperatureTarget))
            {
                SetStatus("tjmax-read-failed");
                return;
            }

            _tjMax = (uint)((temperatureTarget >> 16) & 0xFF);
            if (_tjMax is < 70 or > 125)
            {
                _tjMax = 0;
                SetStatus("invalid-tjmax");
                return;
            }

            // LHM intentionally keeps LoadModuleFromResource internal. Reflection
            // is restricted to this known API and the official signed module.
            _pawnIoType = typeof(PawnIo);
            var loadModule = _pawnIoType.GetMethod("LoadModuleFromResource", BindingFlags.Static | BindingFlags.NonPublic);
            if (loadModule is null)
            {
                SetStatus("lhm-pawnio-loader-unavailable");
                return;
            }

            _mchbarModule = loadModule.Invoke(null, new object[] { _serviceAssembly, ModuleResourceName });
            if (_mchbarModule is null)
            {
                SetStatus("mchbar-module-load-failed");
                return;
            }

            var isLoaded = _pawnIoType.GetProperty("IsLoaded", BindingFlags.Instance | BindingFlags.Public);
            if (isLoaded?.GetValue(_mchbarModule) is not true)
            {
                SetStatus("mchbar-module-not-loaded");
                CloseMchbarModule();
                return;
            }

            _executeHr = _pawnIoType.GetMethod("ExecuteHr", BindingFlags.Instance | BindingFlags.Public);
            if (_executeHr is null)
            {
                SetStatus("lhm-pawnio-execute-unavailable");
                CloseMchbarModule();
                return;
            }

            _ready = true;
            SetStatus("ready");
        }
        catch (Exception exception)
        {
            SetStatus("initialization-failed");
            LogStatus(exception);
            CloseMchbarModule();
            try { _intelMsr?.Close(); } catch { }
            _intelMsr = null;
        }
    }

    private void SetStatus(string status)
    {
        Status = status;
        if (string.Equals(_lastLoggedStatus, status, StringComparison.Ordinal)) return;
        _lastLoggedStatus = status;
        _logger.LogInformation("Alder Lake GT temperature probe status: {Status}", status);
    }

    private void LogStatus(Exception exception) =>
        _logger.LogWarning(exception, "Alder Lake GT temperature probe encountered a read/initialization error; no temperature value will be fabricated.");

    private void CloseMchbarModule()
    {
        try
        {
            var close = _pawnIoType?.GetMethod("Close", BindingFlags.Instance | BindingFlags.Public);
            close?.Invoke(_mchbarModule, null);
        }
        catch { }
        _mchbarModule = null;
        _executeHr = null;
    }

    public void Dispose()
    {
        lock (_gate)
        {
            if (_disposed) return;
            _disposed = true;
            CloseMchbarModule();
            try { _intelMsr?.Close(); } catch { }
            _intelMsr = null;
            _ready = false;
            Status = "disposed";
        }
    }
}
