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

  if (kind === 'match') {
    // Two opaque half sheets share a composition. The 1px overlap avoids a
    // fractional-pixel seam; both remain closed through the route commit.
    for (const [i, side] of ['upper', 'lower'].entries()) {
      const leaf = el(`gt-match-leaf gt-match-${side}`);
      const face = el('gt-match-face', leaf);
      const register = el('gt-match-register', face);
      el('gt-match-register-label', register, 'NEXT MATCH');
      el('gt-match-register-mark', register, '↗');
      el('gt-match-index', face, options.index || '→');
      const content = el('gt-match-content', face);
      el('gt-match-eyebrow', content, 'NEXT / ARENA OF BIAS');
      el('gt-match-title', content, title);
      const rule = el('gt-match-rule', content);
      el('gt-match-red', rule);
      el('gt-match-blue', rule);
      el('gt-match-caption', content, '下一场，凭直觉。 / MAKE YOUR CHOICE');
      // 钉幕等待期才显示的加载注记（data-gt-hold 门控）——牌面兼任加载屏
      el('gt-match-holdnote', content, '正在接入试验场');
      el('gt-match-corner', face, 'A / B');
      const duel = el('gt-match-duel', face);
      el('gt-match-side gt-match-side-a', duel, 'A');
      el('gt-match-link gt-match-link-a', duel);
      el('gt-match-joint', duel, '×');
      el('gt-match-link gt-match-link-b', duel);
      el('gt-match-side gt-match-side-b', duel, 'B');
      track(leaf, [
        { transform: `translate(${i === 0 ? '-101%' : '101%'}, 0)`, offset: 0, easing: ease },
        { transform: 'translate(0, 0)', offset: timing.covered / timing.duration },
        { transform: 'translate(0, 0)', offset: timing.exitStart / timing.duration, easing: ease },
        { transform: `translate(0, ${i === 0 ? '-101%' : '101%'})`, offset: 1 },
      ], 0, timing.duration, 'linear');
      move(content, 'translateY(14px)', 'translateY(0)', 180, 360);
      track(rule, [{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], 260, 400);
      track(duel, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'translateY(0)' }], 240, 340);
    }
  } else if (kind === 'folio') {
    const leaf = el('gt-folio-leaf');
    const sign = options.direction === 'back' ? -1 : 1;
    track(
      leaf,
      [
        { transform: `translateX(${sign * 102}%)`, offset: 0, easing: ease },
        {
          transform: 'translateX(0)',
          offset: timing.covered / timing.duration,
        },
        {
          transform: 'translateX(0)',
          offset: timing.exitStart / timing.duration,
          easing: ease,
        },
        { transform: `translateX(${-sign * 102}%)`, offset: 1 },
      ],
      0,
      timing.duration,
      'linear',
    );
  } else if (kind === 'frame') {
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
    const words = options.words ?? [
      title,
      'TRUST YOUR INSTINCT',
      '偏见 · 各有所爱',
    ];
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
