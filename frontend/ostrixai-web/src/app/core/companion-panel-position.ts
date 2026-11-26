/** Place a responsive Companion panel beside the owl when there is room. */
export interface CompanionPanelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}
export interface CompanionPanelSize { readonly width: number; readonly height: number; }
export interface CompanionPanelPosition { readonly left: number; readonly top: number; }

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/** Pure geometry; no scrolling, network, user data, or global state. */
export function companionPanelPosition(
  avatar: CompanionPanelRect,
  panel: CompanionPanelSize,
  viewport: CompanionPanelSize,
): CompanionPanelPosition {
  const margin = 12;
  const gap = 16;
  const width = Math.min(Math.max(1, panel.width), Math.max(1, viewport.width - 2 * margin));
  const height = Math.min(Math.max(1, panel.height), Math.max(1, viewport.height - 2 * margin));
  const freeLeft = avatar.left - gap - margin;
  const freeRight = viewport.width - margin - avatar.right - gap;
  let left: number;
  if (viewport.width >= 900 && freeLeft >= width) {
    left = avatar.left - gap - width;
  } else if (viewport.width >= 900 && freeRight >= width) {
    left = avatar.right + gap;
  } else if (viewport.width < 900) {
    // No safe side-by-side room: use a compact, scrollable panel above the mascot.
    left = avatar.right - width;
  } else {
    // Narrow desktop: prefer the side with more space, then clamp to the viewport.
    left = freeLeft >= freeRight ? avatar.left - gap - width : avatar.right + gap;
  }
  const desiredTop = viewport.width < 900
    ? avatar.top - height - gap
    : avatar.top + avatar.height / 2 - height / 2;
  return {
    left: Math.round(clamp(left, margin, Math.max(margin, viewport.width - width - margin))),
    top: Math.round(clamp(desiredTop, margin, Math.max(margin, viewport.height - height - margin))),
  };
}
