import type { GameTransitionKind, GameTransitionOptions } from '@/lib/game-transitions';
import catalog from './playground-catalog.json';
import { prepareReaderBook } from './playground-book';
import './playground-door.css';
import './playground-passage.css';

const editions: Record<string, { paper: string; ink: string }> = {
  letter: { paper: '#e3cfc7', ink: '#67463e' },
  forest: { paper: '#dbe0ce', ink: '#344936' },
  blackout: { paper: '#202e30', ink: '#eee9d6' },
  waiting: { paper: '#e3e3d4', ink: '#45594a' },
  channels: { paper: '#e8dfca', ink: '#45463e' },
  orange: { paper: '#ece5c5', ink: '#3e4b2d' },
  chat: { paper: '#dce5db', ink: '#294b3f' },
  forum: { paper: '#e0e6e7', ink: '#344e60' },
  index: { paper: '#ede9de', ink: '#304139' },
};
let active: ReturnType<typeof buildPassage> | null = null;
let serial = 0;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
// Preserve the original doors' two easing curves on the single passage clock.
const curve = (x1: number, y1: number, x2: number, y2: number) => (progress: number) => {
  const sample = (t: number, a: number, b: number) => 3 * (1 - t) ** 2 * t * a + 3 * (1 - t) * t ** 2 * b + t ** 3;
  let low = 0, high = 1;
  for (let i = 0; i < 18; i++) { const t = (low + high) / 2; if (sample(t, x1, x2) < progress) low = t; else high = t; }
  return progress <= 0 ? 0 : progress >= 1 ? 1 : sample((low + high) / 2, y1, y2);
};
const closing = curve(.3, .65, .2, 1), opening = curve(.45, 0, .2, 1);

function buildPassage(kind: GameTransitionKind, options: GameTransitionOptions, alreadyCovered: boolean, round: boolean) {
  const item = catalog.find(entry => entry.id === options.index || entry.name === options.title);
  const skin = item?.skin ?? 'index', edition = editions[skin];
  const target = item ? `#arena/${item.id}` : null;
  const layer = document.createElement('div');
  layer.className = `game-transition pg-passage pg-door gt-${kind}`;
  Object.assign(layer.dataset, { skin, kind, phase: 'cover', mode: round ? 'round' : item ? 'entry' : 'index', passageId: String(++serial) });
  layer.style.setProperty('--passage-paper', edition.paper);
  layer.style.setProperty('--door-paper', edition.paper);
  layer.style.setProperty('--passage-ink', edition.ink);
  layer.tabIndex = -1; layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true');
  layer.setAttribute('aria-label', item?.name ?? '文字题目');
  const sheet = document.createElement('div'); sheet.className = 'pg-door-backing pg-passage-sheet'; layer.append(sheet);
  const node = (className: string, parent: HTMLElement) => { const child = document.createElement('div'); child.className = className; parent.append(child); return child; };
  const leaves = [0, 1].map(side => {
    const leaf = node(`pg-door-leaf pg-door-leaf-${side}`, layer);
    node('pg-door-paper', leaf); node('pg-door-inset', leaf);
    const shade = node('pg-door-shade', leaf);
    return { leaf, shade };
  });
  const label = node('pg-passage-label', layer);
  label.textContent = item?.name ?? '文字目录';
  const cancel = document.createElement('button'); cancel.className = 'pg-passage-cancel'; cancel.textContent = '返回选题 ↗';
  const status = document.createElement('output'); status.className = 'pg-passage-status'; status.textContent = '正在取出两份作品…'; status.hidden = true;
  layer.append(cancel, status);
  const entry = 240, hold = round ? 60 : item ? 180 : 40, exit = 560;
  const timing = { covered: alreadyCovered ? 0 : entry, exitStart: (alreadyCovered ? 0 : entry) + hold, duration: (alreadyCovered ? 0 : entry) + hold + exit };
  let disposed = false, running = false, released = !item, paused = false, version = 0, mounted = false;
  let book: ReturnType<typeof prepareReaderBook> = null;
  let coveredResolve!: () => void, finishedResolve!: () => void;
  const covered = new Promise<void>(resolve => { coveredResolve = resolve; });
  const finished = new Promise<void>(resolve => { finishedResolve = resolve; });
  const root = document.getElementById('playground-root'), previousFocus = document.activeElement as HTMLElement | null;
  const wasInert = root?.inert ?? false;
  if (root) root.inert = true;
  const reduced = () => !!options.reduced || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gateOpen = () => options.holdGate ? options.holdGate() : released;
  const paint = (phase: 'cover' | 'hold' | 'exit', progress: number) => {
    const p = clamp(progress), e = phase === 'cover' ? closing(p) : opening(p);
    layer.dataset.phase = phase; layer.dataset.gtPhase = phase;
    document.documentElement.dataset.pgPassage = phase;
    sheet.style.opacity = String(phase === 'cover' ? e : phase === 'hold' ? 1 : 1 - clamp(p / .45));
    const angle = phase === 'cover' ? 88 * (1 - e) : phase === 'hold' ? 0 : -94 * e;
    for (const { leaf, shade } of leaves) {
      const sign = leaf.classList.contains('pg-door-leaf-0') ? 1 : -1;
      leaf.style.transform = `perspective(1800px) rotateY(${sign * angle}deg)`;
      leaf.style.opacity = String(phase === 'exit' ? 1 - clamp((p - .85) / .15) : 1);
      shade.style.opacity = String(phase === 'cover' ? .28 * (1 - e) : phase === 'hold' ? 0 : .25 * e);
    }
    cancel.style.opacity = phase === 'cover' ? String(e) : phase === 'exit' ? String(1 - clamp(p * 4)) : '.7';
    label.style.opacity = String(phase === 'cover' ? clamp((p - .45) / .55) : phase === 'hold' ? 1 : 1 - clamp(p * 5));
    if (phase === 'exit') book?.paint(reduced() ? 1 : clamp((p - .1) / .9));
    if (mounted) options.onFrame?.(phase === 'cover' ? p * entry : phase === 'hold' ? timing.covered : timing.exitStart + p * exit, timing.duration);
  };
  paint('cover', alreadyCovered ? 1 : 0); document.body.append(layer); mounted = true; layer.focus({ preventScroll: true });
  const dispose = () => {
    if (disposed) return;
    disposed = true; version++; book?.dispose(); book = null; layer.remove();
    if (root) root.inert = wasInert;
    delete document.documentElement.dataset.pgPassage;
    removeEventListener('hashchange', onHash); removeEventListener('keydown', onKey, true);
    coveredResolve(); finishedResolve();
    if (active?.layer === layer) active = null;
    options.onFinish?.();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  };
  const cancelPassage = () => { dispose(); dispatchEvent(new Event('pg:reader-cancel')); location.hash = '#text'; };
  cancel.onclick = cancelPassage;
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); cancelPassage(); }
    if (event.key !== 'Tab') event.stopImmediatePropagation();
  };
  let expectedHash = location.hash;
  const onHash = () => { if (location.hash !== expectedHash) { dispose(); dispatchEvent(new Event('pg:reader-cancel')); } };
  addEventListener('hashchange', onHash); addEventListener('keydown', onKey, true);
  const play = () => {
    if (running || disposed) return;
    running = true; paused = false; const ownVersion = ++version;
    const segment = async (phase: 'cover' | 'exit', duration: number) => {
      let elapsed = 0, previous = performance.now();
      while (!disposed && ownVersion === version) {
        const now = performance.now(); if (!paused) elapsed += now - previous; previous = now;
        if (paused) { await frame(); continue; }
        const p = reduced() ? 1 : Math.min(1, elapsed / duration); paint(phase, p);
        if (p === 1) return; await frame();
      }
    };
    void (async () => {
      if (!alreadyCovered) await segment('cover', entry);
      if (disposed || ownVersion !== version) return;
      paint('hold', 1); options.onCovered?.(); expectedHash = target ?? location.hash; coveredResolve();
      const started = performance.now();
      while (!disposed && ownVersion === version) {
        const gate = gateOpen(), elapsed = performance.now() - started;
        status.hidden = gate || elapsed < 1000;
        if (gate && elapsed >= hold) break;
        await frame();
      }
      if (disposed || ownVersion !== version) return;
      await frame(); await frame();
      if (disposed || ownVersion !== version) return;
      status.hidden = true; cancel.disabled = true;
      await segment('exit', exit);
      if (!disposed && ownVersion === version) dispose();
    })();
  };
  const seek = (time: number) => {
    version++; running = false;
    if (time < timing.covered) paint('cover', time / timing.covered);
    else if (time <= timing.exitStart) paint('hold', 1);
    else paint('exit', (time - timing.exitStart) / exit);
  };
  return { layer, timing, covered, finished, play, pause: () => { paused = true; }, seek, dispose,
    prepare: (stage: HTMLElement | null) => { book?.dispose(); book = reduced() ? null : prepareReaderBook(stage); book?.paint(0); },
    release: () => { released = true; } };
}

export function createPlaygroundPassage(kind: GameTransitionKind, options: GameTransitionOptions & { round?: boolean } = {}) {
  active?.dispose(); active = buildPassage(kind, options, false, options.round ?? false); return active;
}
export function readerPassage(id: string, round = false) {
  if (active) return active;
  active = buildPassage('match', { index: id }, !round, round); active.play(); return active;
}
export async function coverReaderRound(id: string, signal: AbortSignal) { const passage = readerPassage(id, true); await passage.covered; signal.throwIfAborted(); }
export function cancelReaderPassage() { active?.dispose(); dispatchEvent(new Event('pg:reader-cancel')); location.hash = '#text'; }
