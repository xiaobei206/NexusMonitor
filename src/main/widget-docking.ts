import type { WorkArea } from './window-layout';

export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export interface WidgetBounds { x: number; y: number; width: number; height: number; }

export function clampWidgetBounds(bounds: WidgetBounds, area: WorkArea): WidgetBounds {
  const width = Math.max(1, Math.min(Math.round(bounds.width), area.width));
  const height = Math.max(1, Math.min(Math.round(bounds.height), area.height));
  return {
    x: Math.max(area.x, Math.min(Math.round(bounds.x), area.x + area.width - width)),
    y: Math.max(area.y, Math.min(Math.round(bounds.y), area.y + area.height - height)),
    width,
    height,
  };
}

/** Expand a vertical HUD to the left while keeping its original right edge fixed. */
export function expandVerticalWidgetBounds(
  compact: WidgetBounds,
  area: WorkArea,
  width: number,
  height: number,
): WidgetBounds {
  const expandedWidth = Math.max(1, Math.min(Math.round(width), area.width));
  const expandedHeight = Math.max(1, Math.min(Math.round(height), area.height));
  return clampWidgetBounds({
    x: compact.x + compact.width - expandedWidth,
    y: compact.y,
    width: expandedWidth,
    height: expandedHeight,
  }, area);
}

/** Move the saved compact rectangle by the same delta as an expanded HUD drag. */
export function translateWidgetBounds(
  bounds: WidgetBounds,
  deltaX: number,
  deltaY: number,
  area: WorkArea,
): WidgetBounds {
  return clampWidgetBounds({ ...bounds, x: bounds.x + deltaX, y: bounds.y + deltaY }, area);
}

export function resolveDockEdge(bounds: WidgetBounds, area: WorkArea, threshold = 36): DockEdge | null {
  const distances: Array<[DockEdge, number]> = [
    ['left', Math.abs(bounds.x - area.x)],
    ['right', Math.abs(area.x + area.width - (bounds.x + bounds.width))],
    ['top', Math.abs(bounds.y - area.y)],
    ['bottom', Math.abs(area.y + area.height - (bounds.y + bounds.height))],
  ];
  distances.sort((a, b) => a[1] - b[1]);
  return distances[0][1] <= threshold ? distances[0][0] : null;
}

export function dockWidgetBounds(bounds: WidgetBounds, area: WorkArea, edge: DockEdge): WidgetBounds {
  return {
    ...bounds,
    x: edge === 'left' ? area.x : edge === 'right' ? area.x + area.width - bounds.width : bounds.x,
    y: edge === 'top' ? area.y : edge === 'bottom' ? area.y + area.height - bounds.height : bounds.y,
  };
}

export function hideWidgetBounds(bounds: WidgetBounds, area: WorkArea, edge: DockEdge, visiblePixels = 10): WidgetBounds {
  const visible = Math.max(6, Math.min(24, Math.round(visiblePixels)));
  const docked = dockWidgetBounds(bounds, area, edge);
  if (edge === 'left') return { ...docked, x: area.x - bounds.width + visible };
  if (edge === 'right') return { ...docked, x: area.x + area.width - visible };
  if (edge === 'top') return { ...docked, y: area.y - bounds.height + visible };
  return { ...docked, y: area.y + area.height - visible };
}

export function expandDockedWidget(
  bounds: WidgetBounds,
  area: WorkArea,
  edge: DockEdge | null,
  width: number,
  height: number,
  margin = 12,
): WidgetBounds {
  const w = Math.max(1, Math.min(Math.round(width), area.width - margin * 2));
  const h = Math.max(1, Math.min(Math.round(height), area.height - margin * 2));
  const x = edge === 'right'
    ? bounds.x + bounds.width - w
    : edge === 'left'
      ? bounds.x
      : Math.max(area.x + margin, Math.min(bounds.x, area.x + area.width - w - margin));
  const y = edge === 'bottom'
    ? bounds.y + bounds.height - h
    : edge === 'top'
      ? bounds.y
      : Math.max(area.y + margin, Math.min(bounds.y, area.y + area.height - h - margin));
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - w)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - h)),
    width: w,
    height: h,
  };
}

export type WidgetOrientation = 'horizontal' | 'vertical';

export interface WidgetOrientationLayout {
  bounds: WidgetBounds;
  minWidth: number;
  minHeight: number;
}

/**
 * Resize the existing HUD when switching orientation without destroying the
 * BrowserWindow. Preserve the nearest intentional anchor (left/right/top/bottom)
 * or the floating window's center, and always return the canonical compact size.
 */
export function resizeWidgetForOrientation(
  current: WidgetBounds,
  area: WorkArea,
  orientation: WidgetOrientation,
  dockEdge: DockEdge | null,
  margin = 18,
): WidgetOrientationLayout {
  const safeMargin = Math.max(0, Math.floor(margin));
  const availableWidth = Math.max(1, Math.floor(area.width - safeMargin * 2));
  const availableHeight = Math.max(1, Math.floor(area.height - safeMargin * 2));
  const preferredWidth = orientation === 'vertical' ? 340 : 980;
  const preferredHeight = orientation === 'vertical' ? 1200 : 112;
  const width = Math.max(1, Math.min(preferredWidth, availableWidth));
  const height = Math.max(1, Math.min(preferredHeight, availableHeight));
  const rightGap = area.x + area.width - (current.x + current.width);
  const leftGap = current.x - area.x;
  const topGap = current.y - area.y;
  const bottomGap = area.y + area.height - (current.y + current.height);
  const rightAnchored = dockEdge === 'right' || (dockEdge == null && rightGap >= -2 && rightGap <= 42);
  const leftAnchored = dockEdge === 'left' || (dockEdge == null && leftGap >= -2 && leftGap <= 42);
  const topAnchored = dockEdge === 'top' || (dockEdge == null && topGap >= -2 && topGap <= 42);
  const bottomAnchored = dockEdge === 'bottom' || (dockEdge == null && bottomGap >= -2 && bottomGap <= 42);

  let x = current.x + Math.round((current.width - width) / 2);
  let y = current.y + Math.round((current.height - height) / 2);
  if (rightAnchored) x = area.x + area.width - width - Math.max(0, Math.min(rightGap, safeMargin));
  else if (leftAnchored) x = area.x + Math.max(0, Math.min(leftGap, safeMargin));
  // A tall vertical HUD can be within the snap threshold of both top and
  // bottom at once. Prefer the top anchor unless the user explicitly docked
  // to the bottom; otherwise switching to horizontal would jump to the bottom.
  if (dockEdge === 'bottom' || (!topAnchored && bottomAnchored)) y = area.y + area.height - height - Math.max(0, Math.min(bottomGap, safeMargin));
  else if (topAnchored) y = area.y + Math.max(0, Math.min(topGap, safeMargin));

  const bounds = clampWidgetBounds({ x, y, width, height }, area);
  return {
    bounds,
    minWidth: Math.min(orientation === 'vertical' ? 340 : 760, width),
    minHeight: Math.min(orientation === 'vertical' ? 700 : 96, height),
  };
}
