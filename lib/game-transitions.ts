let translateTransition = (text: string) => text;
export function setTransitionTranslator(translator: (text: string) => string) { translateTransition = translator; }

// Reference prototypes and route navigation share the same WAAPI tracks.
// onCovered is the safe point for a route swap.
// 注意：本文件被 scripts/check-game-transitions.mjs 转译成 data: URL 导入测试，
// 不能加任何静态/动态模块导入（data: URL 下相对路径无法解析），导航封装也一样。

// bands 导航（决策 033）：偏好榜入口与返回首页走斜向切片过场。
// 与首页主按钮的 frame 接入同模式：盖满时换路由，模块级锁防跨实例重入。
let bandsNavRunning = false;
export function bandsNavigate(
  hash: string,
  options: Pick<GameTransitionOptions, 'title' | 'words' | 'labels'> = {},
) {
  if (bandsNavRunning) return;
  bandsNavRunning = true;
  createGameTransition('bands', {
    ...options,
    // 导航用途下整体 1.25× 均匀加速，保持三带的错峰比例。
    speed: 1.25,
    onCovered: () => {
      window.location.hash = hash;
    },
    onFinish: () => {
      bandsNavRunning = false;
    },
  }).play();
}

// convoy 导航（2026-09-13 用户拍板）：首页→题库、玩法菜单→测评走一体斜幕。
let convoyNavRunning = false;
export function convoyNavigate(hash: string, title?: string) {
  if (convoyNavRunning) return;
  convoyNavRunning = true;
  createGameTransition('convoy', {
    title,
    onCovered: () => {
      window.location.hash = hash;
    },
    onFinish: () => {
      convoyNavRunning = false;
    },
  }).play();
}

export type GameTransitionKind = 'frame' | 'bands' | 'convoy';
export interface GameTransitionOptions {
  parent?: HTMLElement;
  title?: string;
  speed?: number;
  hold?: number;
  reduced?: boolean;
  onCovered?: () => void;
  onFrame?: (time: number, duration: number) => void;
  onFinish?: () => void;
  // bands 字带文案（三条带各一词一签）；缺省用通用品牌词
  words?: [string, string, string];
  labels?: [string, string, string];
}

export function gameTransitionTiming(kind: GameTransitionKind, hold = 650) {
  const covered = kind === 'frame' ? 420 : 520;
  const exitStart =
    covered + Math.max(0, hold) * (kind === 'convoy' ? 0.35 : 1);
  return {
    covered,
    exitStart,
    duration: exitStart + (kind === 'bands' ? 900 : 650),
  };
}

export function createGameTransition(
  kind: GameTransitionKind,
  options: GameTransitionOptions = {},
) {
  const timing = gameTransitionTiming(kind, options.hold);
  const layer = document.createElement('div');
  layer.className = `game-transition gt-${kind}${options.parent ? ' gt-contained' : ''}`;
  layer.setAttribute('aria-hidden', 'true');
  const animations: Animation[] = [];
  const title = options.title || 'ARENA OF BIAS';
  const ease = 'cubic-bezier(.76,0,.24,1)';
  let frame = 0;
  let time = 0;
  let running = false;
  let disposed = false;
  let covered = false;
  let previous: number | undefined;
  const el = (className: string, parent = layer, text?: string) => {
    const node = document.createElement('div');
    node.className = className;
    if (text !== undefined) node.textContent = translateTransition(text);
    parent.append(node);
    return node;
  };
  const track = (
    node: HTMLElement,
    frames: Keyframe[],
    start: number,
    duration: number,
    easing = ease,
  ) => {
    const animation = node.animate(frames, {
      delay: start,
      duration,
      fill: 'both',
      easing,
    });
    animation.pause();
    animation.currentTime = 0;
    animations.push(animation);
  };
  const move = (
    node: HTMLElement,
    from: string,
    to: string,
    start: number,
    duration: number,
  ) => track(node, [{ transform: from }, { transform: to }], start, duration);
  const fade = (
    node: HTMLElement,
    from: number,
    to: number,
    start: number,
    duration: number,
  ) =>
    track(
      node,
      [{ opacity: from }, { opacity: to }],
      start,
      duration,
      'linear',
    );

  if (kind === 'frame') {
    const sheet = el('gt-sheet');
    const veil = el('gt-veil', sheet);
    // Opaque paper covers the old page without a prolonged crossfade.
    move(veil, 'translateY(101%)', 'translateY(0)', 0, timing.covered);
    const lattice = el('gt-lattice', sheet);
    for (let i = 0; i < 4; i++) {
      const frame = el('gt-echo', lattice);
      move(
        frame,
        `rotate(-12deg) scale(${0.65 + i * 0.18})`,
        `rotate(0deg) scale(${1.1 + i * 0.38})`,
        500 + i * 75,
        1300,
      );
    }
    fade(lattice, 0, 1, 800, 500);
    const mark = el('gt-mark', sheet);
    for (let i = 0; i < 4; i++) {
      const corner = el(`gt-corner gt-corner-${i}`, mark);
      move(
        corner,
        `translate(${i % 2 ? 35 : -35}px,${i < 2 ? -35 : 35}px)`,
        'translate(0,0)',
        i * 65,
        650,
      );
    }
    el('gt-index', mark, 'A / B');
    el('gt-registration', mark, '+');
    move(mark, 'rotate(-9deg) scale(1.3)', 'rotate(0deg) scale(1)', 0, 900);
    fade(mark, 0, 1, 0, 260);
    const copy = el('gt-copy', sheet);
    const headline = el('gt-headline', copy);
    el('gt-kicker', copy, 'OBSERVATION FILE   /   001');
    const wordmark = el('gt-wordmark', headline, title);
    move(wordmark, 'translateY(115%)', 'translateY(0)', 300, 480);
    el('gt-caption', copy, '偏好正在归档  /  YOUR INSTINCT IS THE EVIDENCE');
    const signal = el('gt-signal', copy);
    for (let i = 0; i < 19; i++) {
      const bar = el('gt-signal-bar', signal);
      bar.style.height = i % 3 === 0 ? '12px' : '5px';
    }
    fade(copy, 0, 1, 280, 220);
    move(copy, 'translateY(14px)', 'translateY(0)', 280, 550);
    move(sheet, 'translateY(0)', 'translateY(-101%)', timing.exitStart, 650);
  } else if (kind === 'bands') {
    const field = el('gt-ink-field');
    el('gt-field-index', field, '02 / MAKE A CHOICE');
    // 斜带扫不到的左上/右下两角用品牌角标填空
    el('gt-field-tag tl', field, 'ARENA OF BIAS');
    el('gt-field-tag br', field, 'TRUST YOUR INSTINCT');
    track(
      field,
      [
        {
          transform: 'translateX(-110%)',
          offset: 0,
          easing: ease,
        },
        {
          transform: 'translateX(0)',
          offset: timing.covered / timing.duration,
        },
        {
          transform: 'translateX(0)',
          offset: (timing.exitStart + 150) / timing.duration,
          easing: ease,
        },
        {
          transform: 'translateX(110%)',
          offset: (timing.exitStart + 850) / timing.duration,
        },
        { transform: 'translateX(110%)', offset: 1 },
      ],
      0,
      timing.duration,
      'linear',
    );
    const bank = el('gt-band-bank');
    // 三条带提前进场（墨场开滑后 150ms 跟进、错峰 90ms），盖满时已就位——
    // 中段不再空转；左右交替方向杀入再各自反向退出，形成对抗交错。
    const bandIn = 460;
    const bandOut = 460;
    const words = options.words ?? [title, 'TRUST YOUR INSTINCT', '偏见 · 各有所爱'];
    const labels = options.labels ?? ['OBSERVE →', 'COMPARE →', 'DECIDE →'];
    for (let i = 0; i < 3; i++) {
      const row = el(`gt-band gt-band-${i}`, bank);
      const ribbon = el('gt-ribbon', row);
      for (let j = 0; j < 3; j++) {
        el('gt-ribbon-index', ribbon, `0${i + 1} /`);
        el('gt-ribbon-word', ribbon, words[i]);
        el('gt-ribbon-label', ribbon, labels[i]);
      }
      const sign = i % 2 ? 1 : -1;
      const start = 150 + i * 90;
      const exit = timing.exitStart + i * 60;
      const bandDuration = exit + bandOut - start;
      track(
        row,
        [
          { transform: `translateX(${sign * 110}%)`, offset: 0, easing: ease },
          { transform: 'translateX(0)', offset: bandIn / bandDuration },
          {
            transform: 'translateX(0)',
            offset: (exit - start) / bandDuration,
            easing: ease,
          },
          { transform: `translateX(${-sign * 110}%)`, offset: 1 },
        ],
        start,
        bandDuration,
        'linear',
      );
      move(
        ribbon,
        `translateX(${sign < 0 ? -9 : -22}%)`,
        `translateX(${sign < 0 ? -22 : -9}%)`,
        start,
        bandDuration,
      );
    }
  } else {
    // The colored edges and dark occlusion share one clock, so the full-screen
    // cover remains continuous while the route changes underneath.
    const convoy = el('gt-convoy');
    const face = el('gt-convoy-face', convoy);
    el('gt-convoy-paper', face);
    const ink = el('gt-convoy-ink', face);
    const label = el('gt-convoy-label', ink);
    el('gt-convoy-number', label, '03 /');
    el('gt-convoy-title', label, title);
    el('gt-convoy-note', label, '下一场，凭直觉。 / MAKE YOUR CHOICE');
    track(
      convoy,
      [
        {
          transform: 'translateX(-110%)',
          offset: 0,
          easing: 'cubic-bezier(.3,.05,.25,1)',
        },
        {
          transform: 'translateX(0%)',
          offset: timing.covered / timing.duration,
          easing: 'linear',
        },
        {
          transform: 'translateX(3%)',
          offset: timing.exitStart / timing.duration,
          easing: 'cubic-bezier(.55,0,.7,1)',
        },
        { transform: 'translateX(110%)', offset: 1 },
      ],
      0,
      timing.duration,
      'linear',
    );
  }
  (options.parent ?? document.body).append(layer);

  const seek = (value: number) => {
    if (disposed) return;
    time = Math.max(0, Math.min(timing.duration, value));
    animations.forEach((animation) => {
      animation.currentTime = time;
    });
    options.onFrame?.(time, timing.duration);
  };
  const pause = () => {
    running = false;
    previous = undefined;
    cancelAnimationFrame(frame);
  };
  const dispose = () => {
    pause();
    disposed = true;
    animations.forEach((animation) => animation.cancel());
    layer.remove();
  };
  const complete = () => {
    dispose();
    options.onFinish?.();
  };
  const tick = (stamp: number) => {
    if (!running || disposed) return;
    const delta = previous === undefined ? 0 : stamp - previous;
    previous = stamp;
    // Render the fully covered frame before allowing a page change. A delayed
    // frame must not jump from pre-cover to exit while changing the destination.
    const next = time + delta * Math.max(0.1, options.speed ?? 1);
    seek(!covered && next >= timing.covered ? timing.covered : next);
    if (!covered && time >= timing.covered) {
      covered = true;
      options.onCovered?.();
    }
    if (time >= timing.duration) complete();
    else if (!disposed && running) frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (disposed || running) return;
    if (
      options.reduced ??
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      if (!covered) {
        covered = true;
        options.onCovered?.();
      }
      complete();
      return;
    }
    running = true;
    frame = requestAnimationFrame(tick);
  };
  return { layer, timing, seek, play, pause, dispose };
}
