/* oxlint-disable jsx-a11y/prefer-tag-over-role, jsx-a11y/no-noninteractive-element-to-interactive-role, jsx-a11y/no-noninteractive-tabindex -- Custom combobox retains focus on its input; the labelled history region is keyboard-scrollable. */
// 「模一把」（决策 057）—— Wordle 式猜 AI 模型的独立玩法页。
//
// 视觉层：暗色解谜舞台，配色与动效统一在 guess.css。仅刚提交的一行揭示，
// 恢复存档不重新翻格；CSS 动效不负责写数据或决定胜负。对照页：
// reference/guess-review.html（隔离存储，演示四种状态）；判定规则仍在 guess-logic。

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
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
} from 'lucide-react';
import {
  checkGuess,
  fetchToday,
  loadSession,
  loadStats,
  MAX_ATTEMPTS,
  saveSession,
  settleStats,
  type GuessApiModel,
  type GuessRow,
  type GuessSession,
  type TodayResponse,
} from '@/lib/guess';
import { PRICE_TIERS } from '@/lib/guess-logic';

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

// ── 主组件 ──

export default function GuessPage() {
  const { t } = useI18n();
  const [today, setToday] = useState<TodayResponse | null>(null);
  const [session, setSession] = useState<GuessSession | null>(null);
  const [stats] = useState(() => loadStats());
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false); // 下拉展开
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [freshGuess, setFreshGuess] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadRun, setLoadRun] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // 初始化：拉今日题 + 恢复当日对局（没玩过=空对局，不能停在加载态）
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
      setSession(
        loadSession(data.dayKey) ?? {
          guesses: [],
          finished: false,
          revealed: false,
          answer: null,
        },
      );
    });
    return () => {
      alive = false;
    };
  }, [loadRun]);

  const usedIds = useMemo(
    () => new Set((session?.guesses ?? []).map((row) => row.guess.id)),
    [session],
  );

  // 搜索候选：name/id 前缀或包含匹配，已猜过的排除；空输入按知名度给前 8
  const candidates = useMemo(() => {
    if (!today) return [];
    const q = query.trim().toLowerCase();
    const pool = today.models.filter((m) => !usedIds.has(m.id));
    if (!q) return pool.slice(0, 8); // 数据集按知名度降序，slice 即热门榜
    const scored = pool
      .map((m) => {
        const name = m.name.toLowerCase();
        if (name.startsWith(q)) return { m, rank: 0 };
        if (m.id.includes(q)) return { m, rank: 1 };
        if (name.includes(q)) return { m, rank: 2 };
        return null;
      })
      .filter((x): x is { m: GuessApiModel; rank: number } => x !== null);
    scored.sort((a, b) => a.rank - b.rank || a.m.name.localeCompare(b.m.name));
    return scored.slice(0, 8).map((x) => x.m);
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

  // 揭露答案后结算战绩（只结算一次：以 finished 翻转为准）
  const settledRef = useRef(false);
  useEffect(() => {
    if (!session || !session.finished || settledRef.current) return;
    settledRef.current = true;
    if (today) settleStats(today.dayKey, won, session.guesses.length);
    // settleStats 与 won 只依赖 session/today；won 在 finished 后不会再变
  }, [session, today, won]);

  async function submit(model: GuessApiModel) {
    if (!today || !canGuess || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError(null);
    setQuery('');
    setOpen(false);
    const result = await checkGuess(model.id, isFinalAttempt);
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
    saveSession(today.dayKey, next);
  }

  // 手动看答案：final=false 的请求不会带答案，单独发一次 final 请求拿答案
  async function revealAnswer() {
    if (!today || !session) return;
    setError(null);
    // 用已猜过的任意模型再问一次（判定结果丢弃，只取答案）
    const last = session.guesses[session.guesses.length - 1];
    const result = await checkGuess(last.guess.id, true);
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
    saveSession(today.dayKey, next);
  }

  async function share() {
    if (!today || !session) return;
    const text = buildShareText(session, today.dayNumber, won);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t('复制失败，长按选中手动复制吧。'));
    }
  }

  if (!today || !session) {
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
        <a href="#play" className="guess-back">
          <ArrowLeft size={15} />
          {t('玩法菜单')}
        </a>
      </div>
    );
  }

  return (
    <div
      className="guess-page"
      data-finished={finished}
      data-revealing={Boolean(freshGuess)}
    >
      <header className="guess-header">
        <a className="lobby-brand" href="#play" aria-label={t('回到玩法菜单')}>
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
      <main className="guess-main">
        <section className="guess-hero" aria-labelledby="guess-title">
          <div className="guess-hero-copy">
            <a className="guess-back" href="#play">
              <ArrowLeft size={14} />
              {t('玩法菜单')}
            </a>
            <div className="guess-edition">
              <span>{t('每日挑战')}</span>
              <b>#{String(today.dayNumber).padStart(3, '0')}</b>
              <span>
                {today.dayKey === 'preview-day'
                  ? '2026.09.14'
                  : today.dayKey.replaceAll('-', '.')}
              </span>
            </div>
            <h1 id="guess-title">
              {t('模一把')}
              <span aria-hidden="true">↗</span>
            </h1>
            <p className="guess-tagline">{t('把它的名字，猜出来。')}</p>
            <p className="guess-intro">
              {t('七条线索，八次机会。今天的 AI 模型，会是谁？')}
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
              <span>{today.models.length}</span>
              {t('个模型，唯一答案')}
            </div>
          </div>
        </section>

        <section className="guess-console" aria-label={t('每日猜模型')}>
          <div className="guess-console-top">
            <div className="guess-turn">
              <span>{t(finished ? '今日挑战已完成' : '剩余机会')}</span>
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
                <div className={`guess-input ${pending ? 'is-pending' : ''}`}>
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
                {open && !pending && (
                  <div className="guess-suggest">
                    <div className="guess-suggest-heading">
                      <span>
                        {t(query ? '匹配的模型' : '从一个熟悉的模型开始')}
                      </span>
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
                  {t(won ? '漂亮，锁定目标。' : '答案揭晓，明天再来。')}
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
              <button
                type="button"
                className="guess-primary guess-share"
                onClick={() => void share()}
              >
                {copied ? <Check size={17} /> : <Share2 size={17} />}
                {t(copied ? '已复制 ✓' : '分享战绩')}
              </button>
              {!won && !revealed && (
                <button
                  className="guess-reveal"
                  onClick={() => void revealAnswer()}
                >
                  {t('直接看答案')}
                </button>
              )}
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

        <section className="guess-footer" aria-label={t('本地战绩')}>
          <div className="guess-stats-intro">
            <Fingerprint size={21} />
            <span>
              {t('你的战绩')}
              <small>{t('保存在这台设备')}</small>
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
        <details className="guess-rules">
          <summary>
            {t('怎么玩')}
            <ChevronDown size={14} />
          </summary>
          <div>
            <p>
              {t(
                '每天全世界同一道题（东八区零点更新）。反馈规则：厂商/权重/推理猜对为绿；发布时间、上下文、价格接近为黄并给箭头方向；「?」表示该属性未公开，不计对错。',
              )}
            </p>
            <p>
              {t('价格按官方 API 输出单价分档；箭头指向答案更高或更低的方向。')}
            </p>
          </div>
        </details>
      </main>
    </div>
  );
}
