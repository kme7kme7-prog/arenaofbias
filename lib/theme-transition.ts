type Request = { theme: 'paper' | 'ink'; commit: () => void };
let pending: Request | undefined;
let layer: HTMLDivElement | undefined;
let animation: Animation | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let generation = 0;

/** Only the opaque material moves. No page snapshot, text opacity or root transform. */
export function finishThemeTransition() {
  generation++;
  clearTimeout(timer);
  timer = undefined;
  cancelAnimationFrame(frame);
  frame = 0;
  animation?.cancel();
  animation = undefined;
  layer?.remove();
  layer = undefined;
  document.documentElement.removeAttribute('data-theme-changing');
  const latest = pending;
  pending = undefined;
  latest?.commit();
}

export function transitionTheme(request: Request, animate = true) {
  pending = request;
  if (
    !animate ||
    document.hidden ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    finishThemeTransition();
    return;
  }
  if (layer || timer) return;
  const revision = ++generation;
  const run = () => {
    timer = undefined;
    if (revision !== generation || !pending) return;
    // Route curtains own their ready gate. Never cover or release it from here.
    if (
      document.querySelector(
        '.game-transition, .page-wipe, .phase-transition .transition-shutter, .shutter-exit .transition-shutter',
      )
    ) {
      timer = setTimeout(run, 50);
      return;
    }
    const target = pending.theme;
    if (document.documentElement.dataset.theme === target) {
      const latest = pending;
      pending = undefined;
      latest.commit();
      return;
    }
    layer = document.createElement('div');
    layer.className = 'theme-curtain';
    layer.dataset.phase = 'prepare';
    layer.dataset.destination = target;
    layer.setAttribute('aria-hidden', 'true');
    const plate = document.createElement('div');
    plate.className = 'theme-curtain-plate';
    const sign = target === 'ink' ? 1 : -1;
    plate.style.transform = `translateX(${sign * 103}%)`;
    layer.append(plate);
    document.body.append(layer);
    const cover = target === 'ink' ? 240 : 210;
    const startCover = () => {
      frame = 0;
      if (revision !== generation || !layer) return;
      layer.dataset.phase = 'cover';
      animation = plate.animate(
        [
          { transform: `translateX(${sign * 103}%)` },
          { transform: 'translateX(0)' },
        ],
        {
          duration: cover,
          easing: 'cubic-bezier(.65,0,.25,1)',
          fill: 'forwards',
        },
      );
      void animation.finished
        .then(() => {
          if (revision !== generation || !pending || !layer) return;
          const latest = pending;
          pending = undefined;
          layer.dataset.phase = 'settle';
          layer.dataset.destination = latest.theme;
          document.documentElement.dataset.themeChanging = 'true';
          latest.commit();
          timer = setTimeout(
            () => {
              timer = undefined;
              if (revision !== generation) return;
              // Restore hover rules while still covered, and allow the new surface to paint.
              document.documentElement.removeAttribute('data-theme-changing');
              frame = requestAnimationFrame(() => {
                frame = requestAnimationFrame(() => {
                  frame = 0;
                  if (revision !== generation) return;
                  if (layer) layer.dataset.phase = 'reveal';
                  animation?.cancel();
                  animation = plate.animate(
                    [
                      { transform: 'translateX(0)' },
                      { transform: `translateX(${-sign * 103}%)` },
                    ],
                    {
                      duration: target === 'ink' ? 260 : 230,
                      easing: 'cubic-bezier(.3,0,.25,1)',
                      fill: 'forwards',
                    },
                  );
                  void animation.finished
                    .then(() => {
                      if (revision !== generation) return;
                      layer?.remove();
                      layer = undefined;
                      animation = undefined;
                      if (pending) transitionTheme(pending);
                    })
                    .catch(() => {});
                });
              });
            },
            target === 'ink' ? 160 : 140,
          );
        })
        .catch(() => {});
    };
    // Allocate the decoration's compositor layer before starting its timed sweep.
    // The toggle already reflects the requested preference during this preparation.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(startCover);
    });
  };
  run();
}
