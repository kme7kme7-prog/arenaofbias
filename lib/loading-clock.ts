/** Background tabs can suspend work rendering; that time is not a failed load. */
export function createLoadingClock() {
  let elapsed = 0;
  let previous = performance.now();
  let visible = !document.hidden;
  const now = () => {
    const stamp = performance.now();
    if (visible) elapsed += stamp - previous;
    previous = stamp;
    return elapsed;
  };
  const onVisibility = () => {
    now();
    visible = !document.hidden;
  };
  document.addEventListener('visibilitychange', onVisibility);
  return { now, dispose: () => document.removeEventListener('visibilitychange', onVisibility) };
}
