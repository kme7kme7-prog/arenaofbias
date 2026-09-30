let translateTransition = (text: string) => text;
export function setTransitionTranslator(translator: (text: string) => string) {
  translateTransition = translator;
}

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
  if (convoyNavRunning) return;
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

export function gameTransitionTiming(kind: GameTransitionKind, hold = 650) {
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
  let smooth = 0;
  let smoothPinned = false;
  const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reducedMode = !!options.reduced || motionPreference.matches;
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
  const ink = (options.theme ?? document.documentElement?.dataset.theme) === 'ink';
  layer.dataset.theme = ink ? 'ink' : 'paper';
  const motionEase = ink ? 'cubic-bezier(.25,.6,.25,1)' : ease;
  const sweep = (node: HTMLElement, from: string, out: string) => track(node, [
    { transform: from, offset: 0, easing: motionEase },
    { transform: 'translate(0, 0)', offset: timing.covered / timing.duration },
    { transform: 'translate(0, 0)', offset: timing.exitStart / timing.duration, easing: motionEase },
    { transform: out, offset: 1 },
  ], 0, timing.duration, 'linear');
  // Every moving surface is empty. Copy is a sibling, shown only at full cover.
  if (kind === 'match' || kind === 'deal') {
    for (const [i, side] of ['upper', 'lower'].entries()) {
      const leaf = el(kind === 'match' ? `gt-match-leaf gt-match-${side}` : `gt-deal-half gt-deal-half-${i}`);
      leaf.className += ' gt-material-leaf';
      if (kind === 'match') {
        sweep(leaf, ink ? `translate(0, ${i ? '101%' : '-101%'})` : `translate(${i ? '101%' : '-101%'}, 0)`, `translate(0, ${i ? '101%' : '-101%'})`);
      } else {
        sweep(leaf, ink ? `translate(0, ${i ? '101%' : '-101%'})` : `translate(${i ? '110%' : '-110%'}, 20%) rotate(${i ? 8 : -8}deg)`, `translate(${i ? '101%' : '-101%'}, 0)`);
      }
    }
  } else {
    const names = { frame: 'gt-veil', bands: 'gt-ink-field', convoy: 'gt-convoy', folio: 'gt-folio-leaf' };
    const plate = el(names[kind]);
    plate.className += ' gt-material-plate';
    const sign = options.direction === 'back' ? -1 : 1;
    sweep(plate, ink || kind === 'frame' ? `translateY(${sign * 101}%)` : `translateX(${-sign * 102}%)`, ink || kind === 'frame' ? `translateY(${-sign * 101}%)` : `translateX(${sign * 102}%)`);
    if (kind === 'bands') {
      const bank = el('gt-material-bands');
      for (let i = 0; i < 3; i++) {
        const ribbon = el(`gt-material-ribbon gt-material-ribbon-${i}`, bank);
        sweep(ribbon, `translateX(${i % 2 ? 110 : -110}%)`, `translateX(${i % 2 ? -110 : 110}%)`);
      }
    }
    if (kind === 'frame') {
      const corners = el('gt-material-corners');
      track(corners, [{ transform: 'scale(.88)' }, { transform: 'scale(1)' }], timing.covered, timing.exitStart - timing.covered);
    }
  }
  const copy = el('gt-static-copy');
  const note = kind === 'deal' ? 'DAILY / SEVEN CLUES' : kind === 'match' ? 'NEXT / ARENA OF BIAS' : 'ARENA OF BIAS / TRUST YOUR INSTINCT';
  el('gt-static-kicker', copy, note);
  el('gt-static-title', copy, kind === 'deal' ? '模一把' : title);
  el('gt-static-caption', copy, kind === 'deal' ? '七条线索，锁定一个名字。' : '下一场，凭直觉。');
  if (kind === 'bands' && options.words) {
    const ranks = el('gt-static-ranks', copy);
    options.words.slice(1).forEach((word, i) => el('gt-static-rank', ranks, `0${i + 1} / ${word}`));
  }
  const rule = el('gt-static-rule', copy);
  track(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], timing.covered, Math.max(100, timing.exitStart - timing.covered));
  if (kind === 'deal') {
    const clues = el('gt-static-clues', copy);
    for (let i = 0; i < 7; i++) {
      const clue = el('gt-deal-clue', clues, String(i + 1).padStart(2, '0'));
      // A tiny numeral is a micro element, not a moving text container.
      track(clue, [{ opacity: .3 }, { opacity: 1 }], timing.covered + i * 35, 140);
    }
  }
  if (kind === 'match') {
    el('gt-match-holdnote', copy, '正在接入试验场');
    const duel = el('gt-match-duel', copy);
    el('gt-match-side gt-match-side-a', duel, 'A');
    el('gt-match-link gt-match-link-a', duel);
    el('gt-match-joint', duel, '×');
    el('gt-match-link gt-match-link-b', duel);
    el('gt-match-side gt-match-side-b', duel, 'B');
  }
  copy.hidden = true;
  (options.parent ?? document.body).append(layer);

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
    cancelAnimationFrame(frame);
  };
  const dispose = () => {
    pause();
    disposed = true;
    motionPreference.removeEventListener?.('change', onPreference);
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
    smoothPinned =
      kind === 'match' &&
      covered &&
      !heldGate &&
      time >= timing.exitStart &&
      smooth < SMOOTH_FRAMES;
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
