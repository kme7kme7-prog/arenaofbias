/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/no-noninteractive-tabindex -- Custom combobox retains focus on its input; the labelled history region is keyboard-scrollable. */
// 「模一把」（决策 057）—— Wordle 式猜 AI 模型的独立玩法页。
//
// 视觉层：暗色解谜舞台，配色与动效统一在 guess.css。仅刚提交的一行揭示；
// CSS 动效不负责写数据或决定胜负。对照页：
// reference/guess-review.html（隔离存储，演示四种状态）；判定规则仍在 guess-logic。
// 对局不落盘（2026-09-14 用户拍板）：退出/刷新即清盘，练习每次开新局；
// 每日一题答案仍是当日种子派生的同一道，战绩靠 guess-settled 标记一天只结算一次。

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { createGameTransition } from '@/lib/game-transitions';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import {
  ArrowLeft,
  ArrowUpRight,
  Search,
  Share2,
  Trophy,
  BrainCircuit,
  Fingerprint,
  Check,
  ArrowUp,
  ArrowDown,
  CornerDownLeft,
  LoaderCircle,
  RotateCcw,
  ChevronDown,
  Sprout,
  Compass,
  Flame,
  Skull,
} from 'lucide-react';
import {
  checkGuess,
  fetchToday,
  loadStats,
  markCounted,
  MAX_ATTEMPTS,
  PracticeExpiredError,
  RateLimitedError,
  reportResult,
  settleStats,
  startPractice,
  wasCounted,
  type GuessApiModel,
  type GuessRow,
  type GuessSession,
  type TodayResponse,
} from '@/lib/guess';
import {
  PRICE_TIERS,
  DIFFICULTY_INFO,
  GUESS_DIFFICULTIES,
  DAILY_DIFFICULTIES,
  guessDayKey,
  searchGuessModels,
  type GuessDifficulty,
} from '@/lib/guess-logic';

// ── 属性展示：每种属性一格，格内容 = 该属性的人类可读值 ──

function attributeValue(model: GuessApiModel, key: string): string {
  switch (key) {
    case 'vendor':
      return model.vendor;
    case 'released':
      return model.released;
    case 'openWeights':
      return model.openWeights ? '开放' : '闭源';
    case 'contextK':
      return model.contextK === null ? '?' : `${model.contextK}K`;
    case 'modalities': {
      // 精简显示：text 恒有不必写，其余按序列出；纯文本显示「纯文本」
      const extra = model.modalities.filter((m) => m !== 'text');
      if (extra.length === 0) return '纯文本';
      const map: Record<string, string> = {
        image: '图',
        audio: '音',
        video: '视',
      };
      return extra.map((m) => map[m] ?? m).join('+');
    }
    case 'reasoning':
      return model.reasoning ? '推理' : '直答';
    case 'priceTier':
      return model.priceTier === null ? '?' : PRICE_TIERS[model.priceTier].zh;
    default:
      return '?';
  }
}

const ATTRIBUTE_LABELS: Record<string, string> = {
  vendor: '厂商',
  released: '发布',
  openWeights: '权重',
  contextK: '上下文',
  modalities: '模态',
  reasoning: '推理',
  priceTier: '价格',
};

// ── 反馈格 ──

function FeedbackCell({
  state,
  arrow,
  children,
  index,
  label,
}: {
  state: string;
  arrow: 'up' | 'down' | null;
  children: string;
  index: number;
  label: string;
}) {
  const { t } = useI18n();
  const status =
    state === 'hit'
      ? '吻合'
      : state === 'near'
        ? '接近'
        : state === 'unknown'
          ? '未公开'
          : '不符';
  return (
    <td
      className={`gcell ${state}`}
      style={{ '--cell-order': index } as CSSProperties}
      aria-label={`${label}: ${t(children)}, ${t(status)}${arrow ? `, ${t(arrow === 'up' ? '答案更大或更新' : '答案更小或更早')}` : ''}`}
    >
      <span className="gcell-value">{t(children)}</span>
      <span className="gcell-indicator" aria-hidden="true">
        {arrow ? (
          arrow === 'up' ? (
            <ArrowUp size={13} />
          ) : (
            <ArrowDown size={13} />
          )
        ) : state === 'hit' ? (
          <Check size={12} />
        ) : state === 'unknown' ? (
          '?'
        ) : (
          <span className="gcell-dash" />
        )}
      </span>
    </td>
  );
}

// ── 分享文案：emoji 格局，复制到剪贴板 ──

const SHARE_EMOJI: Record<string, string> = {
  hit: '🟩',
  near: '🟨',
  miss: '⬛',
  unknown: '⬜',
};

function buildShareText(
  session: GuessSession,
  dayNumber: number,
  won: boolean,
): string {
  const lines = session.guesses.map((row) =>
    Object.values(row.attributes)
      .map((fb) => SHARE_EMOJI[fb.state] ?? '⬜')
      .join(''),
  );
  const head = `模一把 #${dayNumber} ${won ? session.guesses.length : 'X'}/${MAX_ATTEMPTS}`;
  return [head, ...lines].join('\n');
}

// ── 双模式入口（决策 064/081）──
// 进游戏先选模式：每日一题（全球同题，种子派生，只出普通池=简单+普通）；
// 练习模式（四档难度随机出题、不限次、可再来一把，不计战绩）。池是层叠的：
// 难度 k 的池 = difficulty ≤ k 的全部模型（地狱=全库）。地狱卡横跨栅格整行、
// 低一层视觉层级；空池时禁用（防御，收录后自动开放）。
// 对照页用 localStorage 键 guess-force-mode（'daily' | '1'-'4'）跳过本屏。

const DIFFICULTY_ICONS = [Sprout, Compass, Flame, Skull] as const;
const DIFFICULTY_BLURBS = [
  '热门模型专场，都叫得上名字',
  '热门与主流都在场，答案得绕点弯',
  '上面两档之外，经典与冷门也进场',
  '全库上阵，含只在这里出没的化石与传说',
] as const;

type PlayMode = 'daily' | GuessDifficulty;

type ModeStatus = { kind: 'fresh' } | { kind: 'done' };

/** 今日每日一题的状态，给选择屏的状态角标用（对局不落盘，只有「结算过没」） */
function dailyStatus(dayKey: string): ModeStatus {
  return wasCounted(dayKey) ? { kind: 'done' } : { kind: 'fresh' };
}

// ── 主组件 ──

export default function GuessPage() {
  const { t } = useI18n();
  const [today, setToday] = useState<TodayResponse | null>(null);
  // null = 还在选模式；'daily' = 每日一题；1-4 = 练习模式对应难度
  const [mode, setMode] = useState<PlayMode | null>(null);
  const [session, setSession] = useState<GuessSession | null>(null);
  // 练习模式的服务端局号（每日一题没有——答案种子派生，无局号）
  const [gameId, setGameId] = useState<string | null>(null);
  const [stats, setStats] = useState(() => loadStats());
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false); // 下拉展开
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  // 结算防重：同次挂载内的守卫（跨挂载由 session.counted 兜底），换模式时重置
  const settledRef = useRef(false);
  const [freshGuess, setFreshGuess] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRun, setLoadRun] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const transitionRef = useRef<ReturnType<typeof createGameTransition> | null>(
    null,
  );
  const leavingSite = useRef(false);
  const mounted = useRef(true);
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // A route exit must finish above the next page; internal transitions cancel.
      if (!leavingSite.current) transitionRef.current?.dispose();
    };
  }, []);

  function changeScreen(
    commit: () => void,
    direction: 'forward' | 'back' = 'forward',
    leaving = false,
  ) {
    if (transitionRef.current || pendingRef.current) return;
    leavingSite.current = leaving;
    setSwitching(true);
    const transition = createGameTransition('folio', {
      direction,
      reduced:
        document.documentElement.classList.contains('guess-reduced') ||
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      onCovered: () => {
        commit();
        window.scrollTo({ top: 0, behavior: 'instant' });
      },
      onFinish: () => {
        transitionRef.current = null;
        if (mounted.current) {
          setSwitching(false);
          mainRef.current?.focus({ preventScroll: true });
        }
      },
    });
    transitionRef.current = transition;
    transition.play();
  }

  function handleBack(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    if (mode !== null) backToPicker();
    else
      changeScreen(
        () => {
          window.location.hash = '#play';
        },
        'back',
        true,
      );
  }

  const emptySession = (): GuessSession => ({
    guesses: [],
    finished: false,
    revealed: false,
    answer: null,
  });

  // 进每日一题：每次都是全新棋盘（答案仍是当日种子派生的同一道），战绩照常读
  function enterDaily(data: TodayResponse, animate = false) {
    const commit = () => {
      setError(null);
      setSession(emptySession());
      setStats(loadStats());
      setGameId(null);
      setMode('daily');
    };
    if (animate) changeScreen(commit);
    else commit();
  }

  // 进练习模式：每次向服务端开新局（随机抽题），不续玩旧局
  async function enterPractice(d: GuessDifficulty, animate = false) {
    if (!today || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    const newGameId = await startPractice(d);
    if (!mounted.current) return;
    pendingRef.current = false;
    setPending(false);
    if (!newGameId) {
      setError(t('暂时开不了局，稍后再试？'));
      return;
    }
    const fresh: GuessSession = emptySession();
    const commit = () => {
      setError(null);
      setSession(fresh);
      setGameId(newGameId);
      setMode(d);
    };
    if (animate) changeScreen(commit);
    else commit();
  }

  // 初始化：拉今日题（含全部模型与难度标记）；选模式时才落对局
  useEffect(() => {
    let alive = true;
    void fetchToday().then((data) => {
      if (!alive) return;
      if (!data) {
        setLoadFailed(true);
        return;
      }
      setLoadFailed(false);
      setToday(data);
      // 对照页/调试钩子：预置 guess-force-mode 直接进对应模式，
      // 真实用户路径没有这个键，永远先落在选择屏
      const forced = (() => {
        try {
          return localStorage.getItem('guess-force-mode');
        } catch {
          return null;
        }
      })();
      if (forced === 'daily') enterDaily(data);
      else if (GUESS_DIFFICULTIES.includes(Number(forced) as GuessDifficulty))
        void enterPractice(Number(forced) as GuessDifficulty);
    });
    return () => {
      alive = false;
    };
    // enterDaily/enterPractice 只依赖 today 与存储，loadRun 重试时重建即可
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [loadRun]);

  // 回选择屏：换模式不丢任何一局的进度（每日按天存、练习按难度存）
  function backToPicker() {
    changeScreen(() => {
      setMode(null);
      setSession(null);
      setGameId(null);
      setFreshGuess(null);
      setQuery('');
      setOpen(false);
      setError(null);
      settledRef.current = false;
    }, 'back');
  }

  // 当前模式的答案池（层叠，081）：每日=普通池（≤2）；练习=≤所选难度。
  // 只决定「答什么」，搜索候选不限于此（见下）
  const pool = useMemo(() => {
    if (!today || mode === null) return [];
    if (mode === 'daily')
      return today.models.filter((m) =>
        DAILY_DIFFICULTIES.includes(m.difficulty),
      );
    return today.models.filter((m) => m.difficulty <= mode);
  }, [today, mode]);

  const usedIds = useMemo(
    () => new Set((session?.guesses ?? []).map((row) => row.guess.id)),
    [session],
  );

  // 搜索候选（2026-09-14 用户拍板）：补全式——输入后才出匹配项，且在全量
  // 模型库里找（不按当前答案池过滤：猜池外模型也返回正常反馈，等于自愿
  // 加难度）。已猜过的排除。匹配规则见 searchGuessModels：分隔符不敏感，
  // "gpt 5"/"gpt5"/"sonnet4.5" 都能命中。
  const candidates = useMemo(() => {
    if (!today) return [];
    return searchGuessModels(
      today.models.filter((m) => !usedIds.has(m.id)),
      query,
    );
  }, [today, query, usedIds]);

  useEffect(() => {
    const list = listRef.current;
    const option = list?.children[
      Math.min(activeIndex, candidates.length - 1)
    ] as HTMLElement | undefined;
    if (!list || !option || !open) return;
    // Keep keyboard selection visible without scrolling the page itself.
    const top =
      option.getBoundingClientRect().top -
      list.getBoundingClientRect().top +
      list.scrollTop;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + option.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = top + option.offsetHeight - list.clientHeight;
  }, [activeIndex, candidates.length, open]);

  const attempts = session?.guesses.length ?? 0;
  const won = session?.guesses.some((row) => row.won) ?? false;
  const finished = session?.finished ?? false;
  const revealed = session?.revealed ?? false;
  const canGuess = !finished && !revealed && attempts < MAX_ATTEMPTS;
  const isFinalAttempt = attempts === MAX_ATTEMPTS - 1;

  // 结算战绩：只有每日一题记战绩，一天只算一次（guess-settled 标记兜底，
  // settledRef 挡同次挂载重复执行）。练习模式不结算、不上报。
  useEffect(() => {
    if (mode !== 'daily' || !session || !today || !session.finished) return;
    if (settledRef.current || wasCounted(today.dayKey)) return;
    settledRef.current = true;
    settleStats(today.dayKey, won, session.guesses.length);
    reportResult(today.dayKey, won, session.guesses.length);
    markCounted(today.dayKey);
    // settleStats 与 won 只依赖 session/today；won 在 finished 后不会再变
  }, [session, today, won, mode]);

  // 重玩今天（每日一题）：清盘重开（答案不变，战绩不重复结算）
  function replay() {
    if (!today || !session || mode !== 'daily') return;
    setFreshGuess(null);
    setQuery('');
    setOpen(false);
    setSession(emptySession());
  }

  // 再来一把（练习模式）：同一难度向服务端开新的一局随机题
  async function playAgain() {
    if (mode === null || mode === 'daily') return;
    setFreshGuess(null);
    setQuery('');
    setOpen(false);
    setError(null);
    await enterPractice(mode);
  }

  // 练习局过期（服务器重启清了内存里的答案）：直接开新局
  async function recoverExpiredPractice(d: GuessDifficulty) {
    pendingRef.current = false;
    setPending(false);
    setSession(null);
    await enterPractice(d);
    setError(t('上一局已过期，已为你开新的一局。'));
  }

  // 跨零点守护（UTC+8，2026-09-15）：页面跨过东八区零点后，服务端的「今天」
  // 已换题——旧棋盘继续猜会把两个答案混进一局，战绩也记错日子。提交前比对
  // dayKey，过期就拉新 today 并切到新一天的棋盘（这次提交不计）。练习模式的
  // 答案在服务端局内存里，不受影响；对照页的 'preview-day' 等非日历 key 跳过。
  async function dailyRolledOver(): Promise<boolean> {
    if (mode !== 'daily' || !today) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(today.dayKey)) return false;
    if (guessDayKey() === today.dayKey) return false;
    const fresh = await fetchToday();
    if (!mounted.current) return true;
    if (fresh) enterDaily(fresh);
    else setSession(emptySession());
    setError(t('已过零点，新的一天开始了——已为你切到今天的题。'));
    return true;
  }

  async function submit(model: GuessApiModel) {
    if (!today || mode === null || !canGuess || pendingRef.current) return;
    if (await dailyRolledOver()) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setQuery('');
    setOpen(false);
    let result = null;
    try {
      result = await checkGuess(
        model.id,
        isFinalAttempt,
        mode === 'daily' ? undefined : (gameId ?? undefined),
      );
    } catch (error) {
      if (error instanceof PracticeExpiredError && mode !== 'daily') {
        await recoverExpiredPractice(mode);
        return;
      }
      pendingRef.current = false;
      setPending(false);
      if (error instanceof RateLimitedError) {
        setError(t('请求太频繁，稍等几秒再试。'));
        return;
      }
      throw error;
    }
    pendingRef.current = false;
    setPending(false);
    if (!result) {
      setError(t('网络不给力，这把不算，再试一次。'));
      return;
    }
    const row: GuessRow = {
      guess: model,
      attributes: result.feedback.attributes,
      won: result.feedback.won,
    };
    const next: GuessSession = {
      guesses: [...(session?.guesses ?? []), row],
      finished: result.feedback.won || isFinalAttempt,
      revealed: result.feedback.won || isFinalAttempt,
      answer: result.answer,
    };
    setFreshGuess(model.id);
    setSession(next);
  }

  // 手动看答案：final=false 的请求不会带答案，单独发一次 final 请求拿答案。
  // 按钮在对局进行中且已猜过至少一次时可见（2026-09-15 修复：原先放在
  // 结果面板里，而 finished 与 revealed 恒同时翻转，按钮永远渲染不出来）
  async function revealAnswer() {
    if (!today || !session || mode === null || pendingRef.current) return;
    if (!session.guesses.length) return; // 拿已猜过的模型再问一次，没猜过无从发起
    if (await dailyRolledOver()) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    // 用已猜过的任意模型再问一次（判定结果丢弃，只取答案）
    const last = session.guesses[session.guesses.length - 1];
    let result = null;
    try {
      result = await checkGuess(
        last.guess.id,
        true,
        mode === 'daily' ? undefined : (gameId ?? undefined),
      );
    } catch (error) {
      if (error instanceof PracticeExpiredError && mode !== 'daily') {
        await recoverExpiredPractice(mode);
        return;
      }
      pendingRef.current = false;
      setPending(false);
      if (error instanceof RateLimitedError) {
        setError(t('请求太频繁，稍等几秒再试。'));
        return;
      }
      throw error;
    }
    pendingRef.current = false;
    setPending(false);
    if (!result?.answer) {
      setError(t('暂时拿不到答案，稍后再点一次。'));
      return;
    }
    const next: GuessSession = {
      ...session,
      revealed: true,
      finished: true,
      answer: result.answer,
    };
    setSession(next);
  }

  async function share() {
    if (!today || !session || mode !== 'daily') return;
    const text = buildShareText(session, today.dayNumber, won);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('复制失败，长按选中手动复制吧。'));
    }
  }

  if (!today) {
    return (
      <div className="guess-page guess-loading">
        <div className="guess-loading-symbol">
          <BrainCircuit size={40} />
        </div>
        <h1>{t('模一把')}</h1>
        <p aria-live="polite">
          {t(loadFailed ? '今日挑战暂时无法加载' : '模一把加载中…')}
        </p>
        {loadFailed && (
          <button
            className="guess-primary"
            onClick={() => {
              setLoadFailed(false);
              setLoadRun((n) => n + 1);
            }}
          >
            <RotateCcw size={16} />
            {t('重新加载')}
          </button>
        )}
        <a href="#play" className="guess-back" onClick={handleBack}>
          <ArrowLeft size={15} />
          {t('玩法菜单')}
        </a>
      </div>
    );
  }

  return (
    <div
      className="guess-page"
      data-screen={mode === null || !session ? 'picker' : 'game'}
      data-finished={finished}
      data-revealing={Boolean(freshGuess)}
    >
      <header className="guess-header">
        <a
          className="lobby-brand"
          href={mode === null ? '#play' : '#guess'}
          onClick={handleBack}
          aria-disabled={pending || switching}
          aria-label={t(mode === null ? '回到玩法菜单' : '返回选择模式')}
        >
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('模一把')}</small>
          </span>
        </a>
        <div className="guess-header-actions">
          <LanguageSwitch />
          <AccountButton />
        </div>
      </header>
      <main
        className="guess-main"
        ref={mainRef}
        tabIndex={-1}
        aria-busy={pending || switching}
      >
        {mode === null || !session ? (
          <section
            className="guess-difficulty"
            aria-labelledby="guess-difficulty-title"
          >
            <a
              className="guess-back guess-picker-back"
              href="#play"
              onClick={handleBack}
              aria-disabled={pending || switching}
            >
              <ArrowLeft size={14} />
              {t('玩法菜单')}
            </a>
            <div className="guess-difficulty-head">
              <div className="guess-edition">
                <span>{t('每日挑战')}</span>
                <b>#{String(today.dayNumber).padStart(3, '0')}</b>
                <span>
                  {today.dayKey === 'preview-day'
                    ? '2026.09.14'
                    : today.dayKey.replaceAll('-', '.')}
                </span>
              </div>
              <h1 id="guess-difficulty-title">
                {t('模一把')}
                <span aria-hidden="true">↗</span>
              </h1>
              <p>
                {t('每天一道全世界同题；或者选个难度练习，随机出题不限次。')}
              </p>
            </div>
            {(() => {
              const status = dailyStatus(today.dayKey);
              const dailyCount = today.models.filter((m) =>
                DAILY_DIFFICULTIES.includes(m.difficulty),
              ).length;
              return (
                <button
                  type="button"
                  className="guess-difficulty-card guess-daily-card"
                  disabled={pending || switching}
                  onClick={() => enterDaily(today, true)}
                >
                  <span className="guess-daily-art" aria-hidden="true">
                    <span>?</span>
                    <i />
                    <i />
                  </span>
                  <span className="guess-difficulty-icon" aria-hidden="true">
                    <Trophy size={26} strokeWidth={1.6} />
                  </span>
                  <span className="guess-difficulty-name">
                    <b>{t('每日一题')}</b>
                    <small>{t('全球同题')}</small>
                  </span>
                  <span className="guess-difficulty-blurb">
                    {t('全世界同一道题，从热门与主流模型里出，猜完晒战绩。')}
                  </span>
                  <span className="guess-difficulty-meta">
                    <span>{t('候选 {n} 个模型', { n: dailyCount })}</span>
                    <span
                      className={`guess-difficulty-status is-${status.kind}`}
                    >
                      {status.kind === 'done'
                        ? t('今日战绩已记录')
                        : t('今天还没玩')}
                    </span>
                  </span>
                  <ArrowUpRight
                    className="guess-difficulty-go"
                    size={18}
                    aria-hidden="true"
                  />
                </button>
              );
            })()}
            <div className="guess-practice-heading">
              <h2>{t('练习模式')}</h2>
              <span>{t('随机出题 · 不限次数')}</span>
            </div>
            <div className="guess-difficulty-grid">
              {GUESS_DIFFICULTIES.map((d) => {
                const info = DIFFICULTY_INFO[d - 1];
                const Icon = DIFFICULTY_ICONS[d - 1];
                // 层叠池（081）：难度 k 的候选 = difficulty ≤ k 的全部模型
                const count = today.models.filter(
                  (m) => m.difficulty <= d,
                ).length;
                // 空池禁用入口（防御：服务端对空池拒开局），收录后自动开放
                const unavailable = count === 0;
                return (
                  <button
                    key={d}
                    type="button"
                    className="guess-difficulty-card"
                    data-level={d}
                    disabled={pending || switching || unavailable}
                    onClick={() => void enterPractice(d, true)}
                  >
                    <span className="guess-difficulty-icon" aria-hidden="true">
                      <Icon size={26} strokeWidth={1.6} />
                    </span>
                    <span className="guess-difficulty-name">
                      <b>{t(info.zh)}</b>
                      <small>
                        {String(d).padStart(2, '0')} /{' '}
                        {String(GUESS_DIFFICULTIES.length).padStart(2, '0')}
                      </small>
                    </span>
                    <span className="guess-difficulty-blurb">
                      {t(DIFFICULTY_BLURBS[d - 1])}
                    </span>
                    <span className="guess-difficulty-meta">
                      <span>{t('候选 {n} 个模型', { n: count })}</span>
                      <span className="guess-difficulty-status is-fresh">
                        {unavailable
                          ? t('筹备中')
                          : t('随机出题 · 不限次数')}
                      </span>
                    </span>
                    <ArrowUpRight
                      className="guess-difficulty-go"
                      size={18}
                      aria-hidden="true"
                    />
                  </button>
                );
              })}
            </div>
            {error && (
              <p className="guess-error" role="alert">
                {error}
              </p>
            )}
            {pending && (
              <p className="guess-picker-pending" role="status">
                <LoaderCircle size={14} className="guess-spinner" />
                {t('正在准备练习题…')}
              </p>
            )}
            <p className="guess-difficulty-foot">
              {t('每日一题只从简单与普通池出；练习不限次，战绩只记每日题。')}
            </p>
          </section>
        ) : (
          <>
            <section className="guess-hero" aria-labelledby="guess-title">
              <div className="guess-hero-copy">
                <a
                  className="guess-back"
                  href="#guess"
                  onClick={handleBack}
                  aria-disabled={pending || switching}
                >
                  <ArrowLeft size={14} />
                  {t('返回选择模式')}
                </a>
                <div className="guess-edition">
                  {mode === 'daily' ? (
                    <>
                      <span>{t('每日挑战')}</span>
                      <b>#{String(today.dayNumber).padStart(3, '0')}</b>
                      <span>
                        {today.dayKey === 'preview-day'
                          ? '2026.09.14'
                          : today.dayKey.replaceAll('-', '.')}
                      </span>
                    </>
                  ) : (
                    <>
                      <span>{t('练习模式')}</span>
                      <b>{t(DIFFICULTY_INFO[mode - 1].zh)}</b>
                      <span>{t('随机出题')}</span>
                    </>
                  )}
                </div>
                <h1 id="guess-title">
                  {t('模一把')}
                  <span aria-hidden="true">↗</span>
                </h1>
                <p className="guess-tagline">{t('把它的名字，猜出来。')}</p>
                <p className="guess-intro">
                  {t(
                    mode === 'daily'
                      ? '七条线索，八次机会。今天的 AI 模型，会是谁？'
                      : '七条线索，八次机会。不限次数，再来一把。',
                  )}
                </p>
              </div>
              <div
                className={`guess-art ${won ? 'is-solved' : ''}`}
                aria-hidden="true"
              >
                <div className="guess-art-orbit orbit-one" />
                <div className="guess-art-orbit orbit-two" />
                <div className="guess-card-stack">
                  <div className="guess-card-sheet sheet-back" />
                  <div className="guess-card-sheet sheet-mid" />
                  <div className="guess-card-sheet sheet-front">
                    <div className="guess-card-top">
                      <BrainCircuit size={22} />
                      <span>#{String(today.dayNumber).padStart(3, '0')}</span>
                    </div>
                    <strong>
                      {won ? <Check size={106} strokeWidth={1.5} /> : '?'}
                    </strong>
                    <div className="guess-card-bottom">
                      <span>{t(won ? '身份已揭晓' : '今日未知模型')}</span>
                      <Fingerprint size={24} />
                    </div>
                  </div>
                </div>
                <div className="guess-art-shadow" />
                <div className="guess-art-caption">
                  <span>{pool.length}</span>
                  {t('个模型，唯一答案')}
                </div>
              </div>
            </section>

            <section className="guess-console" aria-label={t('每日猜模型')}>
              <div className="guess-console-top">
                <button
                  type="button"
                  className="guess-difficulty-chip"
                  disabled={pending || switching}
                  onClick={backToPicker}
                  title={t('返回选择模式')}
                >
                  {mode === 'daily'
                    ? t('每日一题')
                    : t(DIFFICULTY_INFO[mode - 1].zh)}
                  <small>
                    {mode === 'daily'
                      ? 'DAILY'
                      : DIFFICULTY_INFO[mode - 1].en.toUpperCase()}
                  </small>
                  <RotateCcw size={12} aria-hidden="true" />
                </button>
                <div className="guess-turn">
                  <span>
                    {t(
                      finished
                        ? mode === 'daily'
                          ? '今日挑战已完成'
                          : '本局结束'
                        : '剩余机会',
                    )}
                  </span>
                  <strong key={attempts}>
                    {String(MAX_ATTEMPTS - attempts).padStart(2, '0')}
                    <small> / {MAX_ATTEMPTS}</small>
                  </strong>
                </div>
                <div
                  className="guess-attempts"
                  aria-label={t('已使用 {n} 次机会', { n: attempts })}
                >
                  {Array.from({ length: MAX_ATTEMPTS }, (_, i) => (
                    <span
                      key={i}
                      className={
                        i < attempts
                          ? session.guesses[i]?.won
                            ? 'is-win'
                            : 'is-used'
                          : i === attempts && canGuess
                            ? 'is-current'
                            : ''
                      }
                    >
                      {i < attempts && session.guesses[i]?.won ? (
                        <Check size={14} />
                      ) : (
                        String(i + 1).padStart(2, '0')
                      )}
                    </span>
                  ))}
                </div>
              </div>

              {canGuess && (
                <div className="guess-search-section">
                  <div className="guess-input-wrap">
                    <div
                      className={`guess-input ${pending ? 'is-pending' : ''}`}
                    >
                      {pending ? (
                        <LoaderCircle
                          className="guess-spinner"
                          size={22}
                          aria-hidden="true"
                        />
                      ) : (
                        <Search size={22} aria-hidden="true" />
                      )}
                      <input
                        ref={inputRef}
                        value={query}
                        disabled={pending}
                        placeholder={t('输入模型名，开始推理…')}
                        onChange={(e) => {
                          setQuery(e.target.value);
                          setActiveIndex(0);
                          setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                        onBlur={() => setOpen(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setOpen(false);
                          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                            e.preventDefault();
                            setOpen(true);
                            setActiveIndex((i) =>
                              candidates.length
                                ? (i +
                                    (e.key === 'ArrowDown' ? 1 : -1) +
                                    candidates.length) %
                                  candidates.length
                                : 0,
                            );
                          }
                          if (e.key === 'Enter' && candidates.length) {
                            e.preventDefault();
                            void submit(
                              candidates[
                                Math.min(activeIndex, candidates.length - 1)
                              ],
                            );
                          }
                        }}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={open && !pending}
                        aria-controls="guess-candidates"
                        aria-activedescendant={
                          open && candidates.length
                            ? `guess-option-${Math.min(activeIndex, candidates.length - 1)}`
                            : undefined
                        }
                        aria-label={t('输入要猜的模型名')}
                      />
                      <button
                        className="guess-submit"
                        type="button"
                        disabled={pending || !candidates.length}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          void submit(
                            candidates[
                              Math.min(activeIndex, candidates.length - 1)
                            ],
                          )
                        }
                      >
                        <span>{t(pending ? '判定中' : '猜一下')}</span>
                        <ArrowUpRight size={20} />
                      </button>
                    </div>
                    {open && !pending && query.trim() !== '' && (
                      <div className="guess-suggest">
                        <div className="guess-suggest-heading">
                          <span>{t('匹配的模型')}</span>
                          <span>
                            <CornerDownLeft size={12} />
                            {t('确认')}
                          </span>
                        </div>
                        <ul
                          ref={listRef}
                          id="guess-candidates"
                          role="listbox"
                          aria-label={t('模型候选')}
                        >
                          {candidates.map((m, i) => (
                            <li
                              id={`guess-option-${i}`}
                              key={m.id}
                              role="option"
                              aria-selected={i === activeIndex}
                              className={i === activeIndex ? 'is-active' : ''}
                              onMouseDown={(e) => e.preventDefault()}
                            >
                              <button
                                tabIndex={-1}
                                type="button"
                                onClick={() => void submit(m)}
                                onMouseEnter={() => setActiveIndex(i)}
                              >
                                <span className="guess-model-mark">
                                  {m.vendor.slice(0, 1)}
                                </span>
                                <span>
                                  <b>{m.name}</b>
                                  <small>{m.vendor}</small>
                                </span>
                                <time>{m.released}</time>
                                <ArrowUpRight size={17} />
                              </button>
                            </li>
                          ))}
                        </ul>
                        {!candidates.length && (
                          <p className="guess-no-match">
                            {t('没有找到这个模型，换个名字试试。')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="guess-search-hint">
                    <span>{t('支持模型名称搜索')}</span>
                    <span>
                      <CornerDownLeft size={12} />
                      {t('回车提交')}
                    </span>
                  </p>
                  {attempts > 0 && (
                    <button
                      className="guess-reveal"
                      disabled={pending}
                      onClick={() => void revealAnswer()}
                    >
                      {t('不想猜了，直接看答案')}
                    </button>
                  )}
                </div>
              )}

              {!canGuess && (
                <div
                  className={`guess-result ${won ? 'is-win' : 'is-loss'} ${freshGuess ? 'is-fresh' : ''}`}
                  aria-live="polite"
                >
                  <div className="guess-result-symbol">
                    {won ? <Trophy size={32} /> : <Fingerprint size={32} />}
                  </div>
                  <div className="guess-result-copy">
                    <span>
                      {t(
                        won
                          ? '漂亮，锁定目标。'
                          : mode === 'daily'
                            ? '答案揭晓，明天再来。'
                            : '答案揭晓，再来一把？',
                      )}
                    </span>
                    <h2>
                      {session.answer?.name ??
                        session.guesses.find((row) => row.won)?.guess.name ??
                        '…'}
                    </h2>
                    <p>
                      {session.answer?.vendor}
                      {won ? ` · ${t('用了 {n} 次猜中', { n: attempts })}` : ''}
                      {session.answer?.priceOut != null
                        ? ` · $${session.answer.priceOut}/M`
                        : ''}
                    </p>
                  </div>
                  <div className="guess-result-actions">
                    {mode === 'daily' ? (
                      <>
                        <button
                          type="button"
                          className="guess-replay"
                          onClick={replay}
                        >
                          <RotateCcw size={15} />
                          {t('重玩今天')}
                        </button>
                        <button
                          type="button"
                          className="guess-primary guess-share"
                          onClick={() => void share()}
                        >
                          {copied ? <Check size={17} /> : <Share2 size={17} />}
                          {t(copied ? '已复制 ✓' : '分享战绩')}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="guess-primary guess-share"
                        disabled={pending}
                        onClick={() => void playAgain()}
                      >
                        <RotateCcw size={17} />
                        {t('再来一把')}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {error && (
                <p className="guess-error" role="alert">
                  {error}
                </p>
              )}

              <div className="guess-board-heading">
                <h2>{t('推理记录')}</h2>
                <div className="guess-legend">
                  <span>
                    <i className="hit" />
                    {t('吻合')}
                  </span>
                  <span>
                    <i className="near" />
                    {t('接近')}
                  </span>
                  <span>
                    <i className="miss" />
                    {t('不符')}
                  </span>
                </div>
              </div>
              <div
                className="guess-board-scroll"
                tabIndex={0}
                role="region"
                aria-label={t('猜测历史，可横向滚动')}
              >
                <table className="guess-board" aria-label={t('猜测历史')}>
                  <thead>
                    <tr className="guess-row guess-row-head">
                      <th className="gcell-name" scope="col">
                        {t('模型')}
                      </th>
                      {today.attributes.map((key) => (
                        <th key={key} scope="col">
                          {t(ATTRIBUTE_LABELS[key])}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {session.guesses.map((row, rowIndex) => (
                      <tr
                        key={row.guess.id}
                        className={`guess-row ${row.guess.id === freshGuess ? 'is-new' : ''} ${row.won ? 'is-correct' : ''}`}
                      >
                        <th className="gcell-name" scope="row">
                          <span className="guess-row-number">
                            {String(rowIndex + 1).padStart(2, '0')}
                          </span>
                          <span>
                            <b>{row.guess.name}</b>
                            <small>{row.guess.vendor}</small>
                          </span>
                        </th>
                        {today.attributes.map((key, index) => {
                          const fb = row.attributes[key] ?? {
                            state: 'unknown',
                            arrow: null,
                          };
                          return (
                            <FeedbackCell
                              key={key}
                              state={fb.state}
                              arrow={fb.arrow}
                              index={index}
                              label={t(ATTRIBUTE_LABELS[key])}
                            >
                              {attributeValue(row.guess, key)}
                            </FeedbackCell>
                          );
                        })}
                      </tr>
                    ))}
                    {canGuess && (
                      <tr className="guess-row guess-ghost" aria-hidden="true">
                        <td className="gcell-name">
                          <span className="guess-row-number">
                            {String(attempts + 1).padStart(2, '0')}
                          </span>
                          <span>{t('下一个猜测')}</span>
                        </td>
                        {today.attributes.map((key) => (
                          <td key={key}>
                            <span>?</span>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {!attempts && (
                <div className="guess-empty">
                  <Fingerprint size={30} strokeWidth={1.3} />
                  <div>
                    <strong>{t('每一次猜测，离答案更近。')}</strong>
                    <p>{t('先选一个熟悉的模型，七条线索会在这里揭开。')}</p>
                  </div>
                  <div className="guess-empty-tiles" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
              <div className="guess-board-foot">
                <span>{t('↑ ↓ 指向答案的方向')}</span>
                <span>{t('? 表示未公开，不计对错')}</span>
              </div>
            </section>

            {mode === 'daily' && (
              <section className="guess-footer" aria-label={t('本地战绩')}>
                <div className="guess-stats-intro">
                  <Fingerprint size={21} />
                  <span>
                    {t('你的战绩')}
                    <small>{t('只记每日一题，保存在这台设备')}</small>
                  </span>
                </div>
                <dl className="guess-stats">
                  <div>
                    <dt>{t('已玩')}</dt>
                    <dd>
                      {stats.played}
                      <small>{t('场')}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('胜率')}</dt>
                    <dd>
                      {stats.played
                        ? Math.round((stats.won / stats.played) * 100)
                        : 0}
                      <small>%</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('连胜')}</dt>
                    <dd>
                      {stats.streak}
                      <small>{t('场')}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>{t('最少步数')}</dt>
                    <dd>
                      {stats.best ?? '·'}
                      <small>{t('次')}</small>
                    </dd>
                  </div>
                </dl>
              </section>
            )}
            <details className="guess-rules">
              <summary>
                {t('怎么玩')}
                <ChevronDown size={14} />
              </summary>
              <div>
                <p>
                  {t(
                    '每日一题全世界同一道题（东八区零点更新），只从热门与主流模型里出；练习模式选难度随机出题、不限次数。反馈规则：厂商相同为绿、同国家为黄；发布时间、上下文、价格接近为黄并给箭头方向；「?」表示该属性未公开，不计对错。',
                  )}
                </p>
                <p>
                  {t(
                    '价格按官方 API 输出单价分档；箭头指向答案更高或更低的方向。',
                  )}
                </p>
                <p>
                  {t(
                    '战绩只记每日一题，一天只记一次；练习模式随便刷，不影响连胜。对局不保存：退出或刷新就重新开局，每日题的答案不变。',
                  )}
                </p>
              </div>
            </details>
          </>
        )}
      </main>
    </div>
  );
}
