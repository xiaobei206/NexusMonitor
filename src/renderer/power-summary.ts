import type { SensorValue, SystemSnapshot } from '../shared/types';

export type PowerSummaryMode = 'battery-discharge' | 'cpu-gpu' | 'unavailable';
export interface PowerSummary {
  mode: PowerSummaryMode;
  valueW: number | null;
  label: string;
  cpuPowerW: number | null;
  gpuPowerW: number | null;
  platformPowerW: number | null;
  batteryLevelPercent: number | null;
  batteryVoltageV: number | null;
  batteryCurrentA: number | null;
  batteryCapacityMWh: number | null;
  batteryRemainingSeconds: number | null;
  batteryChargeW: number | null;
  componentCount: number;
}

const positive = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) && value > 0 ? value : null;
const finite = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;
const findSensor = (sensors: SensorValue[], hardware: RegExp, kind: string, name: RegExp) =>
  sensors.find(sensor => hardware.test(sensor.hardware)
    && sensor.kind.toLowerCase() === kind.toLowerCase()
    && name.test(sensor.name)
    && finite(sensor.value) != null);

/**
 * Mirrors PowerMon's smart display policy without claiming wall-socket power:
 * when the battery is discharging, show its negative discharge rate; otherwise
 * show only the positive CPU Package + GPU values that LHM actually supplied.
 * Other battery/platform measurements remain separately available in details.
 */
export function resolvePowerSummary(snapshot: Pick<SystemSnapshot, 'cpu' | 'gpus' | 'sensors'> | null | undefined): PowerSummary {
  const sensors = snapshot?.sensors ?? [];
  const batteryHardware = /battery/i;
  const discharge = findSensor(sensors, batteryHardware, 'Power', /discharge/i);
  const batteryDischargeW = discharge && finite(discharge.value)! < 0 ? finite(discharge.value)! : null;
  const chargeSensor = findSensor(sensors, batteryHardware, 'Power', /charge/i);
  const batteryChargeW = chargeSensor ? positive(chargeSensor.value) : null;

  const cpuPowerW = positive(snapshot?.cpu?.powerW);
  const gpuSnapshots = snapshot?.gpus ?? [];
  const gpuParts = gpuSnapshots.map(gpu => positive(gpu.powerW)).filter((value): value is number => value != null);
  const gpuPowerW = gpuParts.length ? gpuParts.reduce((total, value) => total + value, 0) : null;
  // Intel integrated-GPU power is generally a sub-domain of CPU Package power.
  // Keep its individual reading visible, but do not add it a second time to the
  // combined CPU/GPU headline. Discrete GPUs remain additive.
  const integratedIntelGpu = gpuSnapshots.some(gpu =>
    /gpuintel/i.test(gpu.hardwareType ?? '') && /\b(iris|uhd|hd graphics)\b/i.test(gpu.name ?? '') && positive(gpu.powerW) != null);
  const componentCount = (cpuPowerW == null ? 0 : 1) + (gpuParts.length && !(integratedIntelGpu && cpuPowerW != null) ? gpuParts.length : 0);
  const headlinePowerW = integratedIntelGpu && cpuPowerW != null ? cpuPowerW : (cpuPowerW ?? 0) + (gpuPowerW ?? 0);
  const headlineLabel = integratedIntelGpu && cpuPowerW != null ? 'CPU Package（已包含核显功耗域）' : 'CPU + GPU 已读功耗合计';

  const batteryLevel = findSensor(sensors, batteryHardware, 'Level', /charge|level|capacity/i)
    ?? findSensor(sensors, batteryHardware, 'Load', /charge|level|capacity/i);
  const batteryVoltage = findSensor(sensors, batteryHardware, 'Voltage', /battery|voltage/i);
  const batteryCurrent = findSensor(sensors, batteryHardware, 'Current', /battery|charge|discharge/i);
  const batteryCapacity = findSensor(sensors, batteryHardware, 'Energy', /remaining capacity|full charge capacity|capacity/i);
  const batteryRemaining = findSensor(sensors, batteryHardware, 'TimeSpan', /remaining|time to empty|time to full/i);
  const platformPower = findSensor(sensors, /power.?monitor|psu|power supply/i, 'Power', /platform|system|total|output/i);

  const shared = {
    cpuPowerW,
    gpuPowerW,
    platformPowerW: positive(platformPower?.value),
    batteryLevelPercent: finite(batteryLevel?.value),
    batteryVoltageV: positive(batteryVoltage?.value),
    batteryCurrentA: finite(batteryCurrent?.value),
    batteryCapacityMWh: positive(batteryCapacity?.value),
    batteryRemainingSeconds: positive(batteryRemaining?.value),
    batteryChargeW,
    componentCount,
  };

  if (batteryDischargeW != null) {
    return { mode: 'battery-discharge', valueW: batteryDischargeW, label: '电池放电功率', ...shared };
  }

  if (componentCount > 0) {
    return {
      mode: 'cpu-gpu',
      valueW: headlinePowerW,
      label: headlineLabel,
      ...shared,
    };
  }

  return {
    mode: 'unavailable', valueW: null, label: '暂无有效功耗传感器', ...shared,
  };
}
