export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WindowLayoutRequest {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  margin?: number;
  horizontalAnchor?: 'center' | 'right';
  verticalAnchor?: 'center' | 'top';
}

export interface WindowLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

/**
 * Fit a window inside the display work area while keeping its preferred size
 * and never asking Electron for a minimum size larger than the actual window.
 * This avoids off-screen windows on displays with a short work area or taskbar.
 */
export function fitWindowToWorkArea(area: WorkArea, request: WindowLayoutRequest): WindowLayout {
  const margin = Math.max(0, Math.floor(request.margin ?? 24));
  const availableWidth = Math.max(1, Math.floor(area.width - margin * 2));
  const availableHeight = Math.max(1, Math.floor(area.height - margin * 2));
  const width = Math.max(1, Math.min(Math.floor(request.width), availableWidth));
  const height = Math.max(1, Math.min(Math.floor(request.height), availableHeight));
  const minWidth = Math.max(1, Math.min(Math.floor(request.minWidth), width));
  const minHeight = Math.max(1, Math.min(Math.floor(request.minHeight), height));
  const horizontalAnchor = request.horizontalAnchor ?? 'center';
  const verticalAnchor = request.verticalAnchor ?? 'center';
  const x = horizontalAnchor === 'right'
    ? area.x + area.width - width - margin
    : area.x + Math.round((area.width - width) / 2);
  const y = verticalAnchor === 'top'
    ? area.y + margin
    : area.y + Math.round((area.height - height) / 2);

  return { x, y, width, height, minWidth, minHeight };
}
