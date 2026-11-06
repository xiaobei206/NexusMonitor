export interface WidgetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WidgetWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type WidgetDetailOrientation = 'horizontal' | 'vertical';
export type WidgetDetailPlacement = 'left' | 'right' | 'below' | 'above';

export interface WidgetDetailLayout {
  bounds: WidgetRect;
  placement: WidgetDetailPlacement;
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(value, Math.max(low, high)));
}

/**
 * Place the detail card in its own BrowserWindow next to the compact HUD.
 * The compact window is never resized or moved when a card is opened/closed.
 */
export function calculateWidgetDetailLayout(
  compact: WidgetRect,
  area: WidgetWorkArea,
  orientation: WidgetDetailOrientation,
  margin = 12,
): WidgetDetailLayout {
  const m = Math.max(0, Math.floor(margin));
  const rightEdge = area.x + area.width;
  const bottomEdge = area.y + area.height;
  const maxWidth = Math.max(1, area.width - m * 2);
  const maxHeight = Math.max(1, area.height - m * 2);

  if (orientation === 'vertical') {
    const preferredPanelWidth = Math.min(740, maxWidth);
    const leftSpace = Math.max(0, compact.x - area.x - m);
    const rightSpace = Math.max(0, rightEdge - (compact.x + compact.width) - m);
    const placeLeft = leftSpace >= Math.min(420, preferredPanelWidth) || leftSpace >= rightSpace;
    const sideSpace = placeLeft ? leftSpace : rightSpace;
    const width = Math.max(1, Math.min(preferredPanelWidth, sideSpace || maxWidth));
    // Match the compact HUD's vertical span exactly whenever possible. This is a
    // separate native window, so aligning top/bottom avoids a visible seam while
    // still clamping safely when the compact window itself extends past the work area.
    const height = Math.max(1, Math.min(compact.height, area.height));
    const rawX = placeLeft ? compact.x - width : compact.x + compact.width;
    const x = clamp(rawX, area.x + m, rightEdge - m - width);
    const y = clamp(compact.y, area.y, bottomEdge - height);
    return { bounds: { x, y, width, height }, placement: placeLeft ? 'left' : 'right' };
  }

  const width = Math.max(1, Math.min(compact.width, maxWidth));
  const preferredHeight = Math.min(520, maxHeight);
  const x = clamp(compact.x, area.x + m, rightEdge - m - width);
  const belowSpace = Math.max(0, bottomEdge - m - (compact.y + compact.height));
  const aboveSpace = Math.max(0, compact.y - (area.y + m));
  const placeBelow = belowSpace >= Math.min(300, preferredHeight) || belowSpace >= aboveSpace;
  const height = Math.max(1, Math.min(preferredHeight, placeBelow ? (belowSpace || maxHeight) : (aboveSpace || maxHeight)));
  const y = placeBelow
    ? clamp(compact.y + compact.height, area.y + m, bottomEdge - m - height)
    : clamp(compact.y - height, area.y + m, bottomEdge - m - height);
  return { bounds: { x, y, width, height }, placement: placeBelow ? 'below' : 'above' };
}
