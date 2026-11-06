/**
 * Electron screen.Display.bounds and BrowserWindow bounds share the desktop
 * coordinate space (DIP). In particular, negative x/y values are valid when
 * a secondary display is positioned above or to the left of the primary one.
 * Do not clamp these coordinates to zero or multiply them by scaleFactor.
 */
export interface UsbDisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveUsbDisplayWindowBounds(bounds: UsbDisplayBounds): UsbDisplayBounds {
  const values = [bounds.x, bounds.y, bounds.width, bounds.height];
  if (!values.every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
    throw new RangeError('USB display bounds must contain finite coordinates and positive dimensions');
  }

  // Copy the exact logical desktop bounds. Negative origins are intentional.
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}
