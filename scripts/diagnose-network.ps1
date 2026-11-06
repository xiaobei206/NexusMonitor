[CmdletBinding()]
param(
    [ValidateRange(3, 60)]
    [int]$SampleSeconds = 8,
    [string]$OutputPath = '.\network-diagnostic.txt'
)

# ASCII-only to avoid Windows PowerShell 5.1 ANSI decoding problems.
$ErrorActionPreference = 'Stop'
$lines = New-Object 'System.Collections.Generic.List[string]'

function Write-Line {
    param([AllowEmptyString()][string]$Text)
    [void]$lines.Add($Text)
    Write-Output $Text
}

function Get-AdapterCounter {
    param([Parameter(Mandatory = $true)]$Adapter)
    try {
        $stats = Get-NetAdapterStatistics -Name $Adapter.Name -ErrorAction Stop | Select-Object -First 1
        if ($null -eq $stats) { return $null }
        return [pscustomobject]@{
            IfIndex = [int]$Adapter.ifIndex
            Name = [string]$Adapter.Name
            ReceivedBytes = [double]$stats.ReceivedBytes
            SentBytes = [double]$stats.SentBytes
        }
    } catch { return $null }
}

function Get-HardwareServiceSnapshot {
    try {
        return Invoke-RestMethod -Uri 'http://127.0.0.1:18765/api/snapshot' -TimeoutSec 4 -ErrorAction Stop
    } catch { return $null }
}

Write-Line '========== NexusMonitor Network Diagnostic =========='
Write-Line ('Time: {0}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz'))
Write-Line ('Sample seconds: {0}' -f $SampleSeconds)

$routes = @()
try {
    $routes = @(Get-NetRoute -AddressFamily IPv4 -DestinationPrefix '0.0.0.0/0' -PolicyStore ActiveStore -ErrorAction Stop)
} catch {
    Write-Line ('Get-NetRoute error: {0}' -f $_.Exception.Message)
}

$routeRows = foreach ($route in $routes) {
    $ifMetric = 0
    try {
        $ipif = Get-NetIPInterface -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction Stop | Select-Object -First 1
        if ($null -ne $ipif) { $ifMetric = [int]$ipif.InterfaceMetric }
    } catch { }
    [pscustomobject]@{
        IfIndex = [int]$route.InterfaceIndex
        NextHop = [string]$route.NextHop
        RouteMetric = [int]$route.RouteMetric
        InterfaceMetric = $ifMetric
        EffectiveMetric = ([int]$route.RouteMetric + $ifMetric)
    }
}
$routeRows = @($routeRows | Sort-Object EffectiveMetric, IfIndex)
$defaultIfIndex = -1
if ($routeRows.Count -gt 0) { $defaultIfIndex = [int]$routeRows[0].IfIndex }
if ($defaultIfIndex -ge 0) { $defaultIndexText = [string]$defaultIfIndex } else { $defaultIndexText = 'NOT FOUND' }
Write-Line ('IPv4 default-route interface index: {0}' -f $defaultIndexText)
if ($routeRows.Count -gt 0) {
    Write-Line 'Default route candidates:'
    Write-Line (($routeRows | Select-Object -First 8 | Format-Table -AutoSize | Out-String -Width 180).TrimEnd())
}

$adapters = @()
try { $adapters = @(Get-NetAdapter -IncludeHidden -ErrorAction Stop | Sort-Object ifIndex) }
catch { Write-Line ('Get-NetAdapter error: {0}' -f $_.Exception.Message) }

$inventory = foreach ($adapter in $adapters) {
    $ipv4 = ''
    $gateway = ''
    try {
        $config = Get-NetIPConfiguration -InterfaceIndex $adapter.ifIndex -ErrorAction Stop
        $ipv4 = (@($config.IPv4Address | ForEach-Object { $_.IPAddress }) -join ',')
        $gateway = (@($config.IPv4DefaultGateway | ForEach-Object { $_.NextHop }) -join ',')
    } catch { }
    [pscustomobject]@{
        IfIndex = [int]$adapter.ifIndex
        Name = [string]$adapter.Name
        Status = [string]$adapter.Status
        Hardware = [bool]$adapter.HardwareInterface
        LinkSpeed = [string]$adapter.LinkSpeed
        DefaultRoute = ([int]$adapter.ifIndex -eq $defaultIfIndex)
        IPv4 = $ipv4
        Gateway = $gateway
        Description = [string]$adapter.InterfaceDescription
    }
}
Write-Line ''
Write-Line '========== Adapter Inventory =========='
if (@($inventory).Count -gt 0) {
    Write-Line (($inventory | Format-Table IfIndex,Name,Status,Hardware,LinkSpeed,DefaultRoute,IPv4,Gateway,Description -AutoSize | Out-String -Width 240).TrimEnd())
} else { Write-Line 'No adapters found.' }

$upAdapters = @($adapters | Where-Object { $_.Status -eq 'Up' })
$before = @{}
foreach ($adapter in $upAdapters) {
    $counter = Get-AdapterCounter -Adapter $adapter
    if ($null -ne $counter) { $before[[int]$adapter.ifIndex] = $counter }
}
$osWatch = [System.Diagnostics.Stopwatch]::StartNew()
$apiBefore = Get-HardwareServiceSnapshot
Write-Line ''
Write-Line ('Sampling {0} Up adapters for {1} seconds. Keep Speedtest running.' -f $upAdapters.Count,$SampleSeconds)
Start-Sleep -Seconds $SampleSeconds
$apiAfter = Get-HardwareServiceSnapshot
$after = @{}
foreach ($adapter in $upAdapters) {
    $counter = Get-AdapterCounter -Adapter $adapter
    if ($null -ne $counter) { $after[[int]$adapter.ifIndex] = $counter }
}
$osWatch.Stop()
$elapsed = [math]::Max(0.001, $osWatch.Elapsed.TotalSeconds)

$rates = foreach ($adapter in $upAdapters) {
    $index = [int]$adapter.ifIndex
    if (-not $before.ContainsKey($index) -or -not $after.ContainsKey($index)) { continue }
    $old = $before[$index]
    $new = $after[$index]
    $rxBps = [math]::Max(0, ($new.ReceivedBytes - $old.ReceivedBytes) / $elapsed)
    $txBps = [math]::Max(0, ($new.SentBytes - $old.SentBytes) / $elapsed)
    [pscustomobject]@{
        IfIndex = $index
        Name = [string]$adapter.Name
        IsDefaultRoute = ($index -eq $defaultIfIndex)
        IsHardware = [bool]$adapter.HardwareInterface
        Down_Mbps = [math]::Round($rxBps * 8 / 1000000, 2)
        Up_Mbps = [math]::Round($txBps * 8 / 1000000, 2)
        Down_MBps = [math]::Round($rxBps / 1000000, 2)
        Up_MBps = [math]::Round($txBps / 1000000, 2)
    }
}
Write-Line ''
Write-Line '========== Windows Native Counter Rates =========='
if (@($rates).Count -gt 0) {
    Write-Line (($rates | Sort-Object @{Expression='IsDefaultRoute';Descending=$true}, @{Expression={ $_.Down_Mbps + $_.Up_Mbps };Descending=$true} | Format-Table IfIndex,Name,IsDefaultRoute,IsHardware,Down_Mbps,Up_Mbps,Down_MBps,Up_MBps -AutoSize | Out-String -Width 220).TrimEnd())
} else { Write-Line 'No Windows adapter counters were sampled.' }

Write-Line ''
Write-Line '========== HardwareService API Rates =========='
if ($null -eq $apiBefore -or $null -eq $apiAfter) {
    Write-Line 'HardwareService API unavailable. Ensure NexusMonitor DEV is running.'
} else {
    $apiBeforeById = @{}
    foreach ($network in @($apiBefore.networks)) {
        if ($null -ne $network.id) { $apiBeforeById[[string]$network.id] = $network }
    }
    $apiRows = foreach ($network in @($apiAfter.networks)) {
        $counterDown = $null
        $counterUp = $null
        $id = [string]$network.id
        if ($id -and $apiBeforeById.ContainsKey($id)) {
            $oldNetwork = $apiBeforeById[$id]
            $counterDown = [math]::Round(([double]$network.rxBytes - [double]$oldNetwork.rxBytes) * 8 / $elapsed / 1000000, 2)
            $counterUp = [math]::Round(([double]$network.txBytes - [double]$oldNetwork.txBytes) * 8 / $elapsed / 1000000, 2)
        }
        [pscustomobject]@{
            Name = [string]$network.name
            Type = [string]$network.type
            Status = [string]$network.status
            Physical = [bool]$network.isPhysical
            DefaultRoute = [bool]$network.isDefaultRoute
            CounterDown_Mbps = $counterDown
            CounterUp_Mbps = $counterUp
            ReportedDown_Mbps = [math]::Round([double]$network.rxBytesPerSec * 8 / 1000000, 2)
            ReportedUp_Mbps = [math]::Round([double]$network.txBytesPerSec * 8 / 1000000, 2)
        }
    }
    if (@($apiRows).Count -gt 0) {
        Write-Line (($apiRows | Format-Table -AutoSize | Out-String -Width 240).TrimEnd())
    } else { Write-Line 'API returned no network rows.' }
}

Write-Line ''
Write-Line 'Compare the default-route adapter Windows rates against the same adapter API rates.'
if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
    try {
        $folder = Split-Path -Parent $OutputPath
        if ($folder -and -not (Test-Path -LiteralPath $folder)) { New-Item -ItemType Directory -Path $folder -Force | Out-Null }
        $lines | Set-Content -LiteralPath $OutputPath -Encoding UTF8
        Write-Line ('Report saved to: {0}' -f $OutputPath)
    } catch { Write-Warning ('Could not save report: {0}' -f $_.Exception.Message) }
}
