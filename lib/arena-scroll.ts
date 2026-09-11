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
