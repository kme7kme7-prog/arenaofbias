// Carry the previous arena's viewport sizes across a keyed route remount.
let previousHeights: number[] | null = null;

export function captureArenaLayout() {
  const views = document.querySelectorAll<HTMLElement>('.arena-shell .work-viewport');
  previousHeights = views.length === 2 ? Array.from(views, view => view.clientHeight) : null;
}

export function animateArenaLayout(stage: HTMLElement | null, reduced: boolean) {
  const heights = previousHeights;
  previousHeights = null;
  if (!stage || !heights || reduced) return;
  const views = Array.from(stage.querySelectorAll<HTMLElement>('.work-viewport'));
  const tracks: Animation[] = [];
  const restored: Array<() => void> = [];
  // Measure every destination before pinning any source size (grid rows interact).
  const targets = views.map(view => view.clientHeight);
  views.forEach((view, index) => {
    const start = heights[index];
    const end = targets[index];
    if (!start || !end || Math.abs(start - end) < 1) return;
    const originalHeight = view.style.height;
    const originalTransition = view.style.transition;
    view.style.transition = 'none';
    view.style.height = `${start}px`;
    restored.push(() => {
      view.style.height = originalHeight;
      // Commit the natural endpoint before restoring the ordinary resize rule.
      void view.offsetHeight;
      view.style.transition = originalTransition;
    });
    tracks.push(view.animate([{ height: `${start}px` }, { height: `${end}px` }], {
      duration: 520, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both',
    }));
  });
  if (!tracks.length) return;
  stage.dataset.layoutMoving = 'true';
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    tracks.forEach(track => track.cancel());
    restored.forEach(restore => restore());
    delete stage.dataset.layoutMoving;
    window.removeEventListener('resize', finish);
  };
  window.addEventListener('resize', finish, { once: true });
  void Promise.all(tracks.map(track => track.finished)).then(finish, finish);
  return finish;
}
