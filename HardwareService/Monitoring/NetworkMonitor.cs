using System.Net;
using System.Net.NetworkInformation;
using System.Runtime.InteropServices;
using System.Management;
using NexusMonitor.HardwareService.Models;

namespace NexusMonitor.HardwareService.Monitoring;

public sealed class NetworkMonitor
{
    private readonly Dictionary<string,(long Rx,long Tx,DateTime At)> _previous = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _gate = new();
    private Dictionary<string, bool> _physicalAdapters = new(StringComparer.OrdinalIgnoreCase);
    private DateTime _physicalAdaptersReadAt = DateTime.MinValue;

    [DllImport("iphlpapi.dll", ExactSpelling = true)]
    private static extern uint GetBestInterface(uint destinationAddress, out uint interfaceIndex);

    private static string NormalizeId(string? id)
    {
        if (Guid.TryParse(id, out var guid)) return guid.ToString("N");
        return (id ?? string.Empty).Replace("{", string.Empty).Replace("}", string.Empty).Replace("-", string.Empty).Trim().ToLowerInvariant();
    }

    private Dictionary<string, bool> ReadPhysicalAdapters()
    {
        if (DateTime.UtcNow - _physicalAdaptersReadAt < TimeSpan.FromSeconds(30)) return _physicalAdapters;
        var map = new Dictionary<string, bool>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT GUID, PhysicalAdapter FROM Win32_NetworkAdapter WHERE GUID IS NOT NULL");
            using var results = searcher.Get();
            foreach (ManagementObject adapter in results)
            {
                var id = adapter["GUID"]?.ToString();
                if (string.IsNullOrWhiteSpace(id)) continue;
                // WMI providers may expose the CIM boolean as bool, ushort, or int.
                // Treat conversion failures as unknown rather than false: a false
                // WMI value must not hide every usable NIC from the UI.
                var rawPhysical = adapter["PhysicalAdapter"];
                bool physical;
                try { physical = rawPhysical != null && Convert.ToBoolean(rawPhysical, System.Globalization.CultureInfo.InvariantCulture); }
                catch { continue; }
                map[NormalizeId(id)] = physical;
            }
        }
        catch
        {
            // Fall back to adapter type/name heuristics below when WMI is unavailable.
        }
        _physicalAdapters = map;
        _physicalAdaptersReadAt = DateTime.UtcNow;
        return _physicalAdapters;
    }

    private static bool LooksLikePhysicalAdapter(NetworkInterface nic)
    {
        if (nic.NetworkInterfaceType is not (NetworkInterfaceType.Ethernet or NetworkInterfaceType.Wireless80211)) return false;
        var text = $"{nic.Name} {nic.Description}";
        return !System.Text.RegularExpressions.Regex.IsMatch(text,
            "tailscale|wintun|wireguard|tap-windows|openvpn|zerotier|hyper-v|virtual ethernet|vmware|virtualbox|docker|loopback|npcap|bluetooth|hamachi",
            System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant);
    }

    private static int? ReadBestRouteInterfaceIndex()
    {
        try
        {
            // 1.1.1.1 is only used as a route-selection destination; no request is sent.
            var target = BitConverter.ToUInt32(IPAddress.Parse("1.1.1.1").GetAddressBytes(), 0);
            return GetBestInterface(target, out var index) == 0 ? checked((int)index) : null;
        }
        catch { return null; }
    }

    public IReadOnlyList<NetworkSnapshot> Read()
    {
        lock (_gate)
        {
            var now = DateTime.UtcNow;
            var physicalMap = ReadPhysicalAdapters();
            var bestRouteIndex = ReadBestRouteInterfaceIndex();
            var result = new List<NetworkSnapshot>();
            foreach (var nic in NetworkInterface.GetAllNetworkInterfaces())
            {
                try
                {
                    // One interface-level counter pair only. Do not add IPv4 and IPv6
                    // statistics together; GetIPStatistics already represents the NIC.
                    var stats = nic.GetIPStatistics();
                    var rx = stats.BytesReceived;
                    var tx = stats.BytesSent;
                    var rxRate = 0d;
                    var txRate = 0d;
                    if (_previous.TryGetValue(nic.Id, out var old))
                    {
                        var elapsed = Math.Max(.25, (now - old.At).TotalSeconds);
                        rxRate = Math.Max(0, rx - old.Rx) / elapsed;
                        txRate = Math.Max(0, tx - old.Tx) / elapsed;
                    }
                    _previous[nic.Id] = (rx, tx, now);

                    var properties = nic.GetIPProperties();
                    var ipv4 = properties.UnicastAddresses.FirstOrDefault(a => a.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork)?.Address.ToString();
                    var hasGateway = properties.GatewayAddresses.Any(g =>
                        g.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork &&
                        !g.Address.Equals(IPAddress.Any) && !IPAddress.IsLoopback(g.Address));
                    var interfaceIndex = properties.GetIPv4Properties()?.Index;
                    var isDefaultRoute = bestRouteIndex.HasValue && interfaceIndex == bestRouteIndex.Value;
                    var heuristicPhysical = LooksLikePhysicalAdapter(nic);
                    var isPhysical = physicalMap.TryGetValue(NormalizeId(nic.Id), out var knownPhysical)
                        ? (knownPhysical || heuristicPhysical)
                        : heuristicPhysical;
                    result.Add(new NetworkSnapshot(
                        nic.Id, nic.Name, nic.Description, nic.NetworkInterfaceType.ToString(), ipv4,
                        nic.GetPhysicalAddress().ToString(), nic.OperationalStatus.ToString(), rx, tx,
                        rxRate, txRate, nic.Speed > 0 ? nic.Speed / 1_000_000 : null,
                        isPhysical, hasGateway, isDefaultRoute));
                }
                catch { }
            }
            return result.OrderByDescending(n => n.IsDefaultRoute).ThenByDescending(n => n.IsPhysical)
                .ThenByDescending(n => n.Status == "Up").ThenBy(n => n.Name).ToArray();
        }
    }
}
