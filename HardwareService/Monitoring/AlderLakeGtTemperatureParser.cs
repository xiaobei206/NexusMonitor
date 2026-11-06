namespace NexusMonitor.HardwareService.Monitoring;

/// <summary>
/// Decodes Intel THERM_STATUS_GT at MCHBAR + 0x59C0.
/// The register reports a distance below TjMax; bit 31 must indicate valid data.
/// </summary>
public static class AlderLakeGtTemperatureParser
{
    public static bool IsSupportedModel(int family, int model) =>
        family == 6 && model is (0x97 or 0x9A);

    public static bool TryDecode(uint registerValue, uint tjMaxCelsius, out double temperatureCelsius, out string status)
    {
        temperatureCelsius = 0;
        if (tjMaxCelsius is < 70 or > 125)
        {
            status = "invalid-tjmax";
            return false;
        }

        if ((registerValue & 0x80000000u) == 0)
        {
            status = "register-not-valid";
            return false;
        }

        var degreesBelowTjMax = (registerValue >> 16) & 0xFFu;
        if (degreesBelowTjMax > tjMaxCelsius)
        {
            status = "invalid-temperature-delta";
            return false;
        }

        var decoded = (double)(tjMaxCelsius - degreesBelowTjMax);
        if (!double.IsFinite(decoded) || decoded is < 0 or > 125)
        {
            status = "temperature-out-of-range";
            return false;
        }

        temperatureCelsius = decoded;
        status = "available";
        return true;
    }
}
