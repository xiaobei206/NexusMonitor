import type { DiskSnapshot, NetworkSnapshot, SystemSnapshot } from '../shared/types';

const isSystemDrive = (name: string | null | undefined) => /^C:\\?$/i.test((name ?? '').trim());

/** Pick the disk backing the Windows C: volume. Avoid guessing when multiple disks
 * exist but Windows has not returned a volume-to-disk association yet. */
export function selectTuringDisk(snapshot: SystemSnapshot | null, preferredId = 'auto'): DiskSnapshot | null {
  const disks = snapshot?.disks ?? [];
  if (!disks.length) return null;
  if (preferredId !== 'auto') return disks.find(disk => disk.id === preferredId) ?? null;

  const systemVolume = (snapshot?.volumes ?? []).find(volume => isSystemDrive(volume.name));
  const mappedIds = new Set(systemVolume?.diskIds ?? []);
  const mapped = disks.find(disk => mappedIds.has(disk.id) || (disk.volumeNames ?? []).some(isSystemDrive));
  if (mapped) return mapped;
  return disks.length === 1 ? disks[0] : null;
}

const VIRTUAL_ADAPTER_HINTS = /tailscale|wintun|wireguard|tap-windows|openvpn|zerotier|hyper-v|virtual ethernet|vmware|virtualbox|docker|loopback|npcap|bluetooth|hamachi|utun/i;

function isPhysicalCandidate(network: NetworkSnapshot): boolean {
  if (network.isPhysical === false) return false;
  if (network.isPhysical === true) return true;
  if (!['Ethernet', 'Wireless80211'].includes(network.type)) return false;
  return !VIRTUAL_ADAPTER_HINTS.test(`${network.name} ${network.description}`);
}

/** Select the Windows primary-route physical NIC by default, not the busiest
 * virtual/tunnel adapter. Explicit saved choices are restricted to physical NICs. */
export function selectTuringNetwork(snapshot: SystemSnapshot | null, preferredId = 'auto'): NetworkSnapshot | null {
  const networks = snapshot?.networks ?? [];
  if (preferredId !== 'auto') return networks.find(network => network.id === preferredId && network.status === 'Up' && isPhysicalCandidate(network)) ?? null;

  const active = networks.filter(network => network.status === 'Up' && isPhysicalCandidate(network));
  if (!active.length) return null;
  return [...active].sort((a, b) => {
    const routeA = a.isDefaultRoute ? 1 : 0;
    const routeB = b.isDefaultRoute ? 1 : 0;
    if (routeA !== routeB) return routeB - routeA;
    const gatewayA = a.hasGateway ? 1 : 0;
    const gatewayB = b.hasGateway ? 1 : 0;
    if (gatewayA !== gatewayB) return gatewayB - gatewayA;
    const trafficA = Math.max(0, a.rxBytesPerSec) + Math.max(0, a.txBytesPerSec);
    const trafficB = Math.max(0, b.rxBytesPerSec) + Math.max(0, b.txBytesPerSec);
    if (trafficA !== trafficB) return trafficB - trafficA;
    const ethernetA = a.type === 'Ethernet' ? 1 : 0;
    const ethernetB = b.type === 'Ethernet' ? 1 : 0;
    return ethernetB - ethernetA || a.name.localeCompare(b.name);
  })[0] ?? null;
}

/** Empty selection means the single automatic primary NIC. Multiple adapters
 * are summed only after the user explicitly chooses them. ['__none__'] means none. */
export function selectNetworkInterfaces(snapshot: SystemSnapshot | null, selectedIds: string[] = []): NetworkSnapshot[] {
  const networks = snapshot?.networks ?? [];
  if (selectedIds.includes('__none__')) return [];
  if (selectedIds.length > 0) return networks.filter(network => selectedIds.includes(network.id) && network.status === 'Up' && isPhysicalCandidate(network));
  const primary = selectTuringNetwork(snapshot);
  return primary ? [primary] : [];
}

/** Prefer the Intel GPU on the compact display (the user's i9-12900H iGPU),
 * without changing the main dashboard's existing GPU ordering. */
export function selectTuringGpu(snapshot: SystemSnapshot | null) {
  const gpus = snapshot?.gpus ?? [];
  return gpus.find(gpu => gpu.hardwareType === 'GpuIntel' || /intel/i.test(gpu.name)) ?? gpus[0] ?? null;
}
