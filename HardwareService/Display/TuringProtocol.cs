namespace NexusMonitor.HardwareService.Display;

public enum TuringHelloKind
{
    NoResponse,
    UsbMonitor35,
    UsbMonitor5,
    UsbMonitor7,
    Unexpected,
}

/// <summary>
/// Pure identity and HELLO classification rules for the Rev A display family.
/// Kept separate from SerialPort so the protocol decisions can be unit tested.
/// </summary>
public static class TuringProtocol
{
    public const string OfficialSerial = "USB35INCHIPSV2";
    public const string UsbVidPid = "VID_1A86&PID_5722";

    public static string? ExtractSerial(string? pnpDeviceId)
    {
        if (string.IsNullOrWhiteSpace(pnpDeviceId)) return null;
        var parts = pnpDeviceId.Split('\\', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length == 0 ? null : parts[^1];
    }

    public static bool LooksLikeTuring(string? pnpDeviceId, string? serialNumber)
    {
        var hasVidPid = pnpDeviceId?.Contains(UsbVidPid, StringComparison.OrdinalIgnoreCase) == true;
        var hasOfficialSerial = string.Equals(serialNumber ?? ExtractSerial(pnpDeviceId), OfficialSerial,
            StringComparison.OrdinalIgnoreCase);
        return hasVidPid || hasOfficialSerial;
    }

    public static bool HasOfficialIdentity(string? pnpDeviceId, string? serialNumber)
    {
        var hasVidPid = pnpDeviceId?.Contains(UsbVidPid, StringComparison.OrdinalIgnoreCase) == true;
        var serial = serialNumber ?? ExtractSerial(pnpDeviceId);
        return hasVidPid && string.Equals(serial, OfficialSerial, StringComparison.OrdinalIgnoreCase);
    }

    public static TuringHelloKind ClassifyHello(ReadOnlySpan<byte> response)
    {
        if (response.Length == 0) return TuringHelloKind.NoResponse;
        if (response.Length != 6) return TuringHelloKind.Unexpected;

        var value = response[0];
        if (value is not (0x01 or 0x02 or 0x03)) return TuringHelloKind.Unexpected;
        for (var index = 1; index < response.Length; index++)
        {
            if (response[index] != value) return TuringHelloKind.Unexpected;
        }

        return value switch
        {
            0x01 => TuringHelloKind.UsbMonitor35,
            0x02 => TuringHelloKind.UsbMonitor5,
            _ => TuringHelloKind.UsbMonitor7,
        };
    }

    public static string SubRevision(TuringHelloKind kind) => kind switch
    {
        TuringHelloKind.NoResponse => "TURING_3_5",
        TuringHelloKind.UsbMonitor35 => "USBMONITOR_3_5",
        TuringHelloKind.UsbMonitor5 => "USBMONITOR_5",
        TuringHelloKind.UsbMonitor7 => "USBMONITOR_7",
        _ => "UNEXPECTED",
    };

    public static string IdentityLabel(TuringHelloKind kind) => kind switch
    {
        TuringHelloKind.NoResponse => "official-turing-3.5",
        TuringHelloKind.UsbMonitor35 => "usbmonitor-3.5",
        TuringHelloKind.UsbMonitor5 => "usbmonitor-5",
        TuringHelloKind.UsbMonitor7 => "usbmonitor-7",
        _ => "unexpected",
    };

    public static string Hex(ReadOnlySpan<byte> bytes) => bytes.Length == 0 ? "" : Convert.ToHexString(bytes);

    public static int BrightnessToWire(int brightnessPercent)
    {
        var percent = Math.Clamp(brightnessPercent, 0, 100);
        return (int)(255 - (percent / 100.0 * 255));
    }

    public static byte[] EncodeCommand(int x, int y, int ex, int ey, byte command)
    {
        var data = new byte[6];
        data[0] = (byte)((x >> 2) & 0xff);
        data[1] = (byte)(((x & 3) << 6) | ((y >> 4) & 0x3f));
        data[2] = (byte)(((y & 15) << 4) | ((ex >> 6) & 0x0f));
        data[3] = (byte)(((ex & 63) << 2) | ((ey >> 8) & 3));
        data[4] = (byte)(ey & 0xff);
        data[5] = command;
        return data;
    }

    public static string CommandHex(int x, int y, int ex, int ey, byte command) =>
        Convert.ToHexString(EncodeCommand(x, y, ex, ey, command));

    public static byte[] EncodeBrightnessCommand(int wireValue) =>
        // Upstream Rev A: SendCommand(SET_BRIGHTNESS, level_absolute, 0, 0, 0).
        // The value therefore uses the same packed-x encoding as every other command.
        EncodeCommand(Math.Clamp(wireValue, 0, 255), 0, 0, 0, 110);

    public static string BrightnessCommandHex(int brightnessPercent) =>
        Convert.ToHexString(EncodeBrightnessCommand(BrightnessToWire(brightnessPercent)));

    public static string BrightnessCommandHexForWire(int wireValue) =>
        Convert.ToHexString(EncodeBrightnessCommand(wireValue));

    public static string ScreenPowerCommandHex(bool on) =>
        CommandHex(0, 0, 0, 0, (byte)(on ? 109 : 108));

    public static bool IsPortraitOrientation(int value) => value is 100 or 101;

    public static (int Width, int Height) FrameSizeForOrientation(int value) =>
        IsPortraitOrientation(value) ? (320, 480) : (480, 320);

    public static int ImageChunkSize(int frameWidth) => Math.Max(frameWidth, 1) * 8;
}
