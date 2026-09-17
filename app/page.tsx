'use client';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { FixedHtmlWork } from '@/components/fixed-html-work';
import { workCanvas } from '@/lib/work-framing';

import { AccountButton, useAccount } from '@/components/account';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  ChevronDown,
  Crosshair,
  Expand,
  Eye,
  GalleryHorizontal,
  Fingerprint,
  ImageIcon,
  Laugh,
  LockKeyhole,
  Maximize,
  RotateCcw,
  Scale,
  ScrollText,
  SkipForward,
  ThumbsDown,
  ThumbsUp,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  arenaReducer,
  initialState,
  type ArenaState,
  type ArenaAction,
  type ModelResult,
  type Prompt,
  type Matchup,
  type Side,
} from '@/lib/arena';
import { currentPrompts } from '@/lib/prompts';
import { subscribeWorks } from '@/lib/works';
import {
  appendPlaceholderVote,
  currentMatchup,
  currentPairs,
  currentRandomArenaHash,
  currentResultsForPrompt,
  isPlaceholderMode,
} from '@/lib/placeholder';
import { submitVote } from '@/lib/votes';
import { submitReaction, type ReactionKind } from '@/lib/reactions';
import { DocumentDecryption } from '@/lib/decryption';
import {
  armTextSwap,
  consumeTextSwap,
  textSwapMask,
} from '@/lib/text-swap-mask';
import { scrollWorkToBottom } from '@/lib/scroll-tour';
import { schedulePromptScroll, alignArenaTransition } from '@/lib/arena-scroll';
import { createGameTransition } from '@/lib/game-transitions';
import { Afterparty } from '@/components/afterparty';
import { AudienceVerdict } from '@/components/vote-split';

const ABORTED = 'sequence-cancelled';
const motionQuery = '(prefers-reduced-motion: reduce)';
const ARENA_TIMING = {
  introLead: 1000,
  introReplayLead: 220,
  introGateTail: 240,
  introFocus: 700,
  introStaticHold: 950,
  introScrollLead: 300,
  introScrollSettle: 520,
  introReturn: 500,
  introGap: 200,
  introSettle: 300,
  resultReveal: 1350,
} as const;
// 「无法抉择」按钮的中文主标：每轮对局随机换一个（决策 048）
const DRAW_LABELS = [
  '不分伯仲',
  '难分高下',
  '旗鼓相当',
  '势均力敌',
  '半斤八两',
] as const;

/** 一票的落点反馈：真实模式写入服务端，占位模式写入本地（决策 020/021） */
type VoteOutcome =
  | { state: 'idle' }
  | { state: 'saving' }
  | { state: 'saved' }
  | { state: 'auth' }
  | { state: 'dup' }
  | { state: 'failed'; message: string };
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const getMotionPreference = () => window.matchMedia(motionQuery).matches;
const getServerMotionPreference = () => false;

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Error(ABORTED));
    const abort = () => {
      clearTimeout(timer);
      reject(new Error(ABORTED));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function Mark({ small = false }: { small?: boolean }) {
  return (
    <span className={`arena-mark ${small ? 'small' : ''}`} aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  );
}

function WebWork({
  side,
  interactive = false,
}: {
  side: Side;
  interactive?: boolean;
}) {
  const [booked, setBooked] = useState(false);
  const [destination, setDestination] = useState(false);
  return (
    <div className={`web-work web-${side}`}>
      <nav>
        <strong>{side === 'a' ? 'ORBITAL®' : 'luna.'}</strong>
        <span>THE NEXT FRONTIER</span>
        <span>↗</span>
      </nav>
      <div
        className="web-hero"
        style={{ backgroundImage: 'url(/art/lunar.webp)' }}
      >
        <span className="web-eyebrow">
          {side === 'a' ? '不止于此。' : 'YOUR NEXT GREAT ESCAPE'}
        </span>
        <h3>
          {side === 'a' ? (
            <>
              LEAVE
              <br />
              ORDINARY.
            </>
          ) : (
            <>
              Somewhere
              <br />
              <em>beyond.</em>
            </>
          )}
        </h3>
        <p>
          {side === 'a'
            ? '下一站，让地球成为风景。'
            : '把日常留在地球。把自己交给月光。'}
        </p>
        {interactive ? (
          <button onClick={() => setBooked(!booked)}>
            {booked ? '已加入出发名单 ✓' : '预订你的月球之旅'}{' '}
            <ArrowUpRight size={15} />
          </button>
        ) : (
          <span className="web-faux-button">
            {side === 'a' ? '探索月球航线' : 'Find your moon'} ↗
          </span>
        )}
      </div>
      <div className="web-bottom">
        <span>
          {side === 'a'
            ? '01 / LUNAR EXPEDITION'
            : '01 — The quiet side of the universe.'}
        </span>
        {interactive ? (
          <button onClick={() => setDestination(!destination)}>
            {destination ? '静海基地 · 7 天航程' : '查看目的地 ↗'}
          </button>
        ) : (
          <span>384,400 KM ↗</span>
        )}
      </div>
    </div>
  );
}

// 结果阶段的「本轮提示词」折叠条；父级用 key（题号+run）挂载，
// 换题/换组时整体重挂载，折叠状态随之归零
function PromptRecall({ round }: { round: Prompt }) {
  const { t, localize } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <section
      className="prompt-recall"
      data-open={open}
      aria-label={t('本轮提示词')}
    >
      <button
        type="button"
        className="prompt-recall-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="prompt-recall-tag">
          <ScrollText size={13} />
          {t('本轮提示词')}
        </span>
        <span className="prompt-recall-title">{round.name}</span>
        <span className="prompt-recall-meta">
          {t('THE PROMPT /')}
          {localize(round.id)}
        </span>
        <span className="prompt-recall-chevron" aria-hidden="true">
          <ChevronDown size={15} />
        </span>
      </button>
      <div className="prompt-recall-panel">
        <div className="prompt-recall-inner">
          <p>{round.prompt}</p>
        </div>
      </div>
    </section>
  );
}

// 揭晓后的模型反应条（点赞/点踩/大笑，2026-09-13 用户拍板）：
// 跟着题号累计、一人一槽可换态度；纸面仪器风——描边小圆钮 + 计数，不照搬爱心样例。
function ReactionBar({
  promptId,
  mid,
  modelLabel,
}: {
  promptId: string;
  mid: string;
  modelLabel: string;
}) {
  const { t, localize } = useI18n();
  const [mine, setMine] = useState<ReactionKind | null>(null);
  const [counts, setCounts] = useState<Record<ReactionKind, number> | null>(
    null,
  );
  const [burst, setBurst] = useState<ReactionKind | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/reactions?prompt=${encodeURIComponent(promptId)}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          counts?: Record<string, Partial<Record<ReactionKind, number>>>;
          mine?: Record<string, ReactionKind>;
        };
        if (cancelled) return;
        const row = data.counts?.[mid] ?? {};
        setCounts({
          up: row.up ?? 0,
          down: row.down ?? 0,
          laugh: row.laugh ?? 0,
        });
        setMine(data.mine?.[mid] ?? null);
      } catch {
        /* 拉不到就只显示零计数，不挡流程 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [promptId, mid]);
  const react = (kind: ReactionKind) => {
    const next = mine === kind ? null : kind;
    setMine(next);
    if (next) {
      setCounts((current) =>
        current ? { ...current, [kind]: current[kind] + 1 } : current,
      );
      setBurst(kind);
    } else {
      setCounts((current) =>
        current
          ? { ...current, [kind]: Math.max(0, current[kind] - 1) }
          : current,
      );
    }
    void submitReaction({
      // 取消态服务端按覆盖语义处理：送一个无害的重复（同 kind）等价于保留，
      // 真正的取消由本地镜像呈现；避免额外加 DELETE 接口
      id: crypto.randomUUID(),
      promptId,
      mid,
      kind: next ?? mine ?? 'up',
    });
  };
  const items: Array<{
    kind: ReactionKind;
    label: string;
    icon: ReactNode;
  }> = [
    { kind: 'up', label: '可以', icon: <ThumbsUp size={14} /> },
    { kind: 'down', label: '不行', icon: <ThumbsDown size={14} /> },
    { kind: 'laugh', label: '哈哈', icon: <Laugh size={16} /> },
  ];
  return (
    <div
      className={`reaction-bar ${burst ? `is-bursting reaction-burst-${burst}` : ''}`}
      onAnimationEnd={() => setBurst(null)}
      aria-label={t('对 {model} 的态度', { model: modelLabel })}
    >
      <span className="reaction-caption">{t('你的态度')}</span>
      {items.map(({ kind, label, icon }) => (
        <button
          key={kind}
          type="button"
          className={`reaction-chip reaction-${kind} ${mine === kind ? 'is-picked' : ''}`}
          onClick={() => react(kind)}
          aria-pressed={mine === kind}
          aria-label={`${t(label)} (${counts?.[kind] ?? 0})`}
        >
          <span className="reaction-icon">{localize(icon)}</span>
          <span className="reaction-count">{counts?.[kind] ?? 0}</span>
          <span className="reaction-dots" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
        </button>
      ))}
    </div>
  );
}

function Work({
  result,
  side,
  expanded = false,
  interactive = false,
  imageFailed = false,
}: {
  result: ModelResult;
  side: Side;
  expanded?: boolean;
  /** 小预览也允许交互（点击画面、作品内按钮）——投票阶段才开启 */
  interactive?: boolean;
  imageFailed?: boolean;
}) {
  const { t, localize } = useI18n();
  if (result.content.kind === 'image')
    return imageFailed ? (
      <div className="asset-error">
        <ImageIcon />
        <strong>{t('画面暂时未能载入')}</strong>
        <span>{t('可先切换至文字或网页对决')}</span>
      </div>
    ) : (
      <img
        className="concept-image"
        src={result.content.src}
        width={1536}
        height={1024}
        alt={result.content.alt}
        draggable={false}
      />
    );
  if (result.content.kind === 'web')
    return <WebWork side={result.content.template} interactive={expanded} />;
  if (result.content.kind === 'html') {
    const { content } = result;
    const canvas = workCanvas(result);
    if (canvas) return (
      <FixedHtmlWork
        content={content}
        title={result.title}
        canvas={canvas}
        interactive={interactive}
      />
    );
    // 内联占位作品（srcDoc）不加载外部资源，沙箱保持最小权限
    const inline = 'html' in content;
    // 取景参数只随预览态注入：作品内补丁据此切换「预览取景 / 放大后看原始全貌」
    const src = inline
      ? undefined
      : expanded
        ? content.src
        : `${content.src}${content.src.includes('?') ? '&' : '?'}aob=prev`;
    return (
      <iframe
        className="html-work"
        title={result.title}
        src={src}
        srcDoc={inline ? content.html : undefined}
        sandbox={inline ? 'allow-scripts' : 'allow-scripts allow-same-origin'}
        inert={!interactive}
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      />
    );
  }
  const story = result.content.story;
  return (
    <article className={`story-work story-${side}`} data-tour-scroll>
      <div className="story-meta">
        <span>{t('一封未寄出的信')}</span>
        <span>23:59:59</span>
      </div>
      <h3>
        {story.heading}
        <span>{t('。')}</span>
      </h3>
      <div className="story-body">
        {story.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <footer>
        <span>{localize(story.ending)}</span>
        <AudioLines size={20} />
      </footer>
    </article>
  );
}

export default function Arena({
  prompt,
  formal = false,
}: {
  prompt: Prompt;
  // 正式测评（决策 024）：全程匿名、无评论区；地址 #formal/{promptId}
  formal?: boolean;
}) {
  const { t, localize } = useI18n();
  const promptIndex = currentPrompts().findIndex(
    (item) => item.id === prompt.id,
  );
  // 动态题库（决策 045）：SWITCH 越界守卫用当前题目数，而不是种子快照
  const [state, dispatch] = useReducer(
    (state: ArenaState, action: ArenaAction) =>
      arenaReducer(state, action, currentPrompts().length),
    {
      ...initialState,
      mode: formal ? 'formal' : 'blind',
      round: promptIndex,
      pendingRound: promptIndex,
    },
  );
  const [pair, setPair] = useState<Matchup>(() => currentMatchup(prompt.id)!);
  // 远端清单晚到时重算对局（2026-09-15 修复）：应用启动先以内置花名册起画，
  // /api/works 返回后若不重算，棋盘还是内置作品而统计区已切远端数据——
  // 票面与服务端作品表核对不上，投票会 400。订阅 works 变化重抽一组。
  useEffect(
    () =>
      subscribeWorks(() => {
        setPair(
          (current) => currentMatchup(prompt.id, current) ?? current,
        );
      }),
    [prompt.id],
  );
  const pairCount = currentPairs(prompt.id).length;
  const resultCount = currentResultsForPrompt(prompt.id).length;
  // 平局按钮的中文主标：按 run 散列轮换成语（每轮对局换一个，纯推导不存状态）
  const drawLabel = DRAW_LABELS[(state.run * 37 + 11) % DRAW_LABELS.length];
  const [spotlight, setSpotlight] = useState<Side | null>(null);
  const [expanded, setExpanded] = useState<Side | null>(null);
  const [sound, setSound] = useState(false);
  // 「逐个巡览」开关（aob-arena-tour，决策 077/090）：桌面默认关闭、
  // 用户手动开过才记 'on'；移动端该功能整体下线（有严重 bug），
  // 开关隐藏、入场序列也不跑巡览。关闭时入场只保留开场牌一拍，
  // 不再依次放大 A/B 两份作品，直接开放投票。
  const [tour, setTour] = useState(() => {
    try {
      return localStorage.getItem('aob-arena-tour') === 'on';
    } catch {
      return false;
    }
  });
  // 路由过场层（convoy / page-wipe）未离场前不挂开场牌，避免两段动画叠放
  const [arrivalReady, setArrivalReady] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getMotionPreference,
    getServerMotionPreference,
  );
  const [failedAssets, setFailedAssets] = useState<string[]>([]);
  // 只剩当前一个可用竞技场时，随机入口会抽回同一题——hash 不变不触发路由，
  // 按钮看起来就像失灵了。提示一句代替静默无反应（2026-09-15）
  const [soloNotice, setSoloNotice] = useState(false);
  const gotoRandomArena = () => {
    const next = currentRandomArenaHash(prompt.id);
    if (next === window.location.hash) {
      setSoloNotice(true);
      setTimeout(() => setSoloNotice(false), 3000);
      return;
    }
    if (arenaTransition.current) return;
    // 娱乐模式「下一题」：双页纸幕只盖住场内区域（field-meta → 操作行），
    // 盖满时切 hash。层必须挂在 body 上才能活过组件卸载完成扫出；
    // 新竞技场的开场牌有 .game-transition 等待门控，会自动接在扫出之后。
    const terminal = terminalRef.current;
    const parts = terminal
      ? [
          terminal.querySelector('.field-meta'),
          stageRef.current,
          terminal.querySelector('.round-console'),
        ].filter((el): el is HTMLElement => el instanceof HTMLElement)
      : [];
    if (!parts.length) {
      window.location.hash = next;
      return;
    }
    const rects = parts.map((el) => el.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const destination = currentPrompts().find((item) => `#arena/${item.id}` === next);
    const transition = createGameTransition('match', {
      title: destination?.name,
      index: destination?.id,
      onFrame: () => alignArenaTransition(transition.layer),
      onCovered: () => {
        window.location.hash = next;
      },
      onFinish: () => {
        arenaTransition.current = null;
      },
    });
    arenaTransition.current = transition;
    // 纸幕只盖场内区域；盖区外会变动的文本行先用纸条遮住（决策 089），
    // 新页挂载后由 consumeTextSwap + reveal 接手错峰揭开
    armTextSwap();
    textSwapMask.cover(terminal, reducedMotion);
    const layerStyle = transition.layer.style;
    alignArenaTransition(transition.layer);
    // Long mobile stages extend beyond the viewport. Keep the interlude's
    // title in the visible portion without changing the area being covered.
    const visibleTop = Math.max(0, top);
    const visibleBottom = Math.min(window.innerHeight, bottom);
    layerStyle.setProperty('--gt-match-center', `${(visibleTop + visibleBottom) / 2 - top}px`);
    transition.play();
  };
  const stageRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<HTMLElement>(null);
  const briefingRef = useRef<HTMLElement>(null);
  // 「下一题」区域纸幕的防重入锁：层挂 body 活过组件卸载，onFinish 才释放
  const arenaTransition = useRef<ReturnType<
    typeof createGameTransition
  > | null>(null);
  const cardA = useRef<HTMLDivElement>(null);
  const cardB = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  const animations = useRef<Animation[]>([]);
  const round = {
    ...prompt,
    models: pair.map((entry) => entry.modelName),
    labels: pair.map((entry) => entry.title),
  };
  const revealed =
    state.mode === 'party' ||
    (state.phase === 'result' && state.mode !== 'formal');
  const transitioning = state.phase === 'transition';
  const blocked = state.phase === 'loading' || transitioning;

  const play = useCallback((kind: 'hover' | 'move' | 'vote' | 'reveal') => {
    if (!soundRef.current || !audioRef.current) return;
    const context = audioRef.current;
    const now = context.currentTime;
    const duration = kind === 'reveal' ? 0.7 : kind === 'vote' ? 0.4 : 0.09;
    const notes =
      kind === 'reveal'
        ? [261.63, 392, 523.25]
        : [kind === 'hover' ? 620 : kind === 'vote' ? 130 : 320];
    notes.forEach((freq, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = kind === 'vote' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(freq, now);
      if (kind === 'vote')
        oscillator.frequency.exponentialRampToValueAtTime(65, now + duration);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(
        0.055 / notes.length,
        now + 0.012 + index * 0.045,
      );
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.02);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
  }, []);

  useEffect(() => {
    if (!briefingRef.current) return;
    return schedulePromptScroll(briefingRef.current, getMotionPreference());
  }, [prompt.id, state.run]);

  useEffect(() => {
    let live = true;
    const assets = currentResultsForPrompt(prompt.id).flatMap((entry) =>
      entry.content.kind === 'image'
        ? [entry.content.src]
        : entry.content.kind === 'web'
          ? ['/art/lunar.webp']
          : [],
    );
    const pending = [...new Set(assets)].map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          let done = false;
          const finish = (failed: boolean) => {
            if (done) return;
            done = true;
            clearTimeout(timeout);
            if (failed && live)
              setFailedAssets((previous) => [...previous, src]);
            resolve();
          };
          const timeout = setTimeout(() => finish(true), 10000);
          img.onload = () => finish(false);
          img.onerror = () => finish(true);
          img.src = src;
        }),
    );
    void Promise.all(pending).then(() => {
      if (live) dispatch({ type: 'LOADED' });
    });
    return () => {
      live = false;
    };
  }, [prompt.id]);

  useEffect(() => {
    if (state.phase !== 'intro') return;
    const controller = new AbortController();
    const signal = controller.signal;
    const resetScroll = () => {
      stageRef.current
        ?.querySelectorAll<HTMLElement>('[data-tour-scroll]')
        .forEach((work) => {
          work.scrollTop = 0;
        });
    };
    const animate = async (
      element: HTMLElement,
      frames: Keyframe[],
      duration: number,
    ) => {
      const animation = element.animate(frames, {
        duration,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'both',
      });
      animations.current.push(animation);
      await delay(duration, signal);
    };
    const sequence = async () => {
      resetScroll();
      if (reducedMotion) {
        await delay(200, signal);
        dispatch({ type: 'READY' });
        return;
      }
      // 菜单→竞技场的过场层还挂在 body 上时等它扫出完毕：开场牌从过场
      // 结束才开始播，不与色块叠放。封顶等待兜底过场异常滞留。
      // 例外（决策 089）：match 双页扫出尾段提前放牌，让牌面入场与
      // 下方作品揭幕并行落点；其余过场仍等整层离场。
      for (let waited = 0; waited < 2600; waited += 40) {
        const layer = document.querySelector<HTMLElement>(
          '.game-transition, .page-wipe',
        );
        if (!layer) break;
        if (
          layer.classList.contains('gt-match') &&
          layer.dataset.gtPhase === 'exit'
        ) {
          await delay(ARENA_TIMING.introGateTail, signal);
          break;
        }
        await delay(40, signal);
      }
      setArrivalReady(true);
      await delay(
        state.run === 0 ? ARENA_TIMING.introLead : ARENA_TIMING.introReplayLead,
        signal,
      );
      // 移动端巡览整体下线（决策 090）：窄屏无论开关如何都跳过 A/B 聚焦
      if (!tour || window.innerWidth < 700) {
        dispatch({ type: 'READY' });
        return;
      }
      for (const side of ['a', 'b'] as const) {
        const element = side === 'a' ? cardA.current : cardB.current;
        const stage = stageRef.current;
        if (!element || !stage) return;
        const bounds = element.getBoundingClientRect();
        const stageBounds = stage.getBoundingClientRect();
        const x =
          stageBounds.left +
          stageBounds.width / 2 -
          bounds.left -
          bounds.width / 2;
        const mobile = window.innerWidth < 700;
        const scale = mobile
          ? Math.min(1.8, (window.innerHeight - 150) / bounds.height)
          : Math.min(1.5, (window.innerHeight - 220) / bounds.height);
        const focusTransform = `translate3d(${x}px,0,0) scale(${Math.max(scale, 1.03)})`;
        setSpotlight(side);
        play('move');
        await animate(
          element,
          [
            { transform: 'translate3d(0,35px,0) scale(.94)', opacity: 0.45 },
            { transform: focusTransform, opacity: 1 },
          ],
          ARENA_TIMING.introFocus,
        );
        const scrollable =
          element.querySelector<HTMLElement>('[data-tour-scroll]');
        const hasScrollTour =
          !!scrollable && scrollable.scrollHeight - scrollable.clientHeight > 1;
        if (scrollable && hasScrollTour) {
          await delay(ARENA_TIMING.introScrollLead, signal);
          await scrollWorkToBottom(
            scrollable,
            signal,
            prompt.kind === 'text' ? 48 : 62,
          );
          await delay(ARENA_TIMING.introScrollSettle, signal);
        } else {
          await delay(ARENA_TIMING.introStaticHold, signal);
        }
        await animate(
          element,
          [
            { transform: focusTransform },
            { transform: 'translate3d(0,0,0) scale(1)' },
          ],
          ARENA_TIMING.introReturn,
        );
        if (scrollable) scrollable.scrollTop = 0;
        setSpotlight(null);
        await delay(ARENA_TIMING.introGap, signal);
      }
      await delay(ARENA_TIMING.introSettle, signal);
      play('reveal');
      dispatch({ type: 'READY' });
    };
    sequence().catch((error) => {
      if (!signal.aborted && error?.name !== 'AbortError')
        dispatch({ type: 'READY' });
    });
    return () => {
      controller.abort();
      animations.current.forEach((animation) => animation.cancel());
      animations.current = [];
      resetScroll();
      setSpotlight(null);
    };
  }, [
    state.phase,
    state.run,
    state.round,
    prompt.kind,
    reducedMotion,
    play,
    tour,
  ]);

  useEffect(() => {
    const timeout =
      state.phase === 'transition'
        ? setTimeout(
            () => {
              setExpanded(null);
              dispatch({ type: 'ARRIVE' });
            },
            reducedMotion ? 50 : 620,
          )
        : state.phase === 'locking'
          ? setTimeout(
              () => {
                play('reveal');
                dispatch({ type: 'REVEAL' });
              },
              reducedMotion ? 80 : ARENA_TIMING.resultReveal,
            )
          : null;
    return () => {
      if (timeout) clearTimeout(timeout);
    };
  }, [state.phase, reducedMotion, play]);

  // 盲测揭晓时的身份解密：真实身份一挂载就用遮黑条盖住（layout effect 保证
  // 用户看不到未遮盖的名字），再按行错峰退开。娱乐模式身份全程公开不解密。
  const decryptionRef = useRef<DocumentDecryption | null>(null);
  useLayoutEffect(() => {
    if (!decryptionRef.current)
      decryptionRef.current = new DocumentDecryption('.model-identity');
    const decryption = decryptionRef.current;
    if (revealed && state.mode === 'blind' && stageRef.current) {
      decryption.reset(stageRef.current, false);
      decryption.reveal(reducedMotion);
    } else {
      decryption.dispose();
    }
    return () => decryption.dispose();
  }, [revealed, state.mode, reducedMotion]);

  // 换题文字纸条的下半程（决策 089）：上一页 cover 已遮住旧文本行，
  // 本页挂载后立即按新行位铺纸条（layout effect 保证用户看不到未遮盖的
  // 新文字），再错峰退开。只在本页经「下一题」换场到达时才揭——
  // 菜单入场/首次加载未遮过字，consumeTextSwap 返回 false 不动作。
  useLayoutEffect(() => {
    if (consumeTextSwap() && terminalRef.current)
      textSwapMask.reveal(terminalRef.current, reducedMotion);
    return () => textSwapMask.dispose();
  }, [reducedMotion]);

  // 反馈与提交时所属的对局（run）绑定：换组、重播、切模式都会递增 run，
  // 旧 run 的提交结果——包括网络晚到的响应——不会再覆盖新一轮的反馈
  const [voteRecord, setVoteRecord] = useState<{
    run: number;
    outcome: VoteOutcome;
  }>({ run: state.run, outcome: { state: 'idle' } });
  const voteOutcome: VoteOutcome =
    voteRecord.run === state.run ? voteRecord.outcome : { state: 'idle' };
  const { open: openAccount } = useAccount();

  const recordVote = useCallback(
    (side: Side | 'draw') => {
      // 平局（决策 048）：双方按出场左右顺序登记（a 入 winner、b 入 loser），无胜负语义
      const winner = side === 'b' ? pair[1] : pair[0];
      const loser = side === 'b' ? pair[0] : pair[1];
      const outcome = side === 'draw' ? ('draw' as const) : ('win' as const);
      if (isPlaceholderMode()) {
        const appended = appendPlaceholderVote({
          promptId: prompt.id,
          winnerId: winner.modelId,
          loserId: loser.modelId,
          outcome,
        });
        setVoteRecord({
          run: state.run,
          outcome: { state: appended ? 'saved' : 'dup' },
        });
        return;
      }
      setVoteRecord({ run: state.run, outcome: { state: 'saving' } });
      void submitVote({
        id: crypto.randomUUID(),
        promptId: prompt.id,
        winnerRid: winner.id,
        winnerMid: winner.modelId,
        loserRid: loser.id,
        loserMid: loser.modelId,
        mode: state.mode,
        outcome,
      }).then((result) => {
        setVoteRecord({
          run: state.run,
          outcome: result.ok
            ? { state: 'saved' }
            : result.issue === 'auth'
              ? { state: 'auth' }
              : result.issue === 'dup'
                ? { state: 'dup' }
                : { state: 'failed', message: result.error },
        });
      });
    },
    [pair, prompt.id, state.mode, state.run],
  );

  const vote = useCallback(
    (side: Side | 'draw') => {
      if (state.phase !== 'voting') return;
      play('vote');
      dispatch({ type: 'VOTE', side });
      recordVote(side);
    },
    [state.phase, play, recordVote],
  );
  const nextMatchup = useCallback(() => {
    if (state.phase === 'loading' || state.phase === 'transition') return;
    play('move');
    setPair((current) => currentMatchup(prompt.id, current)!);
    dispatch({ type: 'REPLAY' });
  }, [state.phase, prompt.id, play]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        expanded ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.repeat
      )
        return;
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches('button,input,textarea,select,[role="tab"]') ||
          event.target.isContentEditable)
      )
        return;
      if (event.key.toLowerCase() === 'a') vote('a');
      if (event.key.toLowerCase() === 'd') vote('b');
      if (event.key.toLowerCase() === 's') vote('draw');
      if (event.key.toLowerCase() === 'n') nextMatchup();
      if (event.key === ' ' && state.phase === 'intro') {
        event.preventDefault();
        dispatch({ type: 'READY' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [vote, nextMatchup, state.round, state.phase, expanded]);

  useEffect(
    () => () => {
      void audioRef.current?.close();
    },
    [],
  );

  const toggleSound = async () => {
    const enabled = !sound;
    if (enabled) {
      try {
        audioRef.current ??= new AudioContext();
        await audioRef.current.resume();
      } catch {
        return;
      }
    }
    soundRef.current = enabled;
    setSound(enabled);
    if (enabled) play('move');
  };

  const toggleTour = () => {
    setTour((current) => {
      const next = !current;
      try {
        localStorage.setItem('aob-arena-tour', next ? 'on' : 'off');
      } catch {}
      return next;
    });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const statusText =
    state.phase === 'loading'
      ? '画面载入中'
      : state.phase === 'intro'
        ? spotlight
          ? t('正在观测作品 {side}', { side: spotlight.toUpperCase() })
          : '作品入场'
        : state.phase === 'voting'
          ? '做出选择'
          : state.phase === 'locking'
            ? '选择已锁定'
            : state.phase === 'result'
              ? '本轮评审完成'
              : '正在切换对局';

  return (
    <div
      className={`arena-shell phase-${state.phase} ${spotlight ? `spotlight-${spotlight}` : ''} ${reducedMotion ? 'reduced-motion' : ''}`}
    >
      <div className="ambient-grid" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#home" aria-label={t('回到首页')}>
          <Mark />
          <div>
            <strong>
              {t('ARENA OF')} <span className="brand-tag">{t('BIAS')}</span>
            </strong>
          </div>
        </a>
        <div className="header-divider" />
        <div className="terminal-label">
          <span className="live-dot" />
          {localize(' ')}
          <a href="#home" className="arena-home-link">
            {t('返回首页')}
          </a>
          {localize(' ')}
          <a href="#prompts" className="arena-home-link">
            {t('/ 提示词库')}
          </a>
        </div>
        <div className="header-right">
          <LanguageSwitch />
          <AccountButton />

          <button
            className={`icon-button ${sound ? 'on' : ''}`}
            onClick={toggleSound}
            aria-label={t(sound ? '关闭音效' : '开启音效')}
            title={t(sound ? '关闭音效' : '开启音效')}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="icon-button fullscreen-button"
            onClick={toggleFullscreen}
            aria-label={t('切换全屏')}
            title={t('切换全屏')}
          >
            <Maximize size={17} />
          </button>
        </div>
      </header>

      <main className="main-terminal" ref={terminalRef}>
        <div className="spatial-session" aria-label={t('评审进度')}>
          <span>
            {t('OBSERVATION /')}
            {localize(round.id)}
          </span>
          {['观看作品', '做出选择', '身份揭晓'].map((label, index) => {
            const active =
              index ===
              (state.phase === 'result'
                ? 2
                : state.phase === 'voting' || state.phase === 'locking'
                  ? 1
                  : 0);
            return (
              <span key={label} className={active ? 'active' : ''}>
                <i />0{index + 1} / {localize(label)}
              </span>
            );
          })}
        </div>
        <section className="command-row">
          <div className="section-heading">
            <h1>
              {t('直觉，即是答案')}
              <span>{t('。')}</span>
            </h1>
          </div>
          <div className="mode-tabs mode-static" aria-label={t('评审模式')}>
            <span className="mode-static-label">
              <Fingerprint size={17} />
              <span>
                {localize(state.mode === 'formal' ? '正式测评' : '娱乐测评')}
              </span>
            </span>
            <p>
              {localize(
                state.mode === 'formal'
                  ? '全程匿名：任何环节都不揭示模型名称，也没有评论区。'
                  : '隐藏名字，只看作品；做出选择后揭晓身份。',
              )}
            </p>
          </div>
        </section>

        <section
          className="briefing"
          ref={briefingRef}
          aria-label={t('本轮创作要求')}
        >
          <div className="round-tag">
            <Crosshair size={19} />
            <span>
              {t('Round Start')}
              <b data-swap>{localize(round.id)}</b>
            </span>
          </div>
          <div className="briefing-copy">
            <span className="prompt-label">{t('本轮命题')}</span>
            {round.prompt.length > 90 ? (
              <details className="prompt-disclosure" key={round.id}>
                <summary>
                  <span data-swap>{round.name}</span>
                  <span className="prompt-disclosure-label">
                    {t('查看完整提示词')}
                  </span>
                </summary>
                <p data-swap>{round.prompt}</p>
              </details>
            ) : (
              <h2 key={round.id} data-swap>
                {round.prompt}
              </h2>
            )}
          </div>
          <span className="briefing-detail" data-swap>
            {round.detail}
          </span>
          <div className="briefing-corner" aria-hidden="true" />
        </section>

        <aside
          className="match-commentary"
          key={`commentary-${round.id}`}
          aria-label={t('本题旁白')}
        >
          <span className="commentary-badge">
            <Mark small />
            {t('评审附言')}
          </span>
          <p data-swap>“{round.commentary}”</p>
        </aside>
        <div className="field-meta">
          <span>
            <i /> {t('LIVE COMPARISON')}
            <span className="meta-slash">/</span>
            {localize(' ')}
            {localize(round.category)}
          </span>
          <output className="field-status" aria-live="polite">
            <i />
            {localize(statusText)}
          </output>
          <span className="meta-right">
            {state.mode === 'blind' ? (
              <LockKeyhole size={12} />
            ) : (
              <Eye size={12} />
            )}
            {localize(' ')}
            {localize(revealed ? 'IDENTITY OPEN' : 'IDENTITY ENCRYPTED')}
          </span>
        </div>

        <div className="arena-stage" ref={stageRef}>
          {(state.phase === 'locking' || state.phase === 'result') && state.choice && state.mode !== 'formal' && (
            <AudienceVerdict
              key={state.run}
              promptId={prompt.id}
              leftRid={pair[0].id}
              rightRid={pair[1].id}
              choice={state.choice}
              settled={voteOutcome.state !== 'saving' && voteOutcome.state !== 'idle'}
              placeholder={isPlaceholderMode()}
            />
          )}
          <div className="stage-watermark" aria-hidden="true">
            {localize(spotlight ? spotlight.toUpperCase() : 'VS')}
          </div>
          {(['a', 'b'] as const).map((side, index) => {
            const chosen = state.choice === side;
            const result = pair[index];
            return (
              <div
                key={side}
                className={`contender contender-${side} ${chosen ? 'is-chosen' : ''} ${state.choice && state.choice !== 'draw' && !chosen ? 'not-chosen' : ''}`}
              >
                <div className="work-panel" ref={index === 0 ? cardA : cardB}>
                  <div className="panel-heading">
                    <div className="panel-identity">
                      <span className="side-letter">
                        {localize(side.toUpperCase())}
                      </span>
                      <span className="model-identity">
                        {localize(revealed ? round.models[index] : '未知模型')}
                      </span>
                    </div>
                    <span className="entry-number">
                      {localize(round.code)} / 0{index + 1}
                    </span>
                    {chosen && (
                      <span className="identity-pick">
                        <Check size={14} />{t('YOUR PICK')}
                      </span>
                    )}
                    <span className="panel-lock">
                      {revealed ? <Eye size={15} /> : <LockKeyhole size={15} />}
                    </span>
                  </div>
                  <div
                    className={`work-viewport ${prompt.kind === 'text' ? 'is-story' : ''} ${workCanvas(result) ? 'is-fixed-canvas' : ''}`}
                  >
                    <div
                      className="work-inner"
                      key={`${state.round}-${side}`}
                      data-tour-scroll={
                        prompt.kind === 'web' && !workCanvas(result) ? true : undefined
                      }
                    >
                      <Work
                        result={result}
                        side={side}
                        // 投票阶段（及揭晓后）小预览也允许交互：点击画面、作品内按钮
                        interactive={
                          state.phase === 'voting' || state.phase === 'result'
                        }
                        imageFailed={
                          result.content.kind === 'image' &&
                          failedAssets.includes(result.content.src)
                        }
                      />
                    </div>
                    <span className="image-corner tl" aria-hidden="true" />
                    <span className="image-corner br" aria-hidden="true" />
                    {prompt.kind === 'image' && (
                      <div className="image-caption">
                        <span>
                          {t('EXHIBIT')}
                          {localize(side.toUpperCase())}
                        </span>
                        <strong>{round.labels[index]}</strong>
                      </div>
                    )}
                    <button
                      className="expand-control"
                      onClick={() => setExpanded(side)}
                      disabled={state.phase === 'intro' || blocked}
                      aria-label={t('放大查看作品 {side}', {
                        side: side.toUpperCase(),
                      })}
                      title={t(
                        prompt.kind === 'web' ? '打开交互预览' : '放大查看',
                      )}
                    >
                      <Expand size={17} />
                    </button>
                  </div>
                  <div className="panel-bottom">
                    <span>
                      <i />
                      {localize(
                        state.phase === 'result'
                          ? '身份已揭晓'
                          : prompt.kind === 'web'
                            ? 'HTML / 可打开交互预览'
                            : prompt.kind === 'text'
                              ? 'TEXT / 短篇创作'
                              : 'IMAGE / 概念设计',
                      )}
                    </span>

                    <span>
                      0{index + 1} — {localize(round.id)}
                    </span>
                  </div>
                </div>
                <button
                  className={`vote-button vote-${side}`}
                  onClick={() => vote(side)}
                  onPointerEnter={() => play('hover')}
                  disabled={state.phase !== 'voting'}
                >
                  <span className="vote-icon">
                    {chosen ? <Check size={24} /> : <ArrowUpRight size={25} />}
                  </span>
                  <span className="vote-copy">
                    <strong>
                      {localize(
                        side === 'a' ? '我寻思这边能行' : '显然是这边厉害',
                      )}
                    </strong>
                  </span>
                  <kbd>{localize(side === 'a' ? 'A' : 'D')}</kbd>
                </button>
                {state.phase === 'result' && (
                  <div className="side-result">
                    <span>
                      {localize(
                        state.choice === 'draw'
                          ? '难以取舍'
                          : chosen
                            ? '你站在了这一边'
                            : '另一种直觉',
                      )}
                    </span>
                    <strong>
                      {localize(
                        state.choice === 'draw'
                          ? '平局'
                          : chosen
                            ? '已选择'
                            : '未选择',
                      )}
                    </strong>
                  </div>
                )}
                {state.phase === 'result' &&
                  state.mode !== 'formal' &&
                  revealed && (
                    <ReactionBar
                      promptId={prompt.id}
                      mid={result.modelId}
                      modelLabel={round.models[index]}
                    />
                  )}
              </div>
            );
          })}
          <div className="draw-row">
            <span className="draw-rule" aria-hidden="true" />
            <button
              className={`vote-draw ${state.choice === 'draw' ? 'is-draw-picked' : ''}`}
              onClick={() => vote('draw')}
              onPointerEnter={() => play('hover')}
              disabled={state.phase !== 'voting'}
            >
              <span className="vote-icon">
                {state.choice === 'draw' ? (
                  <Check size={19} />
                ) : (
                  <Scale size={18} />
                )}
              </span>
              <span className="vote-copy">
                <strong>{localize(drawLabel)}</strong>
              </span>
              <kbd>{t('S')}</kbd>
            </button>
            <span className="draw-rule" aria-hidden="true" />
          </div>
          <div className="versus-spine" aria-hidden="true">
            <div className="spine-line" />
            <div className="vs-emblem">
              <span className="vs-orbit" />
              <span className="vs-orbit second" />
              <b>{t('VS')}</b>
            </div>

            <div className="spine-line" />
          </div>
          {state.phase === 'intro' && state.run === 0 && arrivalReady && (
            <div className="intro-label" key={state.run} aria-hidden="true">
              <span>{t('NEW ENCOUNTER')}</span>
              <strong>
                {t('Round Start')}
                <b>{localize(round.id)}</b>
              </strong>
              <span>{t('两种表达。一个选择。')}</span>
            </div>
          )}
          {state.phase === 'loading' && (
            <div className="loading-overlay">
              <Mark />
              <span>{t('正在接入试验场')}</span>
              <div className="load-track" />
            </div>
          )}
          <div className="transition-shutter" aria-hidden="true">
            <span>{t('SWITCHING FREQUENCY')}</span>
            <b>{localize(String(state.pendingRound + 1).padStart(2, '0'))}</b>
          </div>
        </div>

        {state.phase === 'result' && (
          <PromptRecall key={`${round.id}-${state.run}`} round={round} />
        )}

        <div
          className={`round-console ${state.phase === 'result' ? 'show-result' : ''}`}
        >
          {state.phase === 'result' ? (
            <div className="result-console">
              <div className="result-caption">
                <Check size={17} />
                <strong>
                  {localize(
                    state.choice === 'draw'
                      ? '选不出来，也是一种答案。'
                      : '好，你有自己的答案。',
                  )}
                </strong>
                <span className="vote-note" data-state={voteOutcome.state}>
                  {localize(
                    voteOutcome.state === 'saved' &&
                      (isPlaceholderMode()
                        ? '已写入本地演示数据 · 占位模式'
                        : state.choice === 'draw'
                          ? '平局已计入偏好榜，双方各得半分'
                          : '你的选择已计入偏好榜'),
                  )}
                  {voteOutcome.state === 'auth' && (
                    <button
                      type="button"
                      className="vote-note-login"
                      onClick={openAccount}
                    >
                      {t('登录后，你的选择会计入偏好榜 ↗')}
                    </button>
                  )}
                  {localize(
                    voteOutcome.state === 'dup' && '这一对作品你已经投过票了',
                  )}
                  {localize(
                    voteOutcome.state === 'failed' && voteOutcome.message,
                  )}
                  {localize(
                    (voteOutcome.state === 'idle' ||
                      voteOutcome.state === 'saving') &&
                      '正在记录你的选择…',
                  )}
                </span>
                <a className="result-board-link" href="#rank">
                  {t('看看偏好榜 ↗')}
                </a>
              </div>
            </div>
          ) : (
            <div className="sequence-steps">
              <span
                className={
                  state.phase === 'intro' || state.phase === 'loading'
                    ? 'current'
                    : 'complete'
                }
              >
                <b>01</b>
                {t('作品入场')}
              </span>
              <i />
              <span className={state.phase === 'voting' ? 'current' : ''}>
                <b>02</b>
                {t('直觉投票')}
              </span>
              <i />
              <span>
                <b>03</b>
                {t('身份揭晓')}
              </span>
            </div>
          )}
          <div className="round-actions">
            <button
              type="button"
              className={`text-button tour-toggle ${tour ? 'on' : ''}`}
              onClick={toggleTour}
              aria-pressed={tour}
              title={t('入场时依次放大展示两份作品')}
            >
              <GalleryHorizontal size={14} />
              {t('逐个巡览')}
              <i className="tour-switch" aria-hidden="true" />
            </button>
            {state.phase === 'intro' ? (
              <button
                className="text-button"
                onClick={() => dispatch({ type: 'READY' })}
              >
                <SkipForward size={15} />
                {t('跳过入场')}
                <kbd>{t('SPACE')}</kbd>
              </button>
            ) : (
              <button
                className="text-button"
                onClick={() => dispatch({ type: 'REPLAY' })}
                disabled={blocked}
              >
                <RotateCcw size={14} />
                {t('重播入场')}
              </button>
            )}
            {state.mode === 'formal' ? (
              <button
                className={`next-button ${state.phase === 'result' ? 'highlight' : ''}`}
                onClick={() => nextMatchup()}
                disabled={blocked}
              >
                {localize(
                  pairCount > 1 ? '同提示词 · 换一组' : '重新比较本提示词',
                )}
                <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className={`next-button next-topic ${state.phase === 'result' ? 'highlight' : ''}`}
                onClick={() => {
                  // 娱乐模式：下一题随机抽题（排除当前题），hash 切题由路由重挂载
                  gotoRandomArena();
                }}
                disabled={blocked}
              >
                {t('下一题')}
                <ArrowRight size={17} />
              </button>
            )}
          </div>
        </div>

        {state.phase === 'result' && state.choice && (
          <div className="afterparty-reveal">
            {state.mode === 'formal' ? (
              <div className="placeholder-note">
                {t('正式测评：全程匿名，本模式不开放评论区。')}
              </div>
            ) : isPlaceholderMode() ? (
              <div className="placeholder-note">
                {t('占位符模式：评论区停用，占位数据不入库。')}
              </div>
            ) : (
              <div>
                <Afterparty
                  key={`${round.id}-${state.run}`}
                  roundId={round.id}
                  // 评论按侧归档（a/b 二选一）；平局没有「站的一侧」，归到 a 侧讨论串
                  side={state.choice === 'draw' ? 'a' : state.choice}
                />
              </div>
            )}
          </div>
        )}

        <section
          className="round-selector prompt-context"
          aria-label={t('当前提示词竞技场')}
        >
          <div className="selector-heading">
            <span className="section-code">{t('ONE PROMPT / ONE ARENA')}</span>
            <strong data-swap>{prompt.name}</strong>
          </div>
          <p data-swap>
            {t(
              '本场收录 {models} 个模型的 {works} 份结果，只在这个提示词内比较。',
              {
                models: new Set(
                  currentResultsForPrompt(prompt.id).map(
                    (entry) => entry.modelId,
                  ),
                ).size,
                works: resultCount,
              },
            )}
          </p>
          <p data-swap>
            {localize(
              pairCount === 1
                ? '当前仅有一组可比较作品，可重看本组，或前往其他提示词竞技场。'
                : '换一组会优先抽取不同的作品组合。',
            )}
          </p>
          <div className="prompt-context-links">
            <a href="#prompts">
              {t('返回提示词库')}
              <ArrowUpRight size={16} />
            </a>
            <button onClick={gotoRandomArena}>
              {t('随机换个竞技场')}
              <ArrowRight size={16} />
            </button>
          </div>
          {soloNotice && (
            <p className="placeholder-note" aria-live="polite">
              {t('现在只有这一个竞技场——先去提示词库看看别的题吧。')}
            </p>
          )}
        </section>
      </main>

      <footer className="system-footer">
        <span>
          <span className="live-dot" /> {t('SYSTEM ONLINE')}
          <i /> {t('NO RIGHT ANSWER.')}
        </span>
        <span className="footer-keyboard">
          <kbd>{t('A')}</kbd> {t('左侧')}
          <kbd>{t('D')}</kbd> {t('右侧')}
          <kbd>{t('N')}</kbd> {t('同题换组')}
        </span>
        <span>
          {t('仅供体验')}
          <span className="footer-cross">＋</span> {t('ARENA OF')}
          {localize(' ')}
          <span className="brand-tag">{t('BIAS')}</span> / 2026
        </span>
      </footer>

      <Dialog
        open={expanded !== null}
        onOpenChange={(open) => {
          if (!open) setExpanded(null);
        }}
      >
        <DialogContent
          className={`exhibit-dialog dialog-round-${prompt.kind === 'image' ? 0 : prompt.kind === 'text' ? 1 : 2}`}
          showCloseButton={false}
        >
          <div className="dialog-top">
            <div>
              <DialogTitle>
                {t('作品')}
                {localize(expanded?.toUpperCase())}{' '}
                <span>/ {localize(round.category)}</span>
              </DialogTitle>
              <DialogDescription>{round.prompt}</DialogDescription>
            </div>
            <button
              className="icon-button"
              onClick={() => setExpanded(null)}
              aria-label={t('关闭作品预览')}
            >
              <X size={22} />
            </button>
          </div>
          <div className={`expanded-work ${expanded && workCanvas(pair[expanded === 'a' ? 0 : 1]) ? 'is-fixed-canvas' : ''}`}>
            {expanded && (
              <Work
                result={pair[expanded === 'a' ? 0 : 1]}
                side={expanded}
                expanded
                interactive
                imageFailed={(() => {
                  const content = pair[expanded === 'a' ? 0 : 1].content;
                  return (
                    content.kind === 'image' &&
                    failedAssets.includes(content.src)
                  );
                })()}
              />
            )}
          </div>
          <div className="dialog-bottom">
            <span>
              {localize(
                prompt.kind === 'web'
                  ? '演示页面 · 可以试试预订与目的地按钮'
                  : 'ESC 返回对决',
              )}
            </span>
            <span>
              {localize(
                revealed && expanded
                  ? round.models[expanded === 'a' ? 0 : 1]
                  : '身份隐藏中',
              )}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
