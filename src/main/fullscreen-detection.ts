export interface NativeRect { left: number; top: number; right: number; bottom: number; }
export interface ForegroundWindowSample {
  handle: string;
  rect: NativeRect;
  monitor: NativeRect;
  widgetMonitor: NativeRect;
}

export function coversMonitor(windowRect: NativeRect, monitorRect: NativeRect, tolerance = 3): boolean {
  return windowRect.left <= monitorRect.left + tolerance
    && windowRect.top <= monitorRect.top + tolerance
    && windowRect.right >= monitorRect.right - tolerance
    && windowRect.bottom >= monitorRect.bottom - tolerance;
}

function sameMonitor(a: NativeRect, b: NativeRect, tolerance = 2): boolean {
  return Math.abs(a.left - b.left) <= tolerance
    && Math.abs(a.top - b.top) <= tolerance
    && Math.abs(a.right - b.right) <= tolerance
    && Math.abs(a.bottom - b.bottom) <= tolerance;
}

export function isFullscreenOnWidgetDisplay(sample: ForegroundWindowSample, ownWindowHandles: readonly string[] = []): boolean {
  if (!sample.handle || ownWindowHandles.includes(sample.handle)) return false;
  return sameMonitor(sample.monitor, sample.widgetMonitor) && coversMonitor(sample.rect, sample.monitor);
}
