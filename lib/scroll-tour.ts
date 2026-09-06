/** Scroll a focused work at a reading pace; cancellation never leaves a live frame. */
export function scrollWorkToBottom(
  element: HTMLElement,
  signal: AbortSignal,
  pixelsPerSecond: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Work tour cancelled', 'AbortError'));
      return;
    }
    const distance = Math.max(0, element.scrollHeight - element.clientHeight);
    element.scrollTop = 0;
    if (distance <= 1) {
      resolve();
      return;
    }

    const duration = Math.max(2800, (distance / pixelsPerSecond) * 1000);
    let frame = 0;
    let elapsed = 0;
    let previousTime: number | undefined;
    const abort = () => {
      cancelAnimationFrame(frame);
      signal.removeEventListener('abort', abort);
      reject(new DOMException('Work tour cancelled', 'AbortError'));
    };
    const tick = (now: number) => {
      if (signal.aborted) return;
      // A background tab must not jump over the work when its frames resume.
      if (previousTime !== undefined)
        elapsed += Math.min(now - previousTime, 64);
      previousTime = now;
      const progress = Math.min(1, elapsed / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const currentDistance = Math.max(
        0,
        element.scrollHeight - element.clientHeight,
      );
      element.scrollTop = currentDistance * eased;
      if (progress === 1) {
        signal.removeEventListener('abort', abort);
        resolve();
      } else {
        frame = requestAnimationFrame(tick);
      }
    };
    signal.addEventListener('abort', abort, { once: true });
    frame = requestAnimationFrame(tick);
  });
}
