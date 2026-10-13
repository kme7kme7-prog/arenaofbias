// Short, local menu demonstrations. No game engine, requests or persistent state.
export const PREVIEW_DURATION = { tanks: 2100, guess: 2000 };
const TIMING_SCALE = 0.5;

function guessTracks(scene, add) {
  const palette = Object.fromEntries(
    ['hit', 'near', 'miss'].map((name) => {
      const style = getComputedStyle(
        scene.querySelector(`.clue-row:not(.clue-hidden) .${name}`),
      );
      return [
        name,
        {
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
        },
      ];
    }),
  );
  scene.querySelectorAll('.clue-cell').forEach((cell, index) => {
    const color =
      palette[
        ['hit', 'near', 'miss'].find((name) => cell.classList.contains(name))
      ];
    const row = Math.floor(index / 7);
    add(
      cell,
      [
        {
          backgroundColor: 'transparent',
          color: 'transparent',
          borderStyle: 'dashed',
          transform: 'perspective(500px) rotateX(0deg)',
        },
        {
          backgroundColor: 'transparent',
          color: 'transparent',
          borderStyle: 'dashed',
          transform: 'perspective(500px) rotateX(-80deg)',
          offset: 0.42,
        },
        {
          ...color,
          borderStyle: 'solid',
          transform: 'perspective(500px) rotateX(12deg)',
          offset: 0.72,
        },
        {
          ...color,
          borderStyle: 'solid',
          transform: 'perspective(500px) rotateX(0deg)',
        },
      ],
      460,
      180 + row * 1320 + (index % 7) * 100,
    );
  });
}

function tankTracks(scene, add, decorate) {
  const map = scene.querySelector('.tank-map');
  const percent = (cell) => `${(cell / 12) * 100}%`;
  /** @type {[string, number, number, number, number, number, number, number, number][]} */
  const positions = [
    ['a', 2.5, 4.5, 5.5, 4.5, 0, 90, 100, 1450],
    ['b', 8.5, 9.5, 6.5, 9.5, -90, -90, 600, 1400],
    ['c', 1.5, 9.5, 1.5, 7.5, 0, 0, 400, 1250],
    ['d', 7.5, 5.5, 7.5, 8.5, 90, 180, 220, 1500],
  ];
  for (const [
    id,
    x,
    y,
    endX,
    endY,
    angle,
    endAngle,
    delay,
    duration,
  ] of positions) {
    const tank = scene.querySelector(`.tank-${id}`);
    const start = { left: percent(x), top: percent(y), rotate: `${angle}deg` };
    add(
      tank,
      [
        start,
        { ...start, rotate: `${endAngle}deg`, offset: 0.22 },
        { left: percent(endX), top: percent(endY), rotate: `${endAngle}deg` },
      ],
      duration,
      delay,
    );
    add(
      tank.querySelector('span'),
      [
        { rotate: `${-angle}deg` },
        { rotate: `${-endAngle}deg`, offset: 0.22 },
        { rotate: `${-endAngle}deg` },
      ],
      duration,
      delay,
    );
  }
  // Both lanes end on a visible brick face: no shots travel through walls.
  for (const [id, shotClass, x1, x2, y, fire, flight, brick] of [
    ['a', '.shot-one', 6.05, 9, 4.5, 1720, 620, 57],
    ['b', '.shot-two', 5.95, 5, 9.5, 2800, 300, 112],
  ]) {
    const tank = scene.querySelector(`.tank-${id}`);
    const shot = scene.querySelector(shotClass);
    add(
      shot,
      [
        { left: percent(x1), top: percent(y), opacity: 0, offset: 0 },
        { left: percent(x1), top: percent(y), opacity: 1, offset: 0.01 },
        { left: percent(x2), top: percent(y), opacity: 1, offset: 0.99 },
        { left: percent(x2), top: percent(y), opacity: 0 },
      ],
      flight,
      fire,
      'linear',
    );
    const muzzle = decorate(tank, 'preview-muzzle');
    add(
      muzzle,
      [
        { opacity: 0, scale: 0.4 },
        { opacity: 1, scale: 1.3, offset: 0.2 },
        { opacity: 0, scale: 0.7 },
      ],
      180,
      fire,
    );
    add(
      tank.querySelector('.tank-body'),
      [
        { transform: 'translateY(0)' },
        { transform: 'translateY(4px)', offset: 0.2 },
        { transform: 'translateY(0)' },
      ],
      220,
      fire,
    );
    const impact = decorate(map, 'preview-impact');
    impact.style.left = percent(x2);
    impact.style.top = percent(y);
    add(
      impact,
      [
        { opacity: 0, scale: 0.25 },
        { opacity: 0.9, scale: 0.7, offset: 0.1 },
        { opacity: 0, scale: 1.8 },
      ],
      420,
      fire + flight,
    );
    for (let index = 0; index < 5; index++) {
      const chip = decorate(map, 'preview-chip');
      chip.style.left = percent(x2);
      chip.style.top = percent(y);
      const direction = x1 < x2 ? -1 : 1;
      add(
        chip,
        [
          { opacity: 0, transform: 'translate(0, 0) rotate(0deg)' },
          {
            opacity: 1,
            transform: 'translate(0, 0) rotate(0deg)',
            offset: 0.04,
          },
          {
            opacity: 0,
            transform: `translate(${direction * (12 + index * 5)}px, ${(index - 2) * 12}px) rotate(${90 + index * 35}deg)`,
          },
        ],
        440 + index * 30,
        fire + flight,
      );
    }
    const tile = map.querySelectorAll('.map-tile')[brick];
    add(
      tile,
      [
        { filter: 'brightness(1)' },
        { filter: 'brightness(1.5)', offset: 0.18 },
        { filter: 'brightness(1)' },
      ],
      280,
      fire + flight,
    );
  }
}

export function mountPreviewMotion(scene, mode, { reduced, language = 'zh' }) {
  if (!PREVIEW_DURATION[mode]) return null;
  const tracks = [];
  const decorations = [];
  const originals = new Map();
  const button = scene.querySelector(`[data-action="${mode}"]`);
  const remember = (element) => {
    if (!originals.has(element))
      originals.set(element, element.getAttribute('style'));
  };
  const add = (
    element,
    frames,
    duration,
    delay = 0,
    easing = 'cubic-bezier(.22,.75,.18,1)',
  ) => {
    remember(element);
    tracks.push({
      element,
      frames,
      duration: duration * TIMING_SCALE,
      delay: delay * TIMING_SCALE,
      easing,
    });
  };
  const decorate = (parent, className) => {
    const element = document.createElement('i');
    element.className = className;
    element.setAttribute('aria-hidden', 'true');
    parent.append(element);
    decorations.push(element);
    return element;
  };
  if (mode === 'guess') guessTracks(scene, add);
  else tankTracks(scene, add, decorate);
  scene.dataset.previewMotion = mode;
  button.firstChild.textContent =
    language === 'en' ? 'Replay preview' : '重播演示';
  button.removeAttribute('aria-pressed');
  let animations = [];
  let generation = 0;
  let disposed = false;
  let inView = true;

  function cancel() {
    generation++;
    animations.forEach((animation) => animation.cancel());
    animations = [];
  }

  function finish() {
    cancel();
    for (const { element, frames } of tracks) {
      const { offset: _offset, ...last } = frames.at(-1);
      Object.assign(element.style, last);
    }
    scene.dataset.playback = 'done';
  }

  function syncVisibility() {
    if (!animations.length) return;
    const hidden = document.hidden || !inView;
    // Do not call play() on completed tracks: that would rewind early shots on return.
    animations.forEach((animation) => {
      if (hidden && animation.playState === 'running') animation.pause();
      else if (!hidden && animation.playState === 'paused') animation.play();
    });
    scene.dataset.playback = hidden ? 'paused' : 'playing';
  }

  function play() {
    if (disposed) return;
    cancel();
    if (reduced.matches) {
      finish();
      return;
    }
    const version = generation;
    animations = tracks.map(({ element, frames, duration, delay, easing }) =>
      element.animate(frames, { duration, delay, easing, fill: 'both' }),
    );
    // A shared clock gives replay, cancellation and slow-motion review one endpoint.
    const clock = scene.animate([], { duration: PREVIEW_DURATION[mode] });
    animations.push(clock);
    clock.finished
      .then(() => {
        if (!disposed && version === generation) finish();
      })
      .catch(() => {});
    syncVisibility();
  }

  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    syncVisibility();
  });
  observer.observe(scene);
  const onReduced = () => {
    if (reduced.matches) finish();
  };
  document.addEventListener('visibilitychange', syncVisibility);
  reduced.addEventListener('change', onReduced);
  play();
  return {
    play,
    finish,
    dispose() {
      disposed = true;
      cancel();
      observer.disconnect();
      document.removeEventListener('visibilitychange', syncVisibility);
      reduced.removeEventListener('change', onReduced);
      decorations.forEach((element) => element.remove());
      originals.forEach((style, element) => {
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
      });
      delete scene.dataset.previewMotion;
      delete scene.dataset.playback;
    },
  };
}
