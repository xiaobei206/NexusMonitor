namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Name-based GPU sensor selection aligned with the TrafficMonitor LHM adapter.
/// Kept independent of LHM handles so fallback rules are unit-testable.
/// </summary>
public static class GpuSensorSelector
{
    public static double? SelectTemperature(IEnumerable<(string Name, double? Value)> sensors)
    {
        var values = Valid(sensors).ToArray();
        return values.FirstOrDefault(item => item.Name.Equals("GPU Core", StringComparison.OrdinalIgnoreCase)).Value
            ?? values.FirstOrDefault(item => item.Name.Contains("GPU Temperature", StringComparison.OrdinalIgnoreCase)).Value
            ?? values.Select(item => item.Value).FirstOrDefault();
    }

    public static (double? Value, string? SensorName) SelectClock(IEnumerable<(string Name, double? Value)> sensors)
    {
        var values = ValidPositive(sensors).ToArray();
        var coreClocks = values
            .Where(item => (item.Name.Contains("core", StringComparison.OrdinalIgnoreCase)
                    || item.Name.Contains("graphics", StringComparison.OrdinalIgnoreCase))
                && !item.Name.Contains("effective", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.Value!.Value)
            .ToArray();
        if (coreClocks.Length > 0) return (coreClocks[0].Value, coreClocks[0].Name);

        var nonAuxiliary = values
            .Where(item => !item.Name.Contains("memory", StringComparison.OrdinalIgnoreCase)
                && !item.Name.Contains("bus", StringComparison.OrdinalIgnoreCase)
                && !item.Name.Contains("effective", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(item => item.Value!.Value)
            .ToArray();
        if (nonAuxiliary.Length > 0) return (nonAuxiliary[0].Value, nonAuxiliary[0].Name);
        return (null, null);
    }

    public static double? SelectPower(IEnumerable<(string Name, double? Value)> sensors)
    {
        var values = ValidPositive(sensors).ToArray();
        return FirstByToken(values, "GPU Power")
            ?? FirstByToken(values, "GPU Package")
            ?? FirstByToken(values, "GPU Core")
            ?? FirstByToken(values, "Total")
            ?? values.Select(item => item.Value).FirstOrDefault();
    }

    private static double? FirstByToken((string Name, double? Value)[] values, string token) =>
        values.FirstOrDefault(item => item.Name.Contains(token, StringComparison.OrdinalIgnoreCase)).Value;

    private static IEnumerable<(string Name, double? Value)> Valid(IEnumerable<(string Name, double? Value)> sensors) =>
        sensors.Where(item => item.Value.HasValue && double.IsFinite(item.Value.Value));

    private static IEnumerable<(string Name, double? Value)> ValidPositive(IEnumerable<(string Name, double? Value)> sensors) =>
        Valid(sensors).Where(item => item.Value!.Value > 0);
}
