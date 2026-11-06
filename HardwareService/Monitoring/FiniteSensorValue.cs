namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Converts provider float readings to nullable API numbers without allowing
/// NaN or infinities into snapshot models.
/// </summary>
public static class FiniteSensorValue
{
    public static double? FromFloat(float? value) =>
        value is float reading && float.IsFinite(reading) ? reading : null;
}
