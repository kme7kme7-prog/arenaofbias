let translateTransition = (text: string) => text;
export function setTransitionTranslator(translator: (text: string) => string) {
  translateTransition = translator;
}

// Reference prototypes and route navigation share the same WAAPI tracks.
// onCovered is the safe point for a route swap.
// 注意：本文件被 scripts/check-game-transitions.mjs 转译成 data: URL 导入测试，
// 不能加任何静态/动态模块导入（data: URL 下相对路径无法解析），导航封装也一样。

// Read the mounted layers, including their exit tails. Per-button locks cannot
// prevent a different navigation entry from starting a competing route change.
// Keep the low-level constructor independent for multi-instance review pages.
export function navigationTransitionActive() {
  return !!document.querySelector(
    '.game-transition, .page-wipe, .theme-curtain, .play-entry-wipe, html[data-play-entry], .arena-shell.phase-transition, .arena-shell.shutter-exit',
  );
}

// Ranking entry and homepage return share the classic push in opposite directions.
// 与首页主按钮的 frame 接入同模式：盖满时换路由，模块级锁防跨实例重入。
let bandsNavRunning = false;
export function bandsNavigate(
  hash: string,
  options: Pick<GameTransitionOptions, 'title' | 'words' | 'labels'> = {},
) {
  if (hash === '#home') { homeNavigate(); return; }
  if (bandsNavRunning || navigationTransitionActive()) return;
  bandsNavRunning = true;
  createGameTransition(hash.startsWith('#rank') ? 'push' : 'bands', {
    ...options,
    // Classic entry keeps its 980ms cadence; legacy return keeps its speed.
    speed: hash.startsWith('#rank') ? 1 : 1.25,
    onCovered: () => {
      window.location.hash = hash;
    },
    onFinish: () => {
      bandsNavRunning = false;
    },
  }).play();
}

// convoy 导航（2026-09-13 用户拍板）：首页→题库、玩法菜单→测评走一体斜幕。
let homeNavRunning = false;
export function homeNavigate() {
  if (homeNavRunning || navigationTransitionActive()) return;
  homeNavRunning = true;
  createGameTransition('push', {
    direction: 'back',
    onCovered: () => { window.location.hash = '#home'; },
    onFinish: () => { homeNavRunning = false; },
  }).play();
}

let convoyNavRunning = false;
export function convoyNavigate(hash: string, title?: string) {
  if (convoyNavRunning || navigationTransitionActive()) return;
  convoyNavRunning = true;
  const swap = () => {
    window.location.hash = hash;
  };
  const release = () => {
    convoyNavRunning = false;
  };
  // 窄屏下斜幕盖满即成全墨平板、文字按 cqw 缩到不可读（用户拍板）：
  // ≤720px 菜单进测评改走双页纸色过场，桌面保持原斜幕。
  if (window.matchMedia('(max-width: 720px)').matches) {
    createGameTransition('match', {
      title,
      index: '↗',
      onCovered: swap,
      onFinish: release,
    }).play();
    return;
  }
  createGameTransition('convoy', {
    title,
    onCovered: swap,
    onFinish: release,
  }).play();
}

// Same menu lock as convoy: rapid clicks cannot launch competing route swaps.
export function guessNavigate() {
  if (convoyNavRunning || navigationTransitionActive()) return;
  convoyNavRunning = true;
  createGameTransition('deal', {
    onCovered: () => {
      window.location.hash = '#guess';
    },
    onFinish: () => {
      convoyNavRunning = false;
    },
  }).play();
}

export type GameTransitionKind =
  | 'push'
  | 'frame'
  | 'bands'
  | 'convoy'
  | 'deal'
  | 'folio'
  | 'match';
export interface GameTransitionOptions {
  parent?: HTMLElement;
  title?: string;
  index?: string;
  speed?: number;
  hold?: number;
  reduced?: boolean;
  theme?: 'paper' | 'ink';
  // Text scenes keep their own paper and fold; false preserves the classic route.
  readingScene?: 'reading' | 'forest' | 'letter' | 'channels' | 'blackout' | 'waiting' | false;
  direction?: 'forward' | 'back';
  onCovered?: () => void;
  onFrame?: (time: number, duration: number) => void;
  onFinish?: () => void;
  // 扫出门控（仅 match，决策 096）：返回 false 时纸幕钉在盖满位不扫出——
  // 「下一题」把它接到新竞技场作品就绪门上，加载期牌面本身就是等待屏；
  // 返回 true 且帧率恢复后才进 exit 段帧时扫出。
  holdGate?: () => boolean;
  // bands 字带文案（三条带各一词一签）；缺省用通用品牌词
  words?: [string, string, string];
  labels?: [string, string, string];
}

// 单帧推进封顶（2026-09-19 卡顿轮）：帧间隔超过此值视为主线程饱和掉帧——
// 时间轴原地冻住、恢复后从冻点续播，不按墙钟追进度跳段。100ms 不碰低至
// 10fps 的正常帧率，只截真阻塞。文字纸条同规矩（lib/text-swap-mask.ts）。
const FRAME_STEP_CAP = 100;
// 释放后连续多少帧正常帧率才起扫：饱和期合成器产不出帧，任何按墙钟走的
// 扫出都会被压进一两帧产帧里、看起来就是「纸幕半开突然消失」——宁可多钉
// 一会儿幕，等帧率恢复再整段扫出。
const SMOOTH_FRAMES = 3;
// 帧率门的「正常帧」阈值：比推进封顶宽——重作品（WebGL 渲染循环）会把主线程
// 压在持续 100~250ms 的帧间隔，那是本页的常态不是阻塞；只有 >250ms 的真阻塞
// 才重置计数。阈值过紧会把扫出永久冻在低帧率页面上。
const SMOOTH_DELTA_MS = 250;
// Heavy works can remain below four fps. Recovery may pause a sweep briefly,
// but must never require a frame rate the device cannot sustain.
const SMOOTH_WAIT_MS = 1800;

export function gameTransitionTiming(kind: GameTransitionKind, hold = 650) {
  if (kind === 'push') return { covered: 380, exitStart: 520, duration: 980 };
  if (kind === 'match') return { covered: 420, exitStart: 760, duration: 1260 };
  if (kind === 'folio') return { covered: 230, exitStart: 310, duration: 570 };
  const covered = kind === 'frame' ? 420 : kind === 'deal' ? 720 : 520;
  const exitStart =
    covered + Math.max(0, hold) * (kind === 'convoy' ? 0.35 : 1);
  return {
    covered,
    exitStart,
    duration: exitStart + (kind === 'bands' ? 900 : 650),
  };
}

export type GameTransition = { layer: HTMLElement; timing: { covered: number; exitStart: number; duration: number }; seek: (time: number) => void; play: () => void; pause: () => void; dispose: () => void };
let transitionFactory: ((kind: GameTransitionKind, options: GameTransitionOptions) => GameTransition) | null = null;
/** An isolated entry may register its navigation; the main site keeps its own tracks. */
export function setTransitionFactory(factory: typeof transitionFactory) { transitionFactory = factory; }

export function createGameTransition(
  kind: GameTransitionKind,
  options: GameTransitionOptions = {},
): GameTransition {
  if (transitionFactory) return transitionFactory(kind, options);
  const timing = gameTransitionTiming(kind, options.hold);
  const layer = document.createElement('div');
  layer.className = `game-transition gt-${kind}${options.parent ? ' gt-contained' : ''}`;
  const sourceScene = document.documentElement?.dataset.scene;
  const readingScene = options.readingScene === false ? undefined : options.readingScene ??
    (['match', 'push', 'bands'].includes(kind) && ['reading', 'forest', 'letter', 'channels', 'blackout', 'waiting'].includes(sourceScene ?? '') ? sourceScene : undefined);
  if (readingScene) layer.dataset.readingScene = readingScene;
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
  let smooth = 0;
  let smoothPinned = false;
  let slowSince: number | undefined;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMode = !!options.reduced || motionPreference.matches;
  const el = (className: string, parent: HTMLElement = layer, text?: string) => {
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
  const ink = (options.theme ?? document.documentElement?.dataset.theme) === 'ink';
  layer.dataset.theme = ink ? 'ink' : 'paper';
  const motionEase = ink ? 'cubic-bezier(.25,.6,.25,1)' : ease;
  const sweep = (node: HTMLElement, from: string, out: string) => track(node, [
    { transform: from, offset: 0, easing: motionEase },
    { transform: 'translate(0, 0)', offset: timing.covered / timing.duration },
    { transform: 'translate(0, 0)', offset: timing.exitStart / timing.duration, easing: motionEase },
    { transform: out, offset: 1 },
  ], 0, timing.duration, 'linear');
  const move = (node: HTMLElement, from: string, to: string, start: number, duration: number) =>
    track(node, [{ transform: from }, { transform: to }], start, duration);
  const fade = (node: HTMLElement, from: number, to: number, start: number, duration: number) =>
    track(node, [{ opacity: from }, { opacity: to }], start, duration);
  // Restore the historical mystery-card entry; other routes keep material sweeps.
  if (readingScene) {
    // An opaque backing guarantees coverage while the folded leaves meet. Only
    // transform/opacity move; the existing frame clock and ready gate own exit.
    const ground = el('gt-reading-ground gt-material-plate');
    track(ground, [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: timing.covered / timing.duration },
      { opacity: 1, offset: timing.exitStart / timing.duration },
      { opacity: 0, offset: 1 },
    ], 0, timing.duration, 'linear');
    for (let i = 0; i < 2; i++) {
      const leaf = el(`gt-reading-leaf gt-reading-leaf-${i} gt-material-leaf`);
      const axis = readingScene === 'letter' ? 'X' : 'Y';
      const sign = i ? -1 : 1;
      track(leaf, [
        { transform: `perspective(1800px) rotate${axis}(${sign * 88}deg)`, opacity: 0, offset: 0, easing: 'cubic-bezier(.3,.65,.2,1)' },
        { transform: `perspective(1800px) rotate${axis}(0deg)`, opacity: 1, offset: timing.covered / timing.duration },
        { transform: `perspective(1800px) rotate${axis}(0deg)`, opacity: 1, offset: timing.exitStart / timing.duration, easing: 'cubic-bezier(.45,0,.2,1)' },
        { transform: `perspective(1800px) rotate${axis}(${-sign * 94}deg)`, opacity: 0, offset: 1 },
      ], 0, timing.duration, 'linear');
    }
  } else if (kind === 'deal') {
    // The card becomes a fully opaque viewport before routing. Its two halves
    // own the hold and exit, so no independent background can outlive the reveal.
    for (let i = 0; i < 2; i++) {
      const back = el(`gt-deal-back gt-deal-back-${i}`);
      track(
        back,
        [
          {
            transform: `translateY(120%) rotate(${-18 + i * 7}deg) scale(.22)`,
            opacity: 1,
            offset: 0,
          },
          {
            transform: `translateY(0) rotate(${-9 + i * 15}deg) scale(.32)`,
            opacity: 1,
            offset: 0.48,
          },
          {
            transform: 'translateY(0) rotate(0deg) scale(1.04)',
            opacity: 1,
            offset: 0.88,
          },
          {
            transform: 'translateY(0) rotate(0deg) scale(1.04)',
            opacity: 0,
            offset: 1,
          },
        ],
        i * 35,
        timing.covered + 90,
        ease,
      );
    }
    const shell = el('gt-deal-shell');
    track(
      shell,
      [
        {
          transform: 'translateY(125%) rotate(-11deg) scale(.22)',
          offset: 0,
          easing: 'cubic-bezier(.16,1,.3,1)',
        },
        {
          transform: 'translateY(0) rotate(4deg) scale(.32)',
          offset: 0.46,
          easing: 'cubic-bezier(.7,0,.15,1)',
        },
        { transform: 'translateY(0) rotate(0deg) scale(1)', offset: 1 },
      ],
      0,
      timing.covered,
      'linear',
    );
    for (let i = 0; i < 2; i++) {
      const half = el(`gt-deal-half gt-deal-half-${i}`, shell);
      move(
        half,
        'translateX(0)',
        `translateX(${i ? 101 : -101}%)`,
        timing.exitStart,
        650,
      );
    }
    // Restrained opening-only decoration disappears before the later scene.
    const seal = el('gt-deal-seal', shell, '?');
    fade(seal, 1, 0, timing.covered - 150, 150);
    const copy = el('gt-deal-copy', shell);
    const info = el('gt-deal-info', copy);
    el('gt-deal-kicker', info, '每日谜题');
    el('gt-deal-title', info, '模一把');
    el('gt-deal-note', info, '七条线索，锁定一个名字。');
    const clues = el('gt-deal-clues', info);
    const dwell = timing.exitStart - timing.covered;
    for (let i = 0; i < 7; i++) {
      const clue = el('gt-deal-clue', clues, String(i + 1).padStart(2, '0'));
      track(
        clue,
        [
          { opacity: 0.18, transform: 'translateY(3px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        timing.covered + (dwell * i) / 10,
        Math.min(160, dwell * 0.35),
      );
    }
    const symbol = el('gt-deal-symbol', copy);
    el('gt-deal-orbit', symbol);
    el('gt-deal-mystery', symbol, '?');
    el('gt-deal-count', symbol, '08');
    el('gt-deal-count-label', symbol, '次机会');
    const sheen = el('gt-deal-sheen', symbol);
    track(
      sheen,
      [
        { transform: 'translateX(-160%) rotate(-20deg)', opacity: 0 },
        {
          transform: 'translateX(0) rotate(-20deg)',
          opacity: 0.22,
          offset: 0.45,
        },
        { transform: 'translateX(180%) rotate(-20deg)', opacity: 0 },
      ],
      timing.covered + 50,
      dwell + 80,
      'cubic-bezier(.22,.6,.3,1)',
    );
    track(
      copy,
      [
        { opacity: 0, transform: 'translateY(9px)', offset: 0 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.2 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.8 },
        { opacity: 0, transform: 'translateY(-8px)', offset: 1 },
      ],
      timing.covered,
      dwell + 150,
      'linear',
    );
    move(
      symbol,
      'perspective(1000px) rotateY(-18deg) rotate(-6deg)',
      'perspective(1000px) rotateY(-3deg) rotate(1deg)',
      timing.covered,
      dwell + 150,
    );
  } else if (kind === 'match') {
    for (const [i, side] of ['upper', 'lower'].entries()) {
      const leaf = el(`gt-match-leaf gt-match-${side} gt-material-leaf`);
      sweep(leaf, ink ? `translate(0, ${i ? '101%' : '-101%'})` : `translate(${i ? '101%' : '-101%'}, 0)`, `translate(0, ${i ? '101%' : '-101%'})`);
    }
  } else {
    const names = { push: 'gt-push-sheet', frame: 'gt-veil', bands: 'gt-ink-field', convoy: 'gt-convoy', folio: 'gt-folio-leaf' };
    const plate = el(names[kind]);
    plate.className += ' gt-material-plate';
    const sign = options.direction === 'back' ? -1 : 1;
    const vertical = kind !== 'push' && (ink || kind === 'frame');
    sweep(plate, vertical ? `translateY(${sign * 101}%)` : `translateX(${-sign * 102}%)`, vertical ? `translateY(${-sign * 101}%)` : `translateX(${sign * 102}%)`);
    if (kind === 'bands') {
      const bank = el('gt-material-bands', plate);
      for (let i = 0; i < 3; i++) {
        const ribbon = el(`gt-material-ribbon gt-material-ribbon-${i}`, bank);
        sweep(ribbon, `translateX(${i % 2 ? 110 : -110}%)`, `translateX(${i % 2 ? -110 : 110}%)`);
      }
    }
    if (kind === 'frame') {
      const corners = el('gt-material-corners', plate);
      track(corners, [{ transform: 'scale(.88)' }, { transform: 'scale(1)' }], timing.covered, timing.exitStart - timing.covered);
    }
  }
  const copy = el('gt-static-copy');
  if (readingScene) {
    el('gt-reading-mark', copy, readingScene === 'letter' ? '致你' : readingScene === 'blackout' ? '夜读' : '翻开下一页');
    if (options.title) el('gt-static-title', copy, options.title);
    el('gt-match-holdnote', copy, '正在准备正文');
  } else if (kind !== 'push' && kind !== 'deal') {
  const note = kind === 'match' ? 'NEXT / ARENA OF BIAS' : 'ARENA OF BIAS / TRUST YOUR INSTINCT';
  el('gt-static-kicker', copy, note);
  el('gt-static-title', copy, title);
  el('gt-static-caption', copy, '下一场，凭直觉。');
  if (kind === 'bands' && options.words) {
    const ranks = el('gt-static-ranks', copy);
    options.words.slice(1).forEach((word, i) => el('gt-static-rank', ranks, `0${i + 1} / ${word}`));
  }
  const rule = el('gt-static-rule', copy);
  track(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], timing.covered, Math.max(100, timing.exitStart - timing.covered));
  if (kind === 'match') {
    el('gt-match-holdnote', copy, '正在接入试验场');
    const duel = el('gt-match-duel', copy);
    el('gt-match-side gt-match-side-a', duel, 'A');
    el('gt-match-link gt-match-link-a', duel);
    el('gt-match-joint', duel, '×');
    el('gt-match-link gt-match-link-b', duel);
    el('gt-match-side gt-match-side-b', duel, 'B');
  }
  }
  copy.hidden = true;
  (options.parent ?? document.body).append(layer);
  if (document.documentElement.dataset.scene) {
    layer.style.setProperty('--gt-paper', getComputedStyle(document.documentElement).getPropertyValue('--surface-e8ecdf'));
  }

  // Scene changes happen under the route curtain. Blend its material on the same
  // frame clock, so a stalled frame cannot leave a pale curtain over the dark page.
  const onSceneTone = () => {
    if (disposed) return;
    const rootStyle = getComputedStyle(document.documentElement);
    const surface = rootStyle.getPropertyValue('--surface-e8ecdf').trim();
    const text = rootStyle.getPropertyValue('--gt-text').trim();
    const start = Math.min(time, timing.exitStart);
    const duration = Math.max(120, timing.exitStart - start);
    layer.dataset.sceneBlend = 'true';
    layer.querySelectorAll<HTMLElement>('.gt-material-leaf, .gt-material-plate').forEach(node => {
      const target = kind === 'push' && !readingScene ? rootStyle.getPropertyValue('--foreground').trim() : surface;
      const wash = el('gt-scene-wash', node);
      wash.style.backgroundColor = target;
      track(wash, [{ opacity: 0 }, { opacity: 1 }], start, duration, 'ease-in-out');
    });
    copy.style.color = text;
  };
  window.addEventListener('aob:scene-tone', onSceneTone);

  const seek = (value: number) => {
    if (disposed) return;
    time = Math.max(0, Math.min(timing.duration, value));
    animations.forEach((animation) => {
      animation.currentTime = time;
    });
    // 阶段标记供外部对齐（决策 089）：竞技场开场牌在 match 扫出
    // 尾段提前接入，与作品揭幕并行落点，不干等整层移除
    // 钉幕等待（096）：门关着时纸幕停在 exitStart，仍算 entry——
    // 新页的门控只在真正扫出后才放揭幕
    // 帧率门（2026-09-19）：扫出未起时的钉幕仍算 entry/hold；扫出已起后的
    // 掉帧冻结只冻时间轴，不改阶段标记——幕布视觉上停在半开位等帧率恢复
    const held =
      kind === 'match' &&
      covered &&
      ((!!options.holdGate && !options.holdGate()) ||
        (smoothPinned && time <= timing.exitStart + 1));
    const phase = time >= timing.exitStart && !held ? 'exit' : 'entry';
    if (layer.dataset.gtPhase !== phase) layer.dataset.gtPhase = phase;
    if (held) layer.dataset.gtHold = '1';
    else if (layer.dataset.gtHold !== undefined) delete layer.dataset.gtHold;
    copy.hidden = time < timing.covered || (time >= timing.exitStart && !held);
    options.onFrame?.(time, timing.duration);
  };
  const pause = () => {
    running = false;
    previous = undefined;
    smoothPinned = false;
    slowSince = undefined;
    cancelAnimationFrame(frame);
  };
  const dispose = () => {
    pause();
    disposed = true;
    motionPreference.removeEventListener?.('change', onPreference);
    window.removeEventListener('aob:scene-tone', onSceneTone);
    animations.forEach((animation) => animation.cancel());
    layer.remove();
  };
  const complete = () => {
    dispose();
    options.onFinish?.();
  };
  const tick = (stamp: number) => {
    if (!running || disposed) return;
    if (reducedMode) {
      if (!covered) {
        covered = true;
        seek(timing.covered);
        options.onCovered?.();
      }
      // Reduced motion removes movement, never the real work-ready gate.
      if (options.holdGate && !options.holdGate()) {
        seek(timing.exitStart);
        frame = requestAnimationFrame(tick);
      } else complete();
      return;
    }
    const delta = previous === undefined ? 0 : stamp - previous;
    previous = stamp;
    smooth = delta <= SMOOTH_DELTA_MS ? smooth + 1 : 0;
    // Render the fully covered frame before allowing a page change. A delayed
    // frame must not jump from pre-cover to exit while changing the destination.
    // 钉幕门控（096）：holdGate 关门时把时间钳在 exitStart——纸幕保持盖满，
    // 牌面等门开才扫出（新竞技场作品就绪/超时/跳过，见 lib/works-gate.ts）
    const heldGate =
      kind === 'match' &&
      covered &&
      !!options.holdGate &&
      !options.holdGate();
    // 掉帧冻结不跳段（2026-09-19 卡顿轮）：按帧间墙钟差推进时，主线程饱和
    // 掉帧数秒会让时间轴一把追到终态——钉幕在释放帧被直接 seek 到终态、层
    // 瞬移除（扫出整段被吃），入场/中段装饰被整段跳过。单帧推进封顶后掉帧
    // 只冻不跳，恢复后从冻点续播；扫出段同帧时 scrub，不再交墙钟原生播放——
    // 饱和期合成器产不出帧时，墙钟时间轴会独自跑完，产帧恢复瞬间层已该移除，
    // 用户看到的就是半开纸幕凭空消失。
    // 释放撞掉帧：扫出还没起就继续钉幕（加载注记仍在），等连续正常帧再起扫；
    // 扫出已起则只冻不回弹——回弹到盖满位是另一种肉眼可见的跳变。
    const waitingForFrames =
      kind === 'match' &&
      covered &&
      !heldGate &&
      time >= timing.exitStart &&
      smooth < SMOOTH_FRAMES;
    if (!waitingForFrames) slowSince = undefined;
    else slowSince ??= stamp;
    smoothPinned = waitingForFrames && stamp - slowSince! < SMOOTH_WAIT_MS;
    const advanced = smoothPinned
      ? 0
      : Math.min(delta, FRAME_STEP_CAP) * Math.max(0.1, options.speed ?? 1);
    const next = heldGate
      ? Math.min(time + advanced, timing.exitStart)
      : time + advanced;
    seek(!covered && next >= timing.covered ? timing.covered :
      kind === 'match' && time < timing.exitStart && next >= timing.exitStart
        ? timing.exitStart : next);
    if (!covered && time >= timing.covered) {
      covered = true;
      options.onCovered?.();
    }
    if (time >= timing.duration) complete();
    else if (!disposed && running) frame = requestAnimationFrame(tick);
  };
  const play = () => {
    if (disposed || running) return;
    reducedMode = !!options.reduced || motionPreference.matches;
    if (reducedMode && !options.holdGate) {
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
  const onPreference = () => {
    reducedMode = !!options.reduced || motionPreference.matches;
    if (reducedMode && !disposed) { seek(timing.covered); if (!running) play(); }
  };
  motionPreference.addEventListener?.('change', onPreference);
  return { layer, timing, seek, play, pause, dispose };
}
