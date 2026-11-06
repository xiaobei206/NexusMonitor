using System.Management;
using System.Security.Cryptography;
using System.Text;

namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Pure disk classification helpers so filtering, Optane detection and stable
/// IDs can be tested without a WMI provider or a live disk.
/// </summary>
public static class StorageClassifier
{
    public static bool HasUsableSize(ulong? size) => size is > 0;

    /// <summary>
    /// Selects a live device temperature and deliberately excludes warning/critical
    /// limits. NVMe drives commonly expose those limits beside Composite Temperature;
    /// choosing the maximum sensor value would incorrectly report the critical limit.
    /// </summary>
    public static double? SelectRealTemperature(IEnumerable<(string Name, double? Value)> sensors)
    {
        var actual = sensors
            .Where(sensor =>
                sensor.Value is double value &&
                double.IsFinite(value) &&
                value is >= -40 and <= 150 &&
                !IsTemperatureLimit(sensor.Name))
            .ToArray();

        var composite = actual.FirstOrDefault(sensor =>
            sensor.Name.Contains("composite temperature", StringComparison.OrdinalIgnoreCase));
        if (composite.Value.HasValue) return composite.Value;

        return actual
            .OrderByDescending(sensor => sensor.Value)
            .Select(sensor => sensor.Value)
            .FirstOrDefault();
    }

    private static bool IsTemperatureLimit(string name) =>
        name.Contains("warning", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("critical", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("threshold", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("limit", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("tjmax", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("maximum", StringComparison.OrdinalIgnoreCase) ||
        name.Contains("minimum", StringComparison.OrdinalIgnoreCase);

    public static string? PerformanceInstanceDiskIndex(string? instanceName)
    {
        if (string.IsNullOrWhiteSpace(instanceName)) return null;
        var firstToken = instanceName.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        return int.TryParse(firstToken, out var index) && index >= 0 ? index.ToString() : null;
    }

    public static bool IsOptane(string? model, string? pnpDeviceId, ulong? size)
    {
        var identity = $"{model} {pnpDeviceId}";
        if (identity.Contains("MEMPEK", StringComparison.OrdinalIgnoreCase) ||
            identity.Contains("OPTANE", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        // Some OEM systems expose the Optane memory module only as an Intel
        // 16 GB fixed disk. Keep the size fallback restricted to Intel devices
        // so a generic 16 GB USB stick is not misclassified.
        return identity.Contains("INTEL", StringComparison.OrdinalIgnoreCase) &&
               size is >= 14_000_000_000 and <= 18_000_000_000;
    }

    public static string BuildStableId(string? serialNumber, string? pnpDeviceId, string legacyIndex)
    {
        var serial = NormalizeSerial(serialNumber);
        var identity = !string.IsNullOrWhiteSpace(serial)
            ? $"serial:{serial}"
            : !string.IsNullOrWhiteSpace(pnpDeviceId)
                ? $"pnp:{pnpDeviceId.Trim()}"
                : $"index:{legacyIndex}";

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(identity)))
            .ToLowerInvariant()[..16];
        return $"disk:{hash}";
    }

    public static IReadOnlyList<string> BuildAliases(
        string legacyIndex,
        string? model,
        string? serialNumber,
        string? pnpDeviceId)
    {
        var aliases = new[]
        {
            legacyIndex,
            model,
            serialNumber?.Trim().TrimEnd('.'),
            pnpDeviceId?.Trim(),
        };

        return aliases
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray()!;
    }

    public static bool IsAccessDenied(Exception exception)
    {
        if (exception is UnauthorizedAccessException) return true;
        if (exception is ManagementException managementException &&
            managementException.ErrorCode == ManagementStatus.AccessDenied)
        {
            return true;
        }
        return exception.HResult == unchecked((int)0x80070005);
    }

    private static string? NormalizeSerial(string? serialNumber)
    {
        var value = serialNumber?.Trim().TrimEnd('.');
        if (string.IsNullOrWhiteSpace(value)) return null;
        if (value.All(character => character is '0' or ' ' or '_')) return null;
        return value;
    }
}
