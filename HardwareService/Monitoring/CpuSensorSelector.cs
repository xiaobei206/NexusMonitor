namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Sensor naming policy aligned with the Windows LHM path used by Turing Smart Screen.
/// Kept independent of hardware handles so selection behaviour can be tested offline.
/// </summary>
public static class CpuSensorSelector
{
    public static double? SelectTemperature(IEnumerable<(string Name, double? Value)> sensors)
    {
        var items = Valid(sensors).ToArray();
        return FirstByPrefix(items, "Core Average")
            ?? FirstByPrefix(items, "Core Max")
            ?? FirstByPrefix(items, "CPU Package")
            ?? items.FirstOrDefault(item => item.Name.StartsWith("Core", StringComparison.OrdinalIgnoreCase)).Value
            ?? items.OrderByDescending(item => item.Value).Select(item => item.Value).FirstOrDefault();
    }

    public static double? SelectClock(IEnumerable<(string Name, double? Value)> sensors)
    {
        var items = ValidPositive(sensors).ToArray();
        var coreClocks = items
            .Where(item => item.Name.Contains("Core #", StringComparison.OrdinalIgnoreCase)
                && !item.Name.Contains("effective", StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Value!.Value)
            .ToArray();
        if (coreClocks.Length > 0) return coreClocks.Average();

        var averageClock = items.FirstOrDefault(item => item.Name.Contains("average", StringComparison.OrdinalIgnoreCase)
            && !item.Name.Contains("effective", StringComparison.OrdinalIgnoreCase)).Value;
        if (averageClock.HasValue) return averageClock.Value;

        var otherCoreClocks = items
            .Where(item => item.Name.Contains("core", StringComparison.OrdinalIgnoreCase)
                && !item.Name.Contains("effective", StringComparison.OrdinalIgnoreCase))
            .Select(item => item.Value!.Value)
            .ToArray();
        return otherCoreClocks.Length == 0 ? null : otherCoreClocks.Average();
    }

    public static double? SelectPower(IEnumerable<(string Name, double? Value)> sensors)
    {
        // The Turing custom-sensor example uses CPU Package Power specifically.
        // Do not silently substitute the narrower CPU Cores metric for package power.
        var items = ValidPositive(sensors).ToArray();
        return FirstByPrefix(items, "CPU Package");
    }

    private static double? FirstByPrefix((string Name, double? Value)[] items, string prefix) =>
        items.FirstOrDefault(item => item.Name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)).Value;

    private static IEnumerable<(string Name, double? Value)> Valid(IEnumerable<(string Name, double? Value)> sensors) =>
        sensors.Where(item => item.Value.HasValue && double.IsFinite(item.Value.Value));

    private static IEnumerable<(string Name, double? Value)> ValidPositive(IEnumerable<(string Name, double? Value)> sensors) =>
        Valid(sensors).Where(item => item.Value!.Value > 0);
}
