param([Parameter(Mandatory=$true)][long]$WidgetHandle)
$ErrorActionPreference = 'SilentlyContinue'
$native = @'
using System;
using System.Runtime.InteropServices;
public static class NexusWindowProbe {
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    [StructLayout(LayoutKind.Sequential)] public struct MONITORINFO { public int cbSize; public RECT rcMonitor; public RECT rcWork; public uint dwFlags; }
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hwnd, out RECT rect);
    [DllImport("user32.dll", CharSet=CharSet.Auto)] public static extern bool GetMonitorInfo(IntPtr monitor, ref MONITORINFO info);
    [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
    public static int[] WindowRect(IntPtr hwnd) {
        RECT r; if (!GetWindowRect(hwnd, out r)) return null;
        return new int[] { r.Left, r.Top, r.Right, r.Bottom };
    }
    public static int[] MonitorRect(IntPtr hwnd) {
        IntPtr h = MonitorFromWindow(hwnd, 2); if (h == IntPtr.Zero) return null;
        MONITORINFO i = new MONITORINFO(); i.cbSize = Marshal.SizeOf(typeof(MONITORINFO));
        if (!GetMonitorInfo(h, ref i)) return null;
        RECT r = i.rcMonitor;
        return new int[] { r.Left, r.Top, r.Right, r.Bottom };
    }
}
'@
try { Add-Type -TypeDefinition $native -ErrorAction Stop | Out-Null } catch { exit 2 }
try { $null = [NexusWindowProbe]::SetThreadDpiAwarenessContext([IntPtr](-4)) } catch { }
$widget = [IntPtr]::new($WidgetHandle)
while ($true) {
    try {
        $foreground = [NexusWindowProbe]::GetForegroundWindow()
        $rect = [NexusWindowProbe]::WindowRect($foreground)
        $monitor = [NexusWindowProbe]::MonitorRect($foreground)
        $widgetMonitor = [NexusWindowProbe]::MonitorRect($widget)
        if ($rect -and $monitor -and $widgetMonitor) {
            $sample = [ordered]@{
                handle = $foreground.ToInt64().ToString()
                left = $rect[0]; top = $rect[1]; right = $rect[2]; bottom = $rect[3]
                monitorLeft = $monitor[0]; monitorTop = $monitor[1]; monitorRight = $monitor[2]; monitorBottom = $monitor[3]
                widgetMonitorLeft = $widgetMonitor[0]; widgetMonitorTop = $widgetMonitor[1]; widgetMonitorRight = $widgetMonitor[2]; widgetMonitorBottom = $widgetMonitor[3]
            }
            [Console]::Out.WriteLine(($sample | ConvertTo-Json -Compress))
        }
    } catch { }
    Start-Sleep -Milliseconds 800
}
