export interface TuringDeviceCandidate {
  port?: string | null;
  isTuring?: boolean | null;
}

/**
 * Resolve the startup connection target without ever selecting an unrelated
 * serial port. Prefer the user's saved port, then fall back to the first
 * device positively identified as a Turing display.
 */
export function findTuringAutoConnectPort(
  devices: readonly TuringDeviceCandidate[],
  preferredPort?: string | null,
): string | null {
  const identified = devices.filter(
    (device): device is TuringDeviceCandidate & { port: string; isTuring: true } =>
      device.isTuring === true && typeof device.port === 'string' && device.port.trim().length > 0,
  );
  if (identified.length === 0) return null;

  const preferred = preferredPort?.trim();
  if (preferred) {
    const match = identified.find(device => device.port.toUpperCase() === preferred.toUpperCase());
    if (match) return match.port;
  }
  return identified[0].port;
}
