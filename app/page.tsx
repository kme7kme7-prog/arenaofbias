'use client';
import { ThemeToggle } from '@/components/theme-toggle';
import { useI18n, getLocale, translate } from '@/lib/locale';
import { apiFetch } from '@/lib/api';
import { LanguageSwitch } from '@/components/language-switch';
import { FixedHtmlWork } from '@/components/fixed-html-work';
import { workCanvas } from '@/lib/work-framing';
import { withArenaControls } from '@/lib/work-controls';
import { newId } from '@/lib/id';

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
  Expand,
  Eye,
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
import { subscribeWorks, refreshWorks } from '@/lib/works';
import {
  appendPlaceholderVote,
  currentMatchup,
  currentPairs,
  currentRandomArenaHash,
  currentResultsForPrompt,
  isPlaceholderMode,
} from '@/lib/placeholder';
import { pairKeyOf, submitVote } from '@/lib/votes';
import { refreshRatings } from '@/lib/ratings';
import {
  flushReactions,
  peekPending,
  queueReaction,
  type ReactionKind,
} from '@/lib/reactions';
import { DocumentDecryption } from '@/lib/decryption';
import {
  armTextSwap,
  consumeTextSwap,
  textSwapMask,
} from '@/lib/text-swap-mask';
import {
  armWorksGate,
  releaseWorksGate,
  reportWorkReady,
  worksGateOpen,
  worksGateSides,
  updateWorksGateRecovery,
} from '@/lib/works-gate';
import { takeTestPair } from '@/lib/test-pair';
import { animateArenaLayout } from '@/lib/arena-layout';
import { ShareButton, duelShareQuery, setSharePair } from '@/components/share';
import { schedulePromptScroll, alignArenaTransition } from '@/lib/arena-scroll';
import { createGameTransition, homeNavigate, bandsNavigate } from '@/lib/game-transitions';
import { Afterparty } from '@/components/afterparty';
import { AudienceVerdict } from '@/components/vote-split';
import { AigcLabel } from '@/components/legal-footer';
import './conversation-arena.css';
import './arena-empty.css';

// 评论区暂时隐藏（2026-09-30 用户决定）；恢复时改回 true，后端评论接口未改动。
const COMMENTS_ENABLED = false;
const ABORTED = 'sequence-cancelled';
const motionQuery = '(prefers-reduced-motion: reduce)';
const ARENA_TIMING = {
  introLead: 1000,
  introReplayLead: 220,
  introGateTail: 240,
  // 揭幕段：加载过场收场 + 作品淡入，从 introLead 余量里扣，故首入总时长不变
  introRevealHold: 320,
  resultReveal: 1350,
  // 双方作品就绪前不展开（用户拍板：死等）。超过这个时长仍在等的，才在加载
  // 过场里给出「跳过此题」入口——不替用户强行揭幕，只给他离开的权利
  worksSkipAt: 8000,
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
  | { state: 'unbound' }
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
  const { user, openBinding } = useAccount();
  const [mine, setMine] = useState<ReactionKind | null>(null);
  const [counts, setCounts] = useState<Record<ReactionKind, number> | null>(
    null,
  );
  const [burst, setBurst] = useState<ReactionKind | null>(null);
  const [reactionError, setReactionError] = useState('');
  const [reactionRevision, setReactionRevision] = useState(0);
  const reactionKnown = useRef<ReactionKind | null>(null);
  useEffect(() => {
    const rejected = (event: Event) => {
      const entry = (event as CustomEvent).detail;
      if (entry.promptId !== promptId || entry.mid !== mid) return;
      setReactionError(t('绑定并验证邮箱后才能表态。'));
      const known = reactionKnown.current;
      setCounts((current) => {
        if (!current) return current;
        const restored = { ...current };
        if (mine) restored[mine] = Math.max(0, restored[mine] - 1);
        if (known) restored[known] += 1;
        return restored;
      });
      setMine(known);
      setBurst(null);
      setReactionRevision((revision) => revision + 1);
    };
    window.addEventListener('account-email-required', rejected);
    return () => window.removeEventListener('account-email-required', rejected);
  }, [promptId, mid, mine, t]);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 先把上一局/上一页没同步出去的意图补发，再读服务端真相
      await flushReactions();
      if (cancelled) return;
      try {
        const response = await apiFetch(
          `/api/reactions?prompt=${encodeURIComponent(promptId)}`,
        );
        if (!response.ok) return;
        const data = (await response.json()) as {
          counts?: Record<string, Partial<Record<ReactionKind, number>>>;
          mine?: Record<string, ReactionKind>;
        };
        if (cancelled) return;
        const row = data.counts?.[mid] ?? {};
        const serverMine = data.mine?.[mid] ?? null;
        reactionKnown.current = serverMine;
        const merged: Record<ReactionKind, number> = {
          up: row.up ?? 0,
          down: row.down ?? 0,
          laugh: row.laugh ?? 0,
        };
        // 补发失败仍在队列里的（下次再重试），显示时把本地意图叠加在服务端数上
        const queued = peekPending(user?.id ?? '', promptId, mid);
        if (queued !== undefined) {
          if (serverMine)
            merged[serverMine] = Math.max(0, merged[serverMine] - 1);
          if (queued) merged[queued] += 1;
        }
        setCounts(merged);
        setMine(queued !== undefined ? queued : serverMine);
      } catch {
        /* 拉不到就只显示零计数，不挡流程 */
      }
    })();
    return () => {
      cancelled = true;
      // 离开这件作品（换组/换题/路由切换）：补发该 mid 的最终意图
      void flushReactions();
    };
  }, [promptId, mid, user?.id, user?.email, reactionRevision]);
  // 本地优先（2026-09-20 用户拍板）：点击只改本地并记 pending，同步在卸载/关页
  // 时按 mid 补发最终意图（lib/reactions.ts）——反应是一槽覆盖写，只发最后一个
  // 不丢信息，乱按不再烧 social 限流桶；未登录当场提示，不做无用记录
  const react = (kind: ReactionKind) => {
    if (!user) {
      setReactionError(t('登录后才能表态。'));
      return;
    }
    if (!user.email) {
      setReactionError(t('绑定并验证邮箱后才能表态。'));
      openBinding();
      return;
    }
    setReactionError('');
    const next = mine === kind ? null : kind;
    setCounts((current) => {
      if (!current) return current;
      const updated = { ...current };
      if (mine) updated[mine] = Math.max(0, updated[mine] - 1);
      if (next) updated[next] += 1;
      return updated;
    });
    setMine(next);
    if (next && next !== mine) setBurst(next);
    queueReaction(user.id, promptId, mid, next, reactionKnown.current);
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
      <output className="reaction-status" aria-live="polite">
        {reactionError}
        {reactionError && user && !user.email && (
          <button type="button" onClick={openBinding}>{t('绑定邮箱 ↗')}</button>
        )}
      </output>
    </div>
  );
}

export function Work({
  result,
  side,
  expanded = false,
  interactive = false,
  imageFailed = false,
  cleanPreview = false,
}: {
  result: ModelResult;
  side: Side;
  expanded?: boolean;
  /** 小预览也允许交互（点击画面、作品内按钮）——投票阶段才开启 */
  interactive?: boolean;
  imageFailed?: boolean;
  /** Entertainment previews hide detectable overlays; expanded works show the original UI. */
  cleanPreview?: boolean;
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
    const content = 'src' in result.content
      ? { ...result.content, src: withArenaControls(result.content.src, cleanPreview && !expanded,
        /^(建模|3D 场景|物理模拟|体素世界)$/.test(currentPrompts().find(item => item.id === result.promptId)?.category ?? '')) }
      : result.content;
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
        sandbox={inline || content.sandboxed ? 'allow-scripts' : 'allow-scripts allow-same-origin'}
        data-ready-probe={!inline && (content.sandboxed || content.readyProbe) ? 'required' : undefined}
        inert={!interactive}
        style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      />
    );
  }
  const story = result.content.story;
  return (
    <article className={`story-work story-${side} ${result.promptId === '008' ? 'conversation-reply' : ''}`} data-tour-scroll>
      {/* 信纸装扮只属于有标题有落款的信件（002）；008 聊天回复是纯正文 */}
      {story.heading ? (
        <>
          <div className="story-meta">
            <span>{t('一封未寄出的信')}</span>
            <span>23:59:59</span>
          </div>
          <h3>
            {story.heading}
            <span>{t('。')}</span>
          </h3>
        </>
      ) : null}
      <div className="story-body">
        {story.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      {story.ending ? (
        <footer>
          <span>{localize(story.ending)}</span>
          <AudioLines size={20} />
        </footer>
      ) : null}
    </article>
  );
}

export default function Arena({
  prompt,
  formal = false,
  initialPair,
}: {
  prompt: Prompt;
  // 正式测评（决策 024）：全程匿名、无评论区；地址 #formal/{promptId}
  formal?: boolean;
  initialPair?: Matchup;
}) {
  const { t, localize } = useI18n();
  const scope = formal ? 'formal' : 'entertainment';
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
  // 测试对局（2026-09-19，后台作品管理直达）：挂载时消费一次测试对；testing
  // 从 pair 派生——换组/换题/清单重算把 pair 换掉后自动失效，不用到处补复位
  const [testPair] = useState(() => formal ? null : takeTestPair(prompt.id));
  // 2026-10-03：对局允许落空（题库作品被清空/下架时）——渲染层给出明确的
  // 「未就绪」空态，绝不再沿用其他题的对局硬撑（024 帆船挂 787 对局的教训）
  const [pair, setPair] = useState<Matchup | null>(
    () => testPair ?? initialPair ?? currentMatchup(prompt.id, undefined, scope) ?? null,
  );
  const recoveryBusy = useRef(false);
  const recoveryBudget = useRef({ run: 0, used: false });
  const [workAttempt, setWorkAttempt] = useState(0);
  const [recovering, setRecovering] = useState(false);
  const [testIds, setTestIds] = useState<string[] | null>(() =>
    testPair ? [testPair[0].id, testPair[1].id] : null,
  );
  // testing 按无序对号判定（2026-09-20 审查修复）：换一组时 finishPair 会随机
  // 翻左右，按座位比会把「同一对、镜像出场」误判为普通对局——测试徽标消失且
  // 票真落库（只有一对可用作品的题必中，真库 003 就是）
  const testing =
    !!testIds &&
    !!pair &&
    pairKeyOf(pair[0].id, pair[1].id) === pairKeyOf(testIds[0], testIds[1]);
  // 题目分享卡嵌当前对局缩略图（决策 107）：页脚分享入口在全局布局里，
  // 对局 id 经 share 模块的小 store 递过去，卸载即清。
  useEffect(() => {
    if (!pair) return;
    setSharePair([pair[0].id, pair[1].id]);
    return () => setSharePair(null);
  }, [pair]);
  // 远端清单晚到时重算对局（2026-09-15 修复）：应用启动先以内置花名册起画，
  // /api/works 返回后若不重算，棋盘还是内置作品而统计区已切远端数据——
  // 票面与服务端作品表核对不上，投票会 400。订阅 works 变化重抽一组。
  // 2026-09-17 收紧：当前对局在新清单里仍然成立就原样保留——每次 emit 都
  // 无条件重抽会把 voting/result 阶段脚下的对局整个换掉，旧票的选中态与
  // 人数牌平移到没见过的新对局上；只有对局已失效（花名册 id 对不上远端）
  // 才重抽，此时保住旧对局反而会让投票必 400。
  useEffect(
    () =>
      subscribeWorks(() => {
        // The recovery owner replaces both content objects after refresh, even for identical ids.
        if (recoveryBusy.current) return;
        // 挂载时远端清单还没到 → 测试对查不到作品；清单落地后补消费一次
        const test = formal ? null : takeTestPair(prompt.id);
        if (test) {
          setTestIds([test[0].id, test[1].id]);
          setPair(test);
          return;
        }
        setPair((current) => {
          // 无序对号：展示左右是 finishPair 随机翻的，按座位比会把同一对误判失效
          const key = current && pairKeyOf(current[0].id, current[1].id);
          if (
            key &&
            currentPairs(prompt.id, scope).some(
              (candidate) =>
                pairKeyOf(candidate[0].id, candidate[1].id) === key,
            )
          )
            return current;
          // 2026-10-03 收紧：新清单里抽不出对局（题被清空/作品下架）就落空
          // 进空态，不再沿用旧对硬撑——沿用只会让票面与题面错位且投票必 400
          return currentMatchup(prompt.id, undefined, scope);
        });
      }),
    [prompt.id, formal, scope],
  );
  // 进场即刷新配对暗分：启动时那份快照会随着投票漂移（046）
  useEffect(() => {
    refreshRatings(scope);
  }, [scope]);
  const pairCount = currentPairs(prompt.id, scope).length;
  const hasOtherArena = currentPrompts().some(
    (item) => item.id !== prompt.id && currentPairs(item.id, scope).length > 0,
  );
  const continueLock = useRef(false);
  // 换对的新稿暂存：快门盖满前旧作还在场上，提前 setPair 会让新作品的加载
  // 过程从没盖住的缝隙里漏出来——transition 效应在盖满那一刻才真正换稿
  const nextPairRef = useRef<Matchup | null>(null);
  // transition 门控是否真等到了双侧就绪（8s 兜底放行不算）：放行了的 ARRIVE
  // 走 intro 快速通道（不再闪「正在接入试验场」），快门退场直接落在成品上
  const [gatePassed, setGatePassed] = useState(false);
  const [continueFromRun, setContinueFromRun] = useState<number | null>(null);
  const continuing = continueFromRun === state.run ||
    (continueFromRun !== null && state.phase !== 'voting' && state.phase !== 'result');
  useEffect(() => {
    if (state.phase === 'voting' || state.phase === 'result') {
      continueLock.current = false;
    }
  }, [state.phase]);
  const resultCount = currentResultsForPrompt(prompt.id).filter(entry => !entry.isDemo).length;
  // 平局按钮的中文主标：按 run 散列轮换成语（每轮对局换一个，纯推导不存状态）
  const drawLabel = DRAW_LABELS[(state.run * 37 + 11) % DRAW_LABELS.length];
  const [expanded, setExpanded] = useState<Side | null>(null);
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  // 作品就绪门控的揭幕状态：完全就绪前不展开（加载过场压着、作品区 works-hold），
  // 就绪后统一淡入揭幕（works-reveal）——长加载不再出现「后半段直接没了」
  const [worksSettled, setWorksSettled] = useState(false);
  // 逐侧就绪：加载期两条投票条当进度条用，谁先加载完谁先填回队色
  const [worksPendingBySide, setWorksPendingBySide] = useState({
    a: true,
    b: true,
  });
  // 死等超过 worksSkipAt 仍未就绪：加载过场里给出「跳过此题」
  const [worksStalled, setWorksStalled] = useState(false);
  // 入场等待期：数据未到或作品未完全就绪都算——加载过场压着、作品区隐藏
  const worksLoading =
    state.phase === 'loading' || (state.phase === 'intro' && !worksSettled);
  useEffect(() => {
    if (!worksLoading) return;
    const timeout = setTimeout(() => {
      setWorksStalled(true);
      // 有上级纸幕时保持盖满，退出入口由纸幕自身提供；深链保留原跳过出口。
      if (!document.querySelector('.game-transition.gt-match')) releaseWorksGate();
    }, ARENA_TIMING.worksSkipAt);
    return () => clearTimeout(timeout);
  }, [worksLoading]);
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
    // 加载超时后仍允许既有「跳过此题」出口，普通继续按钮保持禁用。
    if (((continueLock.current || worksLoading) && !worksStalled) || state.phase === 'transition') return;
    const candidate = currentRandomArenaHash(prompt.id, scope);
    const next = formal ? candidate.replace('#arena/', '#formal/') : candidate;
    if (next === window.location.hash) {
      setSoloNotice(true);
      setTimeout(() => setSoloNotice(false), 3000);
      return;
    }
    if (arenaTransition.current) return;
    // 上一幕纸幕还被作品就绪门钉着：此刻再起一幕会两张叠放，直接不响应
    if (!worksGateOpen()) return;
    continueLock.current = true;
    setContinueFromRun(state.run);
    // 两种测评「换题继续」：双页纸幕只盖住场内区域（field-meta → 操作行），
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
    const destination = currentPrompts().find((item) => `#arena/${item.id}` === candidate);
    // 布防作品就绪门（决策 096）：纸幕盖满切 hash 后钉在盖满位，新页双侧
    // 作品就绪（或超时/跳过）才扫出——「正在接入试验场」整拍被牌面吸收
    armWorksGate();
    const transition = createGameTransition('match', {
      title: destination?.name,
      index: destination?.id,
      holdGate: worksGateOpen,
      onFrame: () => {
        alignArenaTransition(transition.layer);
        updateWorksGateRecovery(transition.layer);
        // 新页上报的逐侧就绪写回牌面：duel 连线按侧填成队色报进度
        const sides = worksGateSides();
        transition.layer.toggleAttribute('data-gt-a', sides.a);
        transition.layer.toggleAttribute('data-gt-b', sides.b);
      },
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
    alignArenaTransition(transition.layer);
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
  // 已通过探针（作品内渲染循环首帧 postMessage，见 data-aob-probe 注入约定）
  // 声明「渲染管线已启动」的 iframe 窗口。WeakSet：换题后旧窗口自然失效
  const readyWindows = useRef<WeakSet<Window>>(new WeakSet());
  const retiredWindows = useRef<WeakSet<Window>>(new WeakSet());
  const loadingWindows = useRef<WeakMap<Window, number>>(new WeakMap());
  const cardB = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => animateArenaLayout(stageRef.current, reducedMotion), [prompt.id, reducedMotion]);
  // 换组先装载新 iframe，620ms 后才进入 intro。监听必须覆盖整个组件生命期，
  // 否则快作品在 transition 中发出的一次性通知会丢失，入场就永久等待。
  // layout effect 在浏览器处理新 iframe 的消息前就注册；重播同一作品不清空就绪。
  useLayoutEffect(() => {
    const currentFrame = (frame: HTMLIFrameElement) => [cardA, cardB].some(card =>
      card.current?.querySelector('iframe') === frame,
    );
    const recordStart = (source: Window) => {
      if (!loadingWindows.current.has(source)) loadingWindows.current.set(source, performance.now());
    };
    const onFrameLoad = (event: Event) => {
      const frame = event.target;
      if (!(frame instanceof HTMLIFrameElement) || !currentFrame(frame) || !frame.contentWindow) return;
      // The initial blank document is not a completed content navigation.
      try { if (frame.contentDocument?.location.href === 'about:blank') return; } catch { /* Cross-origin work. */ }
      recordStart(frame.contentWindow);
    };
    const onWorkReady = (event: MessageEvent) => {
      if (!event.source || ![cardA, cardB].some(card =>
        card.current?.querySelector('iframe')?.contentWindow === event.source,
      )) return;
      const source = event.source as Window;
      if (event.data === 'aob:work-ready' && !recoveryBusy.current && !retiredWindows.current.has(source)) readyWindows.current.add(source);
      // Start the rendering budget once the document arrives. Repeated signals
      // cannot extend it; error pages use the iframe load event instead.
      if (event.data === 'aob:work-loading') recordStart(source);
    };
    window.addEventListener('message', onWorkReady);
    const frames = [cardA, cardB].flatMap(card => {
      const frame = card.current?.querySelector('iframe');
      return frame ? [frame] : [];
    });
    frames.forEach(frame => frame.addEventListener('load', onFrameLoad));
    return () => {
      window.removeEventListener('message', onWorkReady);
      frames.forEach(frame => frame.removeEventListener('load', onFrameLoad));
    };
  }, [pair, workAttempt]);
  const loadingPhase = useRef(state.phase);
  useLayoutEffect(() => { loadingPhase.current = state.phase; }, [state.phase]);
  useEffect(() => {
    if (!pair) { releaseWorksGate(); return; }
    if (recoveryBudget.current.run !== state.run) {
      recoveryBudget.current = { run: state.run, used: false };
    }
    const controller = new AbortController();
    const started = performance.now();
    let live = true;
    const pendingIds = () => [cardA, cardB].flatMap((card, index) => {
      const frame = card.current?.querySelector<HTMLIFrameElement>('iframe[data-ready-probe="required"]');
      const start = frame?.contentWindow && loadingWindows.current.get(frame.contentWindow);
      return frame && (!frame.contentWindow || !readyWindows.current.has(frame.contentWindow)) &&
        // Scene builds may outlive ten seconds. Static content retains the short budget.
        // A stalled request without either signal still reaches recovery.
        performance.now() - (start ?? started) >= (start === undefined || start === null ? 20000 :
          new URL(frame.src, location.href).searchParams.getAll('aob').includes('arena-scene') ? 30000 : 10000) ? [pair[index].id] : [];
    });
    const stopAtEmpty = () => {
      setRecovering(false);
      setPair(null);
      releaseWorksGate();
    };
    const timer = setInterval(() => {
      if (!['loading', 'intro', 'transition'].includes(loadingPhase.current) || recoveryBusy.current) return;
      const failed = pendingIds();
      if (!failed.length) return;
      clearInterval(timer);
      if (recoveryBudget.current.used) { stopAtEmpty(); return; }
      recoveryBudget.current.used = true;
      recoveryBusy.current = true;
      [cardA, cardB].forEach(card => {
        const source = card.current?.querySelector('iframe')?.contentWindow;
        if (source) retiredWindows.current.add(source);
      });
      setRecovering(true);
      const notice = document.querySelector('.game-transition.gt-match');
      if (notice) {
        const status = document.createElement('output');
        status.className = 'gt-recovery';
        status.textContent = translate('作品接入失败，正在换一组…', getLocale());
        notice.append(status);
      }
      const timeout = setTimeout(() => controller.abort(), 10000);
      void refreshWorks(controller.signal).then((ok) => {
        if (!live) return;
        if (!ok) { stopAtEmpty(); return; }
        const candidates = currentPairs(prompt.id, scope);
        const preferred = candidates.filter((candidate) => candidate.every((work) => !failed.includes(work.id)));
        const choices = preferred.length ? preferred : candidates;
        const next = choices[Math.floor(Math.random() * choices.length)] ?? null;
        setGatePassed(false);
        setWorksSettled(false);
        setWorksStalled(false);
        setPair(next);
        // Remount both windows even when the refreshed pair has the same ids.
        setWorkAttempt((attempt) => attempt + 1);
        setRecovering(false);
        if (!next) releaseWorksGate();
      }).finally(() => {
        clearTimeout(timeout);
        recoveryBusy.current = false;
        notice?.querySelector('output.gt-recovery')?.remove();
      });
    }, 60);
    return () => { live = false; clearInterval(timer); controller.abort(); };
  }, [pair, prompt.id, scope, state.run, workAttempt]);
  const audioRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(false);
  const round = {
    ...prompt,
    models: pair?.map((entry) => entry.modelName) ?? [],
    labels: pair?.map((entry) => entry.title) ?? [],
  };
  const revealed =
    state.mode === 'party' ||
    (state.phase === 'result' && state.mode !== 'formal');
  const transitioning = state.phase === 'transition';
  const blocked = state.phase === 'loading' || transitioning;
  const continueBlocked = blocked || worksLoading || continuing;

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

  // 双方作品就绪门控（组件级，transition 快门与 intro 揭幕共用）：HTML 作品挂
  // 同源沙箱 iframe，读 contentDocument 的地址与 readyState；非 iframe 作品
  // （文字/模板/图片）视为即时就绪。初始 about:blank 算未就绪——防 src 导航
  // 尚未提交时的假阳性。不透明源（内联 srcDoc 占位）读不到文档，视为就绪不拦。
  // 探针作品还要等 aob:work-ready：娱乐静态页以 DOM 可用为准，场景页需
  // 已实际绘制且已识别的加载浮层消失；正式模式保留原探针策略。
  // 无探针的老文档沿用文档就绪判断。
  const waitWorksLoaded = useCallback(async (abort: AbortSignal) => {
    const workReady = (card: HTMLElement | null): boolean => {
      const frame = card?.querySelector('iframe');
      if (!frame) return true;
      if (frame.dataset.readyProbe === 'required')
        return !!frame.contentWindow && !retiredWindows.current.has(frame.contentWindow) && readyWindows.current.has(frame.contentWindow);
      try {
        const doc = frame.contentDocument;
        if (!doc) return true;
        if (doc.location.href === 'about:blank') return false;
        if (doc.readyState !== 'complete') return false;
        // 换稿竞态：新 src 已写进属性但新文档未落地时，挂着的还是上一稿的
        // 旧文档（就绪、探针都齐）——地址对不上当前 src 就不算就绪，否则
        // 门控在换稿提交前放行，新稿在揭幕下裸加载（2026-09-25 采样抓到）
        const target = frame.getAttribute('src');
        if (
          target &&
          doc.location.pathname !== new URL(target, doc.location.href).pathname
        )
          return false;
        if (
          doc.querySelector('script[data-aob-probe]') &&
          (!frame.contentWindow || !readyWindows.current.has(frame.contentWindow))
        )
          return false;
        return true;
      } catch {
        return true;
      }
    };
    // 逐侧就绪回写：加载期下方两条投票条按各自队列色当进度条用；
    // 同时上报纸幕门——钉着的牌面 duel 连线按侧填色（096）
    const poll = (): boolean => {
      if (recoveryBusy.current) return false;
      if (stageRef.current?.dataset.layoutMoving === 'true') return false;
      const a = workReady(cardA.current);
      const b = workReady(cardB.current);
      if (a) reportWorkReady('a');
      if (b) reportWorkReady('b');
      setWorksPendingBySide((current) =>
        current.a === !a && current.b === !b ? current : { a: !a, b: !b },
      );
      return a && b;
    };
    // 死等：未完全就绪不展开（用户拍板，取消原 8 秒超时放行）
    while (!poll()) await delay(60, abort);
    // Only report readiness here. Release the route curtain after the reveal commits.
  }, []);

  useEffect(() => {
    if (state.phase !== 'intro' || !pair) return;
    const introStage = stageRef.current;
    const controller = new AbortController();
    const signal = controller.signal;
    const resetScroll = () => {
      stageRef.current
        ?.querySelectorAll<HTMLElement>('[data-tour-scroll]')
        .forEach((work) => {
          work.scrollTop = 0;
        });
    };
    const sequence = async () => {
      resetScroll();
      // 快门门控放行的 ARRIVE（重播/换对已验证双侧就绪）：整段加载过场跳过，
      // 不再闪「正在接入试验场」——快门退场扫完直接落在成品作品上
      if (gatePassed) {
        setWorksSettled(true);
        setWorksPendingBySide({ a: false, b: false });
        await delay(reducedMotion ? 60 : 440, signal);
        play('reveal');
        releaseWorksGate();
        dispatch({ type: 'READY' });
        return;
      }
      setWorksSettled(false);
      setWorksPendingBySide({ a: true, b: true });
      if (reducedMotion) {
        await Promise.all([delay(200, signal), waitWorksLoaded(signal)]);
        setWorksSettled(true);
        await delay(60, signal);
        releaseWorksGate();
        dispatch({ type: 'READY' });
        return;
      }
      // After preparing the finished scene under cover, wait for the route curtain
      // before unlocking voting. This wait must never block the readiness gate.
      const waitRouteLayer = async (abort: AbortSignal) => {
        for (let waited = 0; waited < 2600; waited += 40) {
          const layer = document.querySelector<HTMLElement>(
            '.game-transition, .page-wipe',
          );
          if (!layer) break;
          if (
            layer.classList.contains('gt-match') &&
            layer.dataset.gtPhase === 'exit'
          ) {
            await delay(ARENA_TIMING.introGateTail, abort);
            break;
          }
          await delay(40, abort);
        }
      };
      // 首入 1.0s / 重播 0.22s 的既有节拍里留出揭幕段：快加载总时长不变，
      // 慢加载只往后顺延，绝不提前展开
      const lead =
        state.run === 0
          ? ARENA_TIMING.introLead
          : ARENA_TIMING.introReplayLead;
      const revealHold = Math.min(ARENA_TIMING.introRevealHold, lead);
      const leadStart = performance.now();
      await Promise.all([
        waitWorksLoaded(signal),
        delay(lead - revealHold, signal),
      ]);
      setWorksSettled(true);
      // 揭幕淡入与加载过场收场必须播完才离开 intro，不被卸载切走
      await delay(
        Math.max(700, revealHold, lead - (performance.now() - leadStart)),
        signal,
      );
      releaseWorksGate();
      await waitRouteLayer(signal);
      play('reveal');
      dispatch({ type: 'READY' });
    };
    sequence().catch((error) => {
      if (!signal.aborted && error?.name !== 'AbortError') setWorksStalled(true);
    });
    return () => {
      controller.abort();
      resetScroll();
      // A recovery restarts intro under the same curtain; cleanup must not reveal
      // the replacement before its probe. Navigation and explicit skip still release.
      queueMicrotask(() => {
        if (!introStage?.isConnected || ['voting', 'result'].includes(loadingPhase.current)) releaseWorksGate();
      });
    };
  }, [
    state.phase,
    state.run,
    state.round,
    prompt.kind,
    reducedMotion,
    play,
    waitWorksLoaded,
    gatePassed,
    pair,
    workAttempt,
  ]);

  useEffect(() => {
    // transition 快门钉到作品就绪（2026-09-25 用户反馈）：盖满（shutter-cover
    // 末帧）才换稿，新对在盖满的快门后面加载，双侧就绪（探针口径）才放
    // ARRIVE——退场扫开直接落在成品上，加载过程全程不可见。原 shutter-in
    // 自带的 70%→100% 退场已拆掉：0.61s 一到快门自己扫走、露出裸加载，
    // 再被「正在接入试验场」盖住，正是用户截图里那一串。卡死超过
    // worksSkipAt 放行给 intro 的「跳过此题」出口，不死等。
    if (state.phase === 'transition' && pair) {
      const controller = new AbortController();
      const signal = controller.signal;
      let live = true;
      const arrive = async () => {
        // 上一轮 intro 遗留的放行标记先清掉：8s 兜底放行的 ARRIVE 不准
        // 复用上一轮的快速通道
        setGatePassed(false);
        setWorksStalled(false);
        await delay(reducedMotion ? 60 : 500, signal);
        if (nextPairRef.current) {
          const next = nextPairRef.current;
          nextPairRef.current = null;
          setPair(next);
          // 等 React 把换稿提交进 DOM（iframe src 属性指向新稿）再等就绪：
          // 提交前 poll 读到的是旧稿——旧稿文档、探针俱全，门会在换稿
          // 落地前放行，新稿就在退场动画下裸加载（帧采样抓到过）
          const before = [
            ...document.querySelectorAll('iframe.html-work'),
          ].map((frame) => frame.getAttribute('src'));
          for (let i = 0; before.length > 0 && i < 40; i++) {
            await delay(16, signal);
            const now = [
              ...document.querySelectorAll('iframe.html-work'),
            ].map((frame) => frame.getAttribute('src'));
            if (
              now.length === before.length &&
              now.some((src, index) => src !== before[index])
            )
              break;
          }
        }
        const winner = await Promise.race([
          waitWorksLoaded(signal).then(() => 'ready' as const),
          delay(ARENA_TIMING.worksSkipAt, signal).then(async () => {
            // Legacy local pages retain their manual timeout; platform probe frames
            // remain covered while the one-shot recovery owner handles their failure.
            if ([cardA, cardB].some(card => card.current?.querySelector('[data-ready-probe="required"]'))) {
              await waitWorksLoaded(signal);
              return 'ready' as const;
            }
            return 'stalled' as const;
          }),
        ]);
        if (!live) return;
        setGatePassed(winner === 'ready');
        // 8s 兜底放行：卡死状态带进 intro，「跳过此题」立刻可见——
        // 用户在快门下已经等了 8s，不再叠一层 intro 的 8s 计时
        if (winner === 'stalled') setWorksStalled(true);
        setExpanded(null);
        dispatch({ type: 'ARRIVE' });
      };
      arrive().catch(() => {});
      return () => {
        live = false;
        controller.abort();
      };
    }
    const timeout =
      state.phase === 'locking'
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
  }, [state.phase, reducedMotion, play, waitWorksLoaded, pair, workAttempt]);

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
  const { open: openAccount, openBinding } = useAccount();

  const recordVote = useCallback(
    (side: Side | 'draw') => {
      // 测试对局（后台直达对比）：票不落库，但本地反馈流程照跑完——
      // 记为 saved 让揭晓/票数面板正常收场，note 单独文案说明未计入
      if (testing) {
        setVoteRecord({ run: state.run, outcome: { state: 'saved' } });
        return;
      }
      // 平局（决策 048）：双方按出场左右顺序登记（a 入 winner、b 入 loser），无胜负语义
      if (!pair) return;
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
        id: newId(),
        promptId: prompt.id,
        winnerRid: winner.id,
        winnerMid: winner.modelId,
        loserRid: loser.id,
        loserMid: loser.modelId,
        mode: state.mode,
        outcome,
      }).then((result) => {
        // 票一落库就刷新配对暗分（046）：否则整局会话都用启动时的旧快照
        if (result.ok) refreshRatings(scope);
        setVoteRecord({
          run: state.run,
          outcome: result.ok
            ? { state: 'saved' }
            : result.issue === 'auth'
              ? { state: 'auth' }
              : result.issue === 'unbound'
                ? { state: 'unbound' }
              : result.issue === 'dup'
                ? { state: 'dup' }
                : { state: 'failed', message: result.error },
        });
      });
    },
    [pair, prompt.id, state.mode, state.run, testing, scope],
  );

  const vote = useCallback(
    (side: Side | 'draw') => {
      if (state.phase !== 'voting' || !pair) return;
      play('vote');
      dispatch({ type: 'VOTE', side });
      recordVote(side);
    },
    [state.phase, play, recordVote, pair],
  );
  const nextMatchup = useCallback(() => {
    if (
      state.phase === 'loading' || state.phase === 'transition' ||
      ((worksLoading || continueLock.current) && !worksStalled) ||
      arenaTransition.current || !worksGateOpen()
    ) return;
    continueLock.current = true;
    setContinueFromRun(state.run);
    play('move');
    // 新对先暂存不换稿（真正换稿在 transition 效应盖满那一刻）：快门进场
    // 扫的这 0.45s 里右侧还没盖住，提前 setPair 会让新作品的加载过程从
    // 缝里漏出来。清单失效抽不出新对时落空进空态（2026-10-03）：沿用旧对
    // 只会让票面与题面错位且投票必 400，空态至少明示「本题暂不可比」
    const nextUp = currentMatchup(prompt.id, pair ?? undefined, scope);
    if (!nextUp) {
      continueLock.current = false;
      setPair(null);
      return;
    }
    nextPairRef.current = nextUp;
    dispatch({ type: 'REPLAY' });
  }, [state.phase, state.run, prompt.id, play, worksLoading, worksStalled, scope, pair]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        expanded || document.querySelector('[data-slot="dialog-content"][data-open]') ||
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

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  };

  const statusText = worksLoading
    ? '画面载入中'
    : state.phase === 'intro'
      ? '作品入场'
      : state.phase === 'voting'
        ? '做出选择'
        : state.phase === 'locking'
          ? '选择已锁定'
          : state.phase === 'result'
            ? '本轮评审完成'
            : '正在切换对局';

  // 空题态（2026-10-03）：对局落空时明确告诉访客本题暂时不可比，
  // 而不是展示一个对不上题面的旧对局（024 帆船挂 787 对局的教训）。
  // 此处已在全部 hooks 之后，提前返回不影响 hook 顺序。
  if (!pair) {
    return (
      <div className="arena-shell arena-unavailable">
        <header className="topbar">
          <a className="brand" href="#home" aria-label={t('回到首页')} onClick={event => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault(); homeNavigate();
          }}><Mark /><strong>ARENA OF <span className="brand-tag">BIAS</span></strong></a>
          <div className="header-right"><LanguageSwitch /><ThemeToggle /><AccountButton /></div>
        </header>
        <main className="arena-empty-content">
          <span className="arena-empty-prompt">{prompt.id} / {localize(prompt.name)}</span>
          <h1>{t('这个竞技场还未就绪。')}</h1>
          <output>{t('题库里的作品暂时配不出可比的一组，稍后再来看看。')}</output>
          <div className="arena-empty-actions">
            {hasOtherArena && <button className="arena-empty-next" onClick={() => {
              releaseWorksGate();
              const hash = currentRandomArenaHash(prompt.id, scope);
              bandsNavigate(formal ? hash.replace('#arena/', '#formal/') : hash);
            }}>{t('换个题库继续')}<ArrowRight size={18} /></button>}
            <a href="#home" onClick={event => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault(); homeNavigate();
            }}>{t('回到首页')}</a>
            <a href="#prompts">{t('前往提示词库 ↗')}</a>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`arena-shell ${prompt.id === '008' ? 'conversation-arena' : ''} phase-${state.phase} ${reducedMotion ? 'reduced-motion' : ''} ${
        worksLoading ? 'works-hold' : worksSettled ? 'works-reveal' : ''
      } ${state.phase === 'intro' && gatePassed ? 'shutter-exit' : ''}`}
    >
      <div className="ambient-grid" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="#home" aria-label={t('回到首页')} onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          homeNavigate();
        }}>
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
          <a href="#prompts" className="arena-home-link">
            {t('提示词库')}
          </a>
        </div>
        <div className="header-right">
          <LanguageSwitch />
          <ThemeToggle />
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
        <section
          className="briefing"
          ref={briefingRef}
          aria-label={t('本轮创作要求')}
        >
          <div className="briefing-heading">
            <div className="round-tag" data-long-id={round.id.length > 3 || undefined} title={round.id}><b data-swap>{round.id}</b></div>
            <div className="briefing-copy">
              <h1 data-swap>{round.name}</h1>
              <button
                className="prompt-toggle"
                aria-expanded={expandedPrompt === round.id}
                aria-controls={`arena-prompt-${round.id}`}
                onClick={() => setExpandedPrompt(current => current === round.id ? null : round.id)}
              >{t('查看完整提示词')}</button>
            </div>
            <span className="arena-mode-label">{t(formal ? '正式测评' : '娱乐测评')}</span>
          </div>
          <p className="briefing-prompt" id={`arena-prompt-${round.id}`} hidden={expandedPrompt !== round.id} data-swap>{round.prompt}</p>
        </section>
        <div className="field-meta">
          <span>{localize(round.category)}</span>
          {testing && <span className="field-testing">{t('测试对局 · 投票不落库')}</span>}
          <output className="field-status" aria-live="polite"><i />{localize(statusText)}</output>
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
            {localize('VS')}
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
                  <span className="work-arrival-veil" aria-hidden="true" />
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
                    <AigcLabel />
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
                        // 新作品使用新窗口，不能沿用上一份 iframe 的就绪身份。
                        key={`${result.id}-${workAttempt}`}
                        result={result}
                        cleanPreview={!formal && state.mode === 'blind'}
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
                              ? prompt.id === '008' ? round.category : 'TEXT / 短篇创作'
                              : 'IMAGE / 概念设计',
                      )}
                    </span>

                    <span>
                      0{index + 1} — {localize(round.id)}
                    </span>
                  </div>
                </div>
                <button
                  className={`vote-button vote-${side} ${
                    worksLoading && worksPendingBySide[side] ? 'is-pending' : ''
                  }`}
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
          {!worksSettled && (state.phase === 'loading' || (state.phase === 'intro' && !gatePassed)) && (
            <div
              className={`loading-overlay ${worksSettled ? 'is-clearing' : ''}`}
            >
              <Mark />
              <output>{t(recovering ? '作品接入失败，正在换一组…' : '正在接入试验场')}</output>
              <div className="load-track" />
              {worksStalled && (
                <button
                  type="button"
                  className="loading-skip"
                  onClick={() => {
                    // 作品迟迟不就绪：不替用户揭幕，只给他离开这一局的权利
                    if (state.mode === 'formal' && pairCount > 1) nextMatchup();
                    else gotoRandomArena();
                  }}
                >
                  <SkipForward size={14} />
                  {state.mode === 'formal' && pairCount > 1
                    ? t('换一组作品')
                    : t('跳过此题')}
                </button>
              )}
            </div>
          )}
          <div className="transition-shutter" aria-hidden="true">
            <span>{t('SWITCHING FREQUENCY')}</span>
            <b>{localize(String(state.pendingRound + 1).padStart(2, '0'))}</b>
            <div className="shutter-progress">
              <i
                className={worksPendingBySide.a ? 'is-pending' : 'is-done'}
                data-side="a"
              />
              <i
                className={worksPendingBySide.b ? 'is-pending' : 'is-done'}
                data-side="b"
              />
            </div>
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
                      (testing
                        ? '测试对局，票未计入偏好榜'
                        : isPlaceholderMode()
                          ? '已写入本地演示数据 · 占位模式'
                          : formal
                            ? state.choice === 'draw'
                              ? '平局已计入正式测评榜，双方各得半分'
                              : '你的选择已计入正式测评榜'
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
                  {voteOutcome.state === 'unbound' && (
                    <button type="button" className="vote-note-login" onClick={openBinding}>
                      {t('这一票未计入，绑定并验证邮箱后才能投票 ↗')}
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
                <a className="result-board-link" href={formal ? '#rank/formal' : '#rank'} onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  bandsNavigate(formal ? '#rank/formal' : '#rank', { title: 'LEADERBOARD' });
                }}>
                  {t('看看偏好榜 ↗')}
                </a>
              </div>
            </div>
          ) : null}
          <div className="round-actions has-continue-options">
            {state.phase === 'result' && state.choice && state.mode !== 'formal' && !testing && !isPlaceholderMode() && (
              <ShareButton key={`${state.run}-${pair[0].id}-${pair[1].id}`} query={duelShareQuery(prompt, pair, state.choice)} />
            )}
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
            <div className="continue-options">
              <fieldset className="continue-buttons" aria-label={t('继续比较')}>
                <button
                  type="button"
                  className="next-button continue-other"
                  onClick={gotoRandomArena}
                  disabled={continueBlocked || !hasOtherArena}
                  aria-describedby={!hasOtherArena ? 'continue-note' : undefined}
                >
                  <span>{t('换个题库继续')}</span>
                  <ArrowUpRight size={17} />
                </button>
                <button
                  type="button"
                  className="next-button continue-same"
                  onClick={nextMatchup}
                  disabled={continueBlocked}
                  aria-describedby={pairCount === 1 ? 'continue-note' : undefined}
                >
                  <span>{t('同一题库继续')}</span>
                  <ArrowRight size={17} />
                </button>
              </fieldset>
              {(!hasOtherArena || pairCount === 1) && (
                <p className="continue-note" id="continue-note">
                  {!hasOtherArena && <span>{t('暂无其他可比较题目。')}</span>}
                  {pairCount === 1 && <span>{t('本题只有一组作品，继续将重新比较本组。')}</span>}
                </p>
              )}
            </div>
          </div>
        </div>

        {COMMENTS_ENABLED && state.phase === 'result' && state.choice && (
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

        <details className="arena-context">
          <summary>{t('关于本题')}</summary>
          <p>{t('本场收录 {models} 个模型的 {works} 份结果，只在这个提示词内比较。', {
            models: new Set(currentResultsForPrompt(prompt.id).filter(entry => !entry.isDemo).map(entry => entry.modelId)).size,
            works: resultCount,
          })}</p>
          <p data-swap>{round.commentary}</p>
          <a href="#prompts">{t('返回提示词库')} ↗</a>
        </details>
        {soloNotice && <output>{t('现在只有这一个竞技场——先去提示词库看看别的题吧。')}</output>}
      </main>

      <Dialog
        open={expanded !== null}
        onOpenChange={(open) => {
          if (!open) setExpanded(null);
        }}
      >
        <DialogContent
          className={`exhibit-dialog${formal ? '' : ' is-entertainment-preview'} dialog-round-${prompt.kind === 'image' ? 0 : prompt.kind === 'text' ? 1 : 2}`}
          overlayClassName={formal ? undefined : 'exhibit-preview-backdrop'}
          showCloseButton={false}
        >
          <div className="dialog-top">
            <div>
              <DialogTitle>
                {t('作品')}
                {localize(expanded?.toUpperCase())}{' '}
                <span>/ {localize(round.category)}</span> <AigcLabel />
              </DialogTitle>
              {formal && <DialogDescription>{round.prompt}</DialogDescription>}
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
