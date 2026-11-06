using System.Text.RegularExpressions;

namespace NexusMonitor.HardwareService.Monitoring;

public sealed record ProcessorPerformanceSample(
    string InstanceName,
    double? ProcessorFrequencyMHz,
    double? PercentProcessorPerformance,
    double? PercentProcessorTime = null);

/// <summary>
/// Estimates a changing average CPU clock from the Windows Processor Information
/// performance counter. ProcessorFrequency is commonly the nominal/base figure;
/// PercentProcessorPerformance can exceed 100 during turbo. This is an estimate,
/// not a direct hardware clock measurement, so callers must label it accordingly.
/// </summary>
public static partial class WindowsCpuClockEstimator
{
    [GeneratedRegex("^[0-9]+,[0-9]+$", RegexOptions.CultureInvariant)]
    private static partial Regex LogicalProcessorInstance();

    public static double? EstimateAverageMHz(IEnumerable<ProcessorPerformanceSample> samples)
    {
        var candidates = samples
            .Where(sample => LogicalProcessorInstance().IsMatch(sample.InstanceName))
            .Where(sample => sample.ProcessorFrequencyMHz is >= 300 and <= 10_000)
            .Where(sample => sample.PercentProcessorPerformance is >= 10 and <= 250)
            .Select(sample => new
            {
                EstimatedMHz = sample.ProcessorFrequencyMHz!.Value * sample.PercentProcessorPerformance!.Value / 100d,
                ProcessorTime = sample.PercentProcessorTime,
            })
            .Where(sample => double.IsFinite(sample.EstimatedMHz) && sample.EstimatedMHz is >= 300 and <= 10_000)
            .ToArray();

        if (candidates.Length == 0) return null;

        // Sleeping/idle logical processors can pull a whole-package arithmetic
        // mean down and make the displayed clock look implausibly slow. Prefer
        // active logical processors (>1% time) where Windows has that counter;
        // if it is unavailable or all processors are idle, fall back to all.
        var active = candidates.Where(sample => sample.ProcessorTime is > 1).ToArray();
        var selected = active.Length > 0 ? active : candidates;
        return selected.Average(sample => sample.EstimatedMHz);
    }
}
