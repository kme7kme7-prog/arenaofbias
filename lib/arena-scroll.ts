/** 路由的归顶 effect 完成后再定位命题；卸载时取消尚未执行的定位。 */
export function schedulePromptScroll(target: HTMLElement, reducedMotion: boolean) {
  const frame = requestAnimationFrame(() => {
    if (!target.isConnected) return;
    target.scrollIntoView({
      behavior: reducedMotion ? 'instant' : 'smooth',
      block: 'start',
      inline: 'nearest',
    });
  });
  return () => cancelAnimationFrame(frame);
}

/** Body-owned paper follows document scrolling and rebinds to the new route. */
export function alignArenaTransition(layer: HTMLElement) {
  const parts = Array.from(document.querySelectorAll<HTMLElement>(
    '.arena-shell .field-meta, .arena-shell .arena-stage, .arena-shell .round-console',
  ));
  if (!parts.length) return;
  const rects = parts.map(part => part.getBoundingClientRect());
  const top = Math.min(...rects.map(rect => rect.top));
  const bottom = Math.max(...rects.map(rect => rect.bottom));
  const left = Math.min(...rects.map(rect => rect.left));
  const right = Math.max(...rects.map(rect => rect.right));
  // DOMRects and scroll offsets are screen pixels; CSS zoom scales assigned
  // lengths again. Measure this body-owned layer's scale before positioning it.
  const measuredScale = layer.getBoundingClientRect().width / parseFloat(getComputedStyle(layer).width);
  const scale = Number.isFinite(measuredScale) && measuredScale > 0 ? measuredScale : 1;
  Object.assign(layer.style, {
    position: 'absolute', top: `${(top + window.scrollY) / scale}px`,
    left: `${(left + window.scrollX) / scale}px`, right: 'auto', bottom: 'auto',
    width: `${(right - left) / scale}px`, height: `${(bottom - top) / scale}px`,
  });
  // Keep the title in the visible part of long mobile stages, also on scroll.
  const visibleTop = Math.max(0, top);
  const visibleBottom = Math.min(window.innerHeight, bottom);
  layer.style.setProperty('--gt-match-center', `${((visibleTop + visibleBottom) / 2 - top) / scale}px`);
  return { top, bottom };
}
