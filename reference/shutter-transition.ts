import type { GameTransitionOptions } from '../lib/game-transitions';

// Review-only animation. CSS owns the tracks; one clock supports pause and seek.
export const shutterTransitionTiming = {
  duration: 5000,
  covered: 3800,
  exitStart: 3800,
};

export function createShutterTransition(options: GameTransitionOptions = {}) {
  const timing = shutterTransitionTiming;
  const host = document.createElement('div');
  host.className = options.parent
    ? 'shutter-host'
    : 'shutter-host shutter-fullscreen';
  const layer = document.createElement('div');
  layer.className = 'shutter-transition';
  layer.setAttribute('aria-hidden', 'true');
  host.append(layer);
  const el = (className: string, parent: HTMLElement = layer) => {
    const node = document.createElement('div');
    node.className = className;
    parent.append(node);
    return node;
  };
  el('shutter-background');
  const center = el('shutter-center');
  const square = el('shutter-square', center);
  el('shutter-depth', square);
  const title = el('shutter-main-text', square);
  title.textContent = options.title || 'ARENA OF BIAS';
  title.style.setProperty(
    '--title-fit',
    String(Math.min(1, 13 / title.textContent.length)),
  );
  const detail = el('shutter-micro', square);
  for (let i = 0; i < 3; i++) {
    const row = el('shutter-micro-row', detail);
    row.style.setProperty('--row', String(i));
  }
  const waveform = el('shutter-waveform', square);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 240 24');
  svg.setAttribute('preserveAspectRatio', 'none');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute(
    'd',
    'M0 12H77 M163 12H240 M25 6H69 M171 6H215 M25 18H69 M171 18H215 M77 12H94L101 7L109 17L118 1L126 23L134 8L142 12H163',
  );
  path.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.append(path);
  waveform.append(svg);

  const bars = el('shutter-transition-bars');
  const widths = [9, 14, 6, 18, 10, 7, 16, 8, 12];
  const colors = [
    '#888',
    '#CCC',
    '#333',
    '#888',
    '#E6E6E6',
    '#CCC',
    '#333',
    '#888',
    '#CCC',
  ];
  let left = 0;
  widths.forEach((width, index) => {
    const bar = el('shutter-bar', bars);
    bar.style.setProperty('--bar-left', `${left}%`);
    bar.style.setProperty('--bar-width', `${width}%`);
    // Each complete strip starts beyond the viewport's left edge.
    bar.style.setProperty('--bar-start', `${-(left + width + 0.2)}cqw`);
    bar.style.setProperty('--bar-delay', `${2500 + index * 65}ms`);
    bar.style.backgroundColor = colors[index];
    left += width;
  });
  el('shutter-solid-color-layer');
  (options.parent ?? document.body).append(host);
  const animations = layer.getAnimations({ subtree: true });
  animations.forEach((animation) => animation.pause());

  let time = 0;
  let frame = 0;
  let previous: number | undefined;
  let running = false;
  let disposed = false;
  let finished = false;
  const seek = (value: number) => {
    if (disposed) return;
    time = Math.max(0, Math.min(timing.duration, value));
    animations.forEach((animation) => {
      animation.currentTime = time;
    });
    layer.dataset.time = String(time);
    layer.dataset.stage =
      time < 1500
        ? 'intro'
        : time < 2500
          ? 'detail'
          : time < 3800
            ? 'shutters'
            : 'color';
    options.onFrame?.(time, timing.duration);
  };
  const pause = () => {
    running = false;
    previous = undefined;
    cancelAnimationFrame(frame);
  };
  const complete = () => {
    pause();
    if (finished) return;
    finished = true;
    options.onFinish?.();
  };
  const tick = (stamp: number) => {
    if (!running || disposed) return;
    const delta = previous === undefined ? 0 : stamp - previous;
    previous = stamp;
    seek(time + delta * Math.max(0.1, options.speed ?? 1));
    if (time >= timing.duration) complete();
    else if (running && !disposed) frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (disposed || running || finished) return;
    if (
      options.reduced ??
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      seek(timing.duration);
      complete();
      return;
    }
    running = true;
    frame = requestAnimationFrame(tick);
  };
  const dispose = () => {
    if (disposed) return;
    pause();
    disposed = true;
    animations.forEach((animation) => animation.cancel());
    host.remove();
  };
  seek(0);
  return { layer, timing, seek, play, pause, dispose };
}
