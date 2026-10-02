/** The cross-site gate owns loading and failure. This only unfolds the ready Hero. */
export function prepareHeroArrival(root: HTMLElement) {
  const gate = window.ArenaEntry;
  if (!gate || gate.phase === 'done' || gate.phase === 'failed') return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const archive = root.querySelector<HTMLElement>('.hr-archive')!;
  const animations: Animation[] = [];
  let disposed = false;
  let started = false;
  let revealFrame = 0;
  const previousInert = archive.inert;
  archive.inert = true;
  root.dataset.heroArrival = 'waiting';

  const finish = () => {
    for (const animation of animations.splice(0)) animation.cancel();
    archive.inert = previousInert;
    root.dataset.heroArrival = 'done';
  };
  const animate = (element: Element, frames: Keyframe[], duration: number, delay = 0) => {
    const animation = element.animate(frames, { duration, delay, fill: 'both', easing: 'linear' });
    animation.id = `hero-arrival-${animations.length}`;
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  };
  const ease = 'cubic-bezier(.16,1,.3,1)';

  if (!reduced.matches) {
    // Flat sibling compositing remains intact: move whole cards, never their faces.
    root.querySelectorAll<HTMLElement>('.hr-file').forEach(card => {
      const slot = card.dataset.position;
      const target = getComputedStyle(card).transform;
      const back = slot === 'previous';
      const active = slot === 'active';
      const stack = `translate3d(${active ? 100 : back ? 83 : 117}px, 115px, -220px) rotateY(-78deg) rotateZ(20deg) scale(.72)`;
      // Approach the resting pose directly; an oversized intermediate pose
      // would make the cards visibly shrink back during the final quarter.
      animate(card, [
        { transform: stack, offset: 0, easing: 'cubic-bezier(.5,0,.75,.35)' },
        { transform: 'translate3d(100px, 76px, -150px) rotateY(-65deg) rotateZ(10deg) scale(.83)', offset: .17, easing: ease },
        { transform: target, offset: 1 },
      ], active ? 1250 : 1100, back ? 0 : active ? 100 : 55);
    });

    const field = root.querySelector<HTMLElement>('.hr-field')!;
    animate(field, [
      { opacity: 0, scale: '.86', translate: '70px 45px', easing: ease },
      { opacity: getComputedStyle(field).opacity, scale: '1', translate: '0 0' },
    ], 1150, 40);
    root.querySelectorAll<HTMLElement>('.hr-copy > *, .hr-archive-heading, .hr-archive-bottom, .hr-stage-note, .hr-stage-cross').forEach((element, index) => {
      const title = element.tagName === 'H1';
      const actions = element.classList.contains('hr-actions');
      const opacity = getComputedStyle(element).opacity;
      animate(element, [
        { opacity: 0, translate: title ? '-38px 65px' : '0 28px', rotate: title ? '-4deg' : '0deg', scale: actions ? '.94' : '1', offset: 0, easing: ease },
        { opacity, translate: title ? '4px -5px' : '0 -2px', rotate: title ? '.7deg' : '0deg', scale: actions ? '1.02' : '1', offset: .7, easing: 'ease-out' },
        { opacity, translate: '0 0', rotate: '0deg', scale: '1', offset: 1 },
      ], title ? 850 : 650, Math.min(index * 65, 420));
    });
  }

  const play = () => {
    if (disposed || started || !['revealing', 'done'].includes(gate.phase)) return;
    started = true;
    if (reduced.matches) { finish(); return; }
    root.dataset.heroArrival = 'running';
    animations.forEach(animation => animation.play());
    // Cancellation is normal on route changes, reduced-motion changes and teardown.
    void Promise.all(animations.map(animation => animation.finished.catch(() => {})))
      .then(() => { if (!disposed) finish(); });
  };
  // Follow the actual eased cover position, including pauses/slow playback.
  // Observing its first-paint attribute avoids changing the shared Gallery protocol.
  const followReveal = () => {
    if (disposed || started || gate.phase !== 'revealing') return;
    const cover = document.getElementById('site-entry-cover');
    const progress = cover?.getAnimations()[0]?.effect?.getComputedTiming().progress;
    if (typeof progress === 'number' && progress >= .25) { play(); return; }
    revealFrame = requestAnimationFrame(followReveal);
  };
  const observeReveal = new MutationObserver(() => {
    if (gate.phase === 'revealing' && !revealFrame) followReveal();
  });
  observeReveal.observe(document.documentElement, { attributes: true, attributeFilter: ['data-entry'] });
  if (gate.phase === 'revealing') followReveal();
  const onPreference = () => { if (reduced.matches) finish(); };
  window.addEventListener('portal-entry-done', play);
  reduced.addEventListener('change', onPreference);
  return () => {
    disposed = true;
    cancelAnimationFrame(revealFrame);
    observeReveal.disconnect();
    window.removeEventListener('portal-entry-done', play);
    reduced.removeEventListener('change', onPreference);
    finish();
    delete root.dataset.heroArrival;
  };
}
