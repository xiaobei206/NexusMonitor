using System.IO.Ports;
using System.Management;
using System.Text.RegularExpressions;
using NexusMonitor.HardwareService.Models;

namespace NexusMonitor.HardwareService.Display;

public sealed class TuringDisplayService : IDisposable
{
    private readonly object _gate = new();
    private SerialPort? _serial;
    private string? _port;
    private int _orientation = 103;
    private int _brightness = 0;
    private string _message = "尚未连接";
    private bool _deviceFound;
    private string? _identity;
    private string? _subRevision;
    private string _helloResponseHex = "";
    private bool _communicationInitialized;
    private bool _visualVerified;
    private int? _brightnessPercent;
    private int? _brightnessWireValue;
    private bool? _screenOn;
    private string? _lastCommandHex;
    private const int LandscapeWidth = 480;
    private const int LandscapeHeight = 320;
    private const int PortraitWidth = 320;
    private const int PortraitHeight = 480;
    private const byte DisplayBitmap = 197, SetOrientationCommand = 121, SetBrightnessCommand = 110, ScreenOffCommand = 108, ScreenOnCommand = 109;

    public TuringStatus Status
    {
        get { lock (_gate) return BuildStatus(); }
    }

    public IReadOnlyList<TuringDevice> Devices()
    {
        var ports = new List<TuringDevice>();
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Name, PNPDeviceID FROM Win32_PnPEntity WHERE Name LIKE '%(COM%'");
            using var result = searcher.Get();
            foreach (ManagementObject item in result)
            {
                try
                {
                    var name = Convert.ToString(item["Name"]) ?? "USB Serial Device";
                    var pnp = Convert.ToString(item["PNPDeviceID"]) ?? "";
                    var match = Regex.Match(name, @"\((COM\d+)\)", RegexOptions.IgnoreCase);
                    if (!match.Success) continue;
                    var serial = TuringProtocol.ExtractSerial(pnp);
                    ports.Add(new TuringDevice(
                        match.Groups[1].Value,
                        name,
                        pnp,
                        TuringProtocol.LooksLikeTuring(pnp, serial),
                        serial));
                }
                finally
                {
                    item.Dispose();
                }
            }
        }
        catch { }
        foreach (var portName in SerialPort.GetPortNames())
            if (!ports.Any(x => x.Port.Equals(portName, StringComparison.OrdinalIgnoreCase)))
                ports.Add(new TuringDevice(portName, $"Serial Port ({portName})", "", false));
        if (ports.Any(x => x.IsTuring)) _deviceFound = true;
        return ports.OrderByDescending(x => x.IsTuring).ThenBy(x => x.Port).ToArray();
    }

    public TuringStatus Connect(string? requestedPort, int? orientation)
    {
        lock (_gate)
        {
            var requestedOrientation = orientation is 100 or 101 or 102 or 103 ? orientation.Value : _orientation;
            DisconnectInternal();
            ResetSessionForConnect();

            try
            {
                var devices = Devices();
                var target = !string.IsNullOrWhiteSpace(requestedPort)
                    ? requestedPort
                    : devices.FirstOrDefault(d => d.IsTuring)?.Port;
                if (string.IsNullOrWhiteSpace(target))
                {
                    return Fail("COM port not found：未检测到图灵串口设备", null, false);
                }

                var device = devices.FirstOrDefault(d => d.Port.Equals(target, StringComparison.OrdinalIgnoreCase));
                if (device is null)
                {
                    return Fail($"设备身份未确认：{target} 不在当前 PnP 枚举中", null, false);
                }
                if (!device.IsTuring)
                {
                    return Fail($"设备身份未确认：{target} 不是 VID_1A86/PID_5722 或 USB35INCHIPSV2 设备", null, false);
                }

                _deviceFound = true;
                var officialIdentity = TuringProtocol.HasOfficialIdentity(device.PnpDeviceId, device.SerialNumber);
                _identity = officialIdentity ? "official-turing-3.5" : "turing-identity-partial";

                var port = OpenSerialWithRetry(target);
                try
                {
                    Thread.Sleep(350);
                    port.DiscardInBuffer();
                    port.DiscardOutBuffer();
                    port.Write(Enumerable.Repeat((byte)0x45, 6).ToArray(), 0, 6);

                    var response = new byte[6];
                    var read = 0;
                    var until = DateTime.UtcNow.AddMilliseconds(1600);
                    while (read < 6 && DateTime.UtcNow < until)
                    {
                        try
                        {
                            read += port.Read(response, read, 6 - read);
                        }
                        catch (TimeoutException)
                        {
                            break;
                        }
                    }

                    _helloResponseHex = TuringProtocol.Hex(response.AsSpan(0, read));
                    var helloKind = TuringProtocol.ClassifyHello(response.AsSpan(0, read));

                    if (helloKind == TuringHelloKind.Unexpected)
                    {
                        return Fail($"HELLO 响应异常：收到 {_helloResponseHex}，身份={_identity}", port, true);
                    }
                    if (helloKind == TuringHelloKind.NoResponse && !officialIdentity)
                    {
                        return Fail("HELLO 无响应，且设备身份未完整确认（需要 VID_1A86/PID_5722 + USB35INCHIPSV2）", port, true);
                    }

                    _serial = port;
                    _port = target;
                    _communicationInitialized = true;
                    _visualVerified = false;
                    _identity = TuringProtocol.IdentityLabel(helloKind);
                    _subRevision = TuringProtocol.SubRevision(helloKind);
                    // 4D-verified hardware orientation. Brightness is still not auto-applied.
                    SetOrientationInternal(requestedOrientation);
                    _message = helloKind == TuringHelloKind.NoResponse
                        ? "已按官方 Turing 3.5 初始化 Rev A 通信；视觉输出未验证"
                        : $"已识别 {_subRevision} 并初始化 Rev A 通信；视觉输出未验证";
                    return BuildStatus();
                }
                catch (Exception exception)
                {
                    try { port.Close(); } catch { }
                    try { port.Dispose(); } catch { }
                    _serial = null;
                    _port = null;
                    _communicationInitialized = false;
                    _visualVerified = false;
                    _message = $"串口初始化异常：{exception.Message}";
                    return BuildStatus();
                }
            }
            catch (Exception exception)
            {
                _serial = null;
                _port = null;
                _communicationInitialized = false;
                _visualVerified = false;
                _message = $"连接异常：{exception.Message}";
                return BuildStatus();
            }
        }
    }

    public TuringStatus SetOrientation(int orientation)
    {
        lock (_gate)
        {
            if (!IsCommunicationReady())
            {
                _message = "副屏未连接";
                return BuildStatus();
            }
            try
            {
                SetOrientationInternal(orientation);
                _message = "方向命令已发送（视觉未验证）";
                return BuildStatus();
            }
            catch (Exception exception)
            {
                InvalidateConnection($"方向命令失败，连接已失效：{exception.Message}");
                return BuildStatus();
            }
        }
    }

    public TuringStatus SetBrightness(int brightnessPercent)
    {
        lock (_gate)
        {
            if (!IsCommunicationReady())
            {
                _message = "副屏未连接";
                return BuildStatus();
            }
            if (brightnessPercent is < 0 or > 100)
            {
                _message = "亮度必须是 0-100 百分比";
                return BuildStatus();
            }
            try
            {
                var percent = Math.Clamp(brightnessPercent, 0, 100);
                var wireValue = TuringProtocol.BrightnessToWire(percent);
                _lastCommandHex = SetBrightnessInternal(wireValue);
                _brightnessPercent = percent;
                _brightnessWireValue = wireValue;
                _message = $"亮度 {percent}% 已发送（wire {wireValue}，视觉未验证）";
                return BuildStatus();
            }
            catch (Exception exception)
            {
                InvalidateConnection($"亮度命令失败，连接已失效：{exception.Message}");
                return BuildStatus();
            }
        }
    }

    public TuringStatus SetScreenPower(bool on)
    {
        lock (_gate)
        {
            if (!IsCommunicationReady())
            {
                _message = "副屏未连接";
                return BuildStatus();
            }
            try
            {
                _lastCommandHex = SendCommand(on ? ScreenOnCommand : ScreenOffCommand);
                _screenOn = on;
                _message = on ? "屏幕打开命令已发送（视觉未验证）" : "屏幕关闭命令已发送（视觉未验证）";
                return BuildStatus();
            }
            catch (Exception exception)
            {
                InvalidateConnection($"屏幕开关命令失败，连接已失效：{exception.Message}");
                return BuildStatus();
            }
        }
    }

    public object SendPatches(IReadOnlyList<TuringPatch> patches)
    {
        lock (_gate)
        {
            var serial = _serial;
            if (!IsCommunicationReady() || serial is null) return new { ok = false, message = "副屏未连接" };
            var sent = 0;
            try
            {
                var (frameWidth, frameHeight) = TuringProtocol.FrameSizeForOrientation(_orientation);
                foreach (var p in patches)
                {
                    if (p.Width <= 0 || p.Height <= 0 || p.X < 0 || p.Y < 0 || p.X + p.Width > frameWidth || p.Y + p.Height > frameHeight) continue;
                    var data = Convert.FromBase64String(p.DataBase64);
                    if (data.Length != p.Width * p.Height * 2) continue;
                    SendCommand(DisplayBitmap, p.X, p.Y, p.X + p.Width - 1, p.Y + p.Height - 1);
                    // Upstream Rev A chunks by the full display width, not the patch width.
                    var chunkSize = TuringProtocol.ImageChunkSize(frameWidth);
                    for (var offset = 0; offset < data.Length; offset += chunkSize)
                    {
                        var count = Math.Min(chunkSize, data.Length - offset);
                        serial.Write(data, offset, count);
                    }
                    sent++;
                }
                _message = $"已发送 {sent} 个区域（视觉未验证）";
                return new { ok = true, sent, message = _message };
            }
            catch (Exception exception)
            {
                InvalidateConnection($"发送异常，连接已失效：{exception.Message}");
                return new { ok = false, sent, message = _message };
            }
        }
    }

    public TuringStatus MarkVisualVerified(bool verified)
    {
        lock (_gate)
        {
            if (!IsCommunicationReady())
            {
                _message = "副屏未连接";
                return BuildStatus();
            }
            _visualVerified = verified;
            _message = verified ? "视觉输出已通过人工观察确认" : "视觉验证已撤销";
            return BuildStatus();
        }
    }

    public TuringStatus Disconnect()
    {
        lock (_gate)
        {
            DisconnectInternal();
            _message = "已断开";
            return BuildStatus();
        }
    }

    private SerialPort OpenSerialWithRetry(string portName)
    {
        Exception? lastError = null;
        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                var port = new SerialPort(portName, 115200, Parity.None, 8, StopBits.One)
                {
                    Handshake = Handshake.RequestToSend,
                    ReadTimeout = 1300,
                    WriteTimeout = 5000,
                    DtrEnable = true
                };
                port.Open();
                return port;
            }
            catch (Exception exception)
            {
                lastError = exception;
                if (attempt < 3) Thread.Sleep(250);
            }
        }

        throw new IOException($"打开 {portName} 失败（3 次尝试）：{lastError?.GetType().Name}: {lastError?.Message}", lastError);
    }

    private void SetOrientationInternal(int value)
    {
        if (value is not (100 or 101 or 102 or 103)) throw new ArgumentOutOfRangeException(nameof(value));
        var (width, height) = TuringProtocol.FrameSizeForOrientation(value);
        var command = new byte[16]; command[5] = SetOrientationCommand; command[6] = (byte)value;
        command[7] = (byte)(width >> 8); command[8] = (byte)(width & 0xff);
        command[9] = (byte)(height >> 8); command[10] = (byte)(height & 0xff);
        _serial!.Write(command, 0, command.Length); Thread.Sleep(150); _orientation = value;
    }

    private string SetBrightnessInternal(int value)
    {
        // Upstream Rev A places the inverted wire value in the packed x field:
        // SendCommand(110, wire, 0, 0, 0). 0 is brightest, 255 is darkest.
        var data = TuringProtocol.EncodeBrightnessCommand(value);
        _serial!.Write(data, 0, data.Length);
        _brightness = value;
        return Convert.ToHexString(data);
    }

    private string SendCommand(byte command, int x = 0, int y = 0, int ex = 0, int ey = 0)
    {
        var data = TuringProtocol.EncodeCommand(x, y, ex, ey, command);
        _serial!.Write(data, 0, data.Length);
        return Convert.ToHexString(data);
    }

    private bool IsCommunicationReady() => _communicationInitialized && _serial?.IsOpen == true;

    private TuringStatus BuildStatus() => new(
        IsCommunicationReady(),
        _port,
        _deviceFound,
        _message,
        _orientation,
        _brightness,
        _identity,
        _subRevision,
        _helloResponseHex,
        _communicationInitialized,
        _visualVerified,
        _brightnessPercent,
        _brightnessWireValue,
        _screenOn,
        _lastCommandHex);

    private TuringStatus Fail(string message, SerialPort? port, bool deviceFound)
    {
        if (port is not null)
        {
            try { port.Close(); } catch { }
            try { port.Dispose(); } catch { }
        }
        _serial = null;
        _port = null;
        _deviceFound = deviceFound;
        _communicationInitialized = false;
        _visualVerified = false;
        _message = message;
        return BuildStatus();
    }

    private void InvalidateConnection(string message)
    {
        DisconnectInternal();
        _message = message;
    }

    private void ResetSessionForConnect()
    {
        _deviceFound = false;
        _identity = null;
        _subRevision = null;
        _helloResponseHex = "";
        _visualVerified = false;
        _communicationInitialized = false;
        _brightnessPercent = null;
        _brightnessWireValue = null;
        _screenOn = null;
        _lastCommandHex = null;
        _message = "正在连接";
    }

    private void DisconnectInternal()
    {
        try { if (_serial?.IsOpen == true) _serial.Close(); } catch { }
        try { _serial?.Dispose(); } catch { }
        _serial = null;
        _port = null;
        _communicationInitialized = false;
        _visualVerified = false;
        _screenOn = null;
    }

    public void Dispose()
    {
        lock (_gate) DisconnectInternal();
    }
}
