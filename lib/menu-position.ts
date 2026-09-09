interface AnchorRect {
  top: number;
  bottom: number;
  right: number;
}
interface Size {
  width: number;
  height: number;
}

/** Viewport coordinates, independent of the account list's scroll container. */
export function menuPosition(anchor: AnchorRect, menu: Size, viewport: Size) {
  const margin = 8;
  const gap = 6;
  const below = anchor.bottom + gap;
  const preferredTop =
    below + menu.height <= viewport.height - margin ? below : anchor.top - menu.height - gap;
  return {
    top: Math.max(margin, Math.min(preferredTop, viewport.height - menu.height - margin)),
    left: Math.max(
      margin,
      Math.min(anchor.right - menu.width, viewport.width - menu.width - margin),
    ),
  };
}
