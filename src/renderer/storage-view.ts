import type { DiskSnapshot, SystemSnapshot, VolumeSnapshot } from '../shared/types';

const normalizeVolumeName = (value: string | null | undefined) =>
  (value ?? '').trim().replace(/[\\/]+$/, '').toUpperCase();

export interface VolumeUsage {
  volumes: VolumeSnapshot[];
  names: string[];
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  percent: number;
}

/** Aggregate only volumes that Windows has explicitly mapped to the physical disk. */
export function getDiskVolumeUsage(snapshot: SystemSnapshot | null | undefined, disk: DiskSnapshot | null | undefined): VolumeUsage | null {
  if (!snapshot || !disk) return null;
  const volumes = snapshot.volumes ?? [];
  let matched = volumes.filter(v => (v.diskIds ?? []).includes(disk.id));
  if (!matched.length) {
    const volumeNames = new Set((disk.volumeNames ?? []).map(normalizeVolumeName).filter(Boolean));
    matched = volumes.filter(v => volumeNames.has(normalizeVolumeName(v.name)));
  }
  // Do not guess from volume order or physical-disk capacity. An unmapped disk has no reliable volume total.
  matched = matched.filter(v => v.totalBytes > 0 && Number.isFinite(v.totalBytes) && Number.isFinite(v.usedBytes));
  if (!matched.length) return null;
  const unique = new Map<string, VolumeSnapshot>();
  for (const volume of matched) unique.set(normalizeVolumeName(volume.name), volume);
  const selected = [...unique.values()];
  const totalBytes = selected.reduce((sum, v) => sum + v.totalBytes, 0);
  const usedBytes = selected.reduce((sum, v) => sum + Math.max(0, Math.min(v.totalBytes, v.usedBytes)), 0);
  if (totalBytes <= 0) return null;
  return {
    volumes: selected,
    names: selected.map(v => normalizeVolumeName(v.name)).filter(Boolean),
    totalBytes,
    usedBytes,
    availableBytes: Math.max(0, totalBytes - usedBytes),
    percent: Math.max(0, Math.min(100, usedBytes / totalBytes * 100)),
  };
}

export function getSystemVolume(snapshot: SystemSnapshot | null | undefined): VolumeSnapshot | null {
  return (snapshot?.volumes ?? []).find(volume => /^C:$/i.test(normalizeVolumeName(volume.name))) ?? null;
}
