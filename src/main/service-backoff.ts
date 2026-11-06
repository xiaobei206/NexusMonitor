export const SERVICE_RESTART_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000] as const;

/**
 * Returns the delay for a restart attempt. `null` means the retry budget is
 * exhausted and the UI should show a terminal failure until the user restarts.
 */
export function restartDelayMs(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= SERVICE_RESTART_DELAYS_MS.length) {
    return null;
  }
  return SERVICE_RESTART_DELAYS_MS[attempt];
}
