// The passage and the two real pages share a clock. There is no delayed CSS
// entrance after navigation, and cancellation restores every inline property.
export function prepareReaderBook(stage: HTMLElement | null) {
  const shell = stage?.closest<HTMLElement>('[data-text-theme]');
  if (!stage || !shell || !['forest', 'blackout'].includes(shell.dataset.textTheme ?? '')) return null;
  const pages = [...stage.querySelectorAll<HTMLElement>(':scope > .contender')].map((page, index) => {
    const original = { transform: page.style.transform, transformOrigin: page.style.transformOrigin };
    const shade = document.createElement('span');
    shade.className = `pg-book-fold-shade pg-book-fold-shade-${index}`;
    shade.setAttribute('aria-hidden', 'true'); page.append(shade);
    page.style.transformOrigin = index === 0 ? 'right center' : 'left center';
    return { page, index, original, shade };
  });
  return {
    paint(progress: number) {
      const p = Math.max(0, Math.min(1, progress));
      // Smooth acceleration keeps the fold legible once the doors clear it.
      const eased = p * p * (3 - 2 * p);
      for (const { page, index, shade } of pages) {
        page.style.transform = `perspective(1800px) translateY(${12 * (1 - eased)}px) rotateY(${(index === 0 ? 68 : -68) * (1 - eased)}deg)`;
        shade.style.opacity = String(.23 * (1 - eased));
      }
      stage.dataset.bookOpening = String(p);
    },
    dispose() {
      for (const { page, original, shade } of pages) {
        page.style.transform = original.transform;
        page.style.transformOrigin = original.transformOrigin;
        shade.remove();
      }
      delete stage.dataset.bookOpening;
    },
  };
}
