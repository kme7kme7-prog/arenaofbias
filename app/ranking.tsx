import { LanguageSwitch } from '@/components/language-switch';
import { useI18n } from '@/lib/locale';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { ArrowUpRight, RotateCcw } from 'lucide-react';
import { bandsNavigate } from '@/lib/game-transitions';
import { RollingLabel } from '@/components/rolling-label';
import { RollingNumber } from '@kitlangton/rolling-number/react';
import '@kitlangton/rolling-number/styles.css';
import {
  BOARD_CATEGORIES,
  computeRadarProfiles,
  leaderboardData,
  RADAR_BASE,
  RADAR_LABELS,
  scopedPromptIds,
} from '@/lib/leaderboard';
import type {
  BoardCategory,
  BoardRow,
  BoardScope,
  RadarProfiles,
  VoteRecord,
} from '@/lib/leaderboard';
import { isPlaceholderMode, readPlaceholderVotes } from '@/lib/placeholder';
import { fetchVotes, voteToRecord } from '@/lib/votes';
import { getPromptsState, subscribePrompts } from '@/lib/prompts';
import { getWorksState, subscribeWorks } from '@/lib/works';

const reduced = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 滚动数字的运动参数：460ms、低强度纵向运动模糊。
// 库自身不读系统减少动态设置，每个使用处需显式传 animated。
const ROLLING_MOTION = {
  duration: 460,
  motionBlur: true,
} as const;

// ---------------------------------------------------------------------------
// 投票装载：占位模式读 localStorage；真实模式拉 /api/votes。
// 返回 null 表示加载失败（与「无票」区分，空态给不同指引）
// ---------------------------------------------------------------------------

function loadVotes(scope: BoardScope): Promise<VoteRecord[] | null> {
  if (isPlaceholderMode()) {
    return Promise.resolve(scope === 'formal' ? [] : readPlaceholderVotes());
  }
  return fetchVotes(undefined, scope).then((votes) => (votes ? votes.map(voteToRecord) : null));
}

function useBoardVotes(replaySeed: number, scope: BoardScope): {
  votes: VoteRecord[] | null;
  failed: boolean;
  loading: boolean;
} {
  // 数据源就绪状态参与依赖：冷加载时 /api/votes 可能先于 /api/works、
  // /api/prompts 返回，榜单会按内置兜底名单聚合且此后不会重算——
  // 任一数据源翻转（loading→ready）就重拉一次票并触发重算
  const worksState = useSyncExternalStore(subscribeWorks, getWorksState);
  const promptsState = useSyncExternalStore(subscribePrompts, getPromptsState);
  const [state, setState] = useState<{
    scope: BoardScope;
    votes: VoteRecord[] | null;
    failed: boolean;
  }>({ scope, votes: null, failed: false });
  useEffect(() => {
    let live = true;
    void loadVotes(scope).then((result) => {
      if (!live) return;
      setState({ scope, votes: result, failed: result === null });
    });
    return () => {
      live = false;
    };
  }, [replaySeed, scope, worksState, promptsState]);
  if (state.scope !== scope) return { votes: null, failed: false, loading: true };
  return {
    votes: state.votes,
    failed: state.failed,
    loading: state.votes === null && !state.failed,
  };
}

// ---------------------------------------------------------------------------
// 雷达图：外侧网格/标签静止，内侧图形与顶点在数值变化时平滑挪动
// ---------------------------------------------------------------------------

const CENTER_X = 220;
const CENTER_Y = 207;
// 起始角 -180°（平顶六边形）：视觉设计/空间营造/动态表现落在左上半，
// 文字表达/思辨推理/创意构思落在右下半（决策 091）
const coord = (i: number, r: number): [number, number] => {
  const angle = ((i * 60 - 180) * Math.PI) / 180;
  return [CENTER_X + Math.cos(angle) * r, CENTER_Y + Math.sin(angle) * r];
};
const toPoints = (values: number[]) =>
  values.map((v, i) => coord(i, v * 1.32).join(',')).join(' ');

function Radar({
  values,
  average,
  labels,
}: {
  values: number[];
  average: number[];
  labels: string[];
}) {
  const { t, localize } = useI18n();
  const [display, setDisplay] = useState(values);
  const previous = useRef(values);
  useEffect(() => {
    const from = [...previous.current];
    if (reduced() || from.every((v, i) => v === values[i])) {
      previous.current = values;
      setDisplay(values);
      return;
    }
    let frame = 0;
    const start = performance.now() + 120;
    const tick = (now: number) => {
      const t = Math.max(0, Math.min(1, (now - start) / 620));
      const ease = t * t * (3 - 2 * t);
      const next = from.map((v, i) => v + (values[i] - v) * ease);
      previous.current = next;
      setDisplay(next);
      if (t < 1) frame = requestAnimationFrame(tick);
      else previous.current = values;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [values]);

  const points = toPoints(display);
  const vertices = display.map((v, i) => coord(i, v * 1.32));
  return (
    <svg
      className="rank-radar"
      viewBox="0 0 440 410"
      aria-label={t('六维评分：{labels}', {
        labels: labels
          .map((label, i) => `${t(label)} ${Math.round(display[i])}`)
          .join(', '),
      })}
    >
      <circle
        className="rank-radar-outer"
        cx={CENTER_X}
        cy={CENTER_Y}
        r="147"
      />
      {[20, 40, 60, 80, 100].map((v) => (
        <polygon
          key={v}
          className="rank-radar-grid"
          points={toPoints(Array(6).fill(v))}
        />
      ))}
      {labels.map((label, i) => (
        <line
          key={label}
          className="rank-radar-grid"
          x1={CENTER_X}
          y1={CENTER_Y}
          x2={coord(i, 132)[0]}
          y2={coord(i, 132)[1]}
        />
      ))}
      <polygon className="rank-radar-average" points={toPoints(average)} />
      <polygon className="rank-radar-shape" points={points} />
      {vertices.map(([x, y], i) => (
        <circle
          key={labels[i]}
          className="rank-radar-vertex"
          cx={x}
          cy={y}
          r="3"
        />
      ))}
      {labels.map((label, i) => (
        <text
          key={label}
          textAnchor="middle"
          x={coord(i, 169)[0]}
          y={coord(i, 169)[1] - 4}
        >
          {localize(label)}
        </text>
      ))}
      {labels.map((label, i) => (
        <text
          key={`${label}-value`}
          className="rank-radar-value"
          textAnchor="middle"
          x={coord(i, 169)[0]}
          y={coord(i, 169)[1] + 15}
        >
          {Math.round(display[i])}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// 右侧模型档案卡：切模型时色块横推过场，名字在抹片掩护下更换
// ---------------------------------------------------------------------------

function ProfilePanel({
  row,
  rank,
  category,
  totalTopics,
  wipeSeed,
  radar,
}: {
  row: BoardRow;
  rank: number;
  category: BoardCategory;
  totalTopics: number;
  wipeSeed: number;
  radar: RadarProfiles | null;
}) {
  const { t, localize } = useI18n();
  const [shown, setShown] = useState(row);
  const [shownRank, setShownRank] = useState(rank);
  const [shownCategory, setShownCategory] = useState(category);
  const wipeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (row === shown && category === shownCategory) return;
    if (!reduced()) {
      wipeRef.current?.animate(
        [
          { transform: 'translateX(-105%)' },
          { transform: 'translateX(0)', offset: 0.38 },
          { transform: 'translateX(105%)' },
        ],
        { duration: 560, easing: 'cubic-bezier(.65,0,.25,1)' },
      );
    }
    // 非减弱动效时，名字在抹片遮住面板的 240ms 处更换
    const timer = setTimeout(
      () => {
        setShown(row);
        setShownRank(rank);
        setShownCategory(category);
      },
      reduced() ? 0 : 240,
    );
    return () => clearTimeout(timer);
  }, [row, rank, category, shown, shownCategory, wipeSeed]);

  const radarValues = useMemo(
    () => radar?.profiles.get(shown.modelId) ?? Array(6).fill(RADAR_BASE),
    [radar, shown.modelId],
  );
  const average = radar?.average ?? Array(6).fill(RADAR_BASE);
  const labels = RADAR_LABELS[shownCategory];

  return (
    <div
      className="rank-panel"
      style={{ '--model-accent': shown.accent } as React.CSSProperties}
    >
      <div className="rank-panel-wipe" ref={wipeRef} aria-hidden="true" />
      <div className="rank-panel-header">
        <span>
          {t('模型画像 /')}
          {localize(
            BOARD_CATEGORIES.find((c) => c.id === shownCategory)?.label,
          )}
        </span>
        <span className="rank-panel-live">
          {localize(shown.trial ? 'PROVISIONAL' : 'IN FOCUS')}
        </span>
      </div>
      <div className="rank-panel-name">
        <div>
          <h2>
            <RollingLabel text={shown.name} reduced={reduced()} />
          </h2>
          <small>{localize(shown.sub)}</small>
        </div>
        <div className="rank-panel-rank">
          <span>{t('当前名次')}</span>
          <b>
            <RollingNumber
              value={shownRank}
              format={{ minimumIntegerDigits: 2, useGrouping: false }}
              animated={!reduced()}
              {...ROLLING_MOTION}
            />
          </b>
        </div>
      </div>
      <div className="rank-radar-wrap">
        <Radar values={radarValues} average={average} labels={labels} />
      </div>
      <div className="rank-radar-legend">
        <span>
          <i />
          {t('当前模型')}
        </span>
        <span>
          <i className="muted" />
          {t('阵容平均')}
        </span>
      </div>
      <div className="rank-panel-foot">
        <div>
          {/* 偏好评分同属计分，不做滚动过渡 */}
          <b>{shown.rating}</b>
          <span>{t('偏好评分')}</span>
        </div>
        <div>
          <b>
            <RollingNumber
              value={shown.games}
              animated={!reduced()}
              {...ROLLING_MOTION}
            />
          </b>
          <span>{t('参与比较')}</span>
        </div>
        <div>
          <b>
            {shown.topics}
            <small> / {totalTopics}</small>
          </b>
          <span>{t('题目覆盖')}</span>
        </div>
      </div>
      <p className="rank-panel-note">
        {shown.wins} {t('胜 /')}
        {shown.losses} {t('负')}
        {localize(shown.draws > 0 ? ` / ${shown.draws} 平` : '')} {t('· 胜率')}
        {localize(' ')}
        {Math.round(shown.winrate * 100)}%。{localize(shown.note)}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面本体
// ---------------------------------------------------------------------------

export default function Ranking({ initialScope = 'entertainment' }: { initialScope?: BoardScope }) {
  const { t, localize } = useI18n();
  const [category, setCategory] = useState<BoardCategory>('all');
  const [replaySeed, setReplaySeed] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 正式与娱乐分榜，切换时重新读取对应流水，不混算分数和画像。
  const [scope, setScope] = useState<BoardScope>(initialScope);
  const placeholder = isPlaceholderMode();
  // 开发者面板生成/清空占位投票后立即重读并重播入场（storage 事件同页不触发）
  useEffect(() => {
    const refresh = () => setReplaySeed((seed) => seed + 1);
    window.addEventListener('aob:placeholder-votes-changed', refresh);
    return () =>
      window.removeEventListener('aob:placeholder-votes-changed', refresh);
  }, []);
  const { votes, failed, loading } = useBoardVotes(replaySeed, scope);
  const data = useMemo(
    () => (votes ? leaderboardData(category, votes, scope) : null),
    [category, scope, votes],
  );
  const allData = useMemo(
    () => (votes ? leaderboardData('all', votes, scope) : null),
    [scope, votes],
  );
  const radar = useMemo(
    () => (votes ? computeRadarProfiles(category, votes, scope) : null),
    [category, scope, votes],
  );
  // 「题目覆盖 X/N」的分母随口径走（2026-09-20 审查修复）：formal 口径下用
  // 题库总数会让分母恒含没打过正式赛的题；该口径无票时回落题库总数
  const scopedTopicTotal = useMemo(
    () => (votes ? scopedPromptIds(category, votes, scope).size : 0),
    [category, scope, votes],
  );
  const selected =
    data?.rows.find((row) => row.modelId === selectedId) ??
    data?.rows[0] ??
    null;
  const selectedRank = selected
    ? (data?.rows.findIndex((row) => row.modelId === selected.modelId) ?? -1) +
      1
    : 0;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeTabIndex = BOARD_CATEGORIES.findIndex((c) => c.id === category);
  const [indicator, setIndicator] = useState({ left: 4, width: 0 });
  useEffect(() => {
    const tab = tabRefs.current[activeTabIndex];
    if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
  }, [activeTabIndex]);

  // 入场动画只在榜单挂载/重播时播放（2026-09-19 应要求去掉赛道切换的换位过渡，
  // 切换后行与计分直接落位）。走 WAAPI 而非常驻 CSS 动画：行的入场延迟跟名次
  // 挂钩，若用 CSS 动画 + 内联 animation-delay，名次的延迟值变化会触发整段重播。
  const boardRef = useRef<HTMLDivElement>(null);
  const rowMotions = useRef<Animation[]>([]);
  const entranceSeed = useRef(-1);

  // 入场/重播：榜单首次出现或 replaySeed 变化（整板重挂载）后播放一次。
  // 无依赖数组，每次提交都检查——榜单可能在 votes 异步到达后才挂载。
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board || entranceSeed.current === replaySeed) return;
    entranceSeed.current = replaySeed;
    if (reduced()) return;
    rowMotions.current.forEach((motion) => motion.cancel());
    rowMotions.current = [];
    [...board.querySelectorAll<HTMLElement>('.rank-row')].forEach((el, i) => {
      rowMotions.current.push(
        el.animate(
          [
            { opacity: 0, transform: 'translateX(-35px)' },
            { opacity: 1, transform: 'translateX(0)' },
          ],
          {
            duration: 950,
            delay: i * 90,
            easing: 'cubic-bezier(.22,1,.36,1)',
            fill: 'backwards',
          },
        ),
      );
      const score = el.querySelector('.rank-score');
      if (score)
        rowMotions.current.push(
          score.animate(
            [
              { opacity: 0.25, transform: 'translateY(5px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 500, delay: i * 65 + 180, fill: 'backwards' },
          ),
        );
    });
  });

  return (
    <div className="rank-page">
      <header className="rank-header">
        <a
          className="lobby-brand"
          href="#home"
          aria-label={t('回到首页')}
          onClick={(e) => {
            e.preventDefault();
            bandsNavigate('#home');
          }}
        >
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('偏好榜 / PREFERENCE INDEX')}</small>
          </span>
        </a>
        <LanguageSwitch />
        <span className="rank-header-note">
          <i /> {t('由每一次选择组成')}
        </span>
        <span className="demo-label">
          {placeholder ? (
            <>
              {t('PLACEHOLDER')}
              <b>{t('DATA')}</b>
            </>
          ) : (
            <>
              {t('DEMO')}
              <b>{t('DATA')}</b>
            </>
          )}
        </span>
      </header>
      <main className="rank-main">
        <section className="rank-hero">
          <div>
            <div className="rank-eyebrow">
              {t('THE PUBLIC PREFERENCE INDEX / 01')}
            </div>
            <h1>
              {t('偏好，有迹可循')}
              <span>{t('。')}</span>
            </h1>
            <p>{t('没有标准答案。但每一次选择，都让偏好更清晰。')}</p>
          </div>
          <div className="rank-hero-note">
            <small>
              {localize(
                (allData?.totalVotes ?? 0) > 0 ? '参与比较' : '有效比较',
              )}
            </small>
            <strong>
              {localize(
                (allData?.totalVotes ?? 0) > 0 ? (
                  <RollingNumber
                    value={allData!.totalVotes}
                    animated={!reduced()}
                    {...ROLLING_MOTION}
                  />
                ) : (
                  '—'
                ),
              )}
              {(allData?.totalVotes ?? 0) > 0 && (
                <span className="rank-note-arrow"> ↗</span>
              )}
            </strong>
            <p>
              {localize(
                (allData?.totalVotes ?? 0) > 0
                  ? `${allData!.modelCount} 个模型 · ${allData!.promptCount} 道题目`
                  : '尚未形成排名',
              )}
            </p>
          </div>
        </section>
        <div className="rank-controls">
          <div className="rank-tabs" role="tablist" aria-label={t('榜单类别')}>
            <div
              className="rank-tab-light"
              style={{
                width: indicator.width,
                transform: `translateX(${indicator.left - 4}px)`,
              }}
            />
            {BOARD_CATEGORIES.map((item, index) => (
              <button
                key={item.id}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                className="rank-tab"
                role="tab"
                aria-selected={category === item.id}
                onClick={() => setCategory(item.id)}
              >
                <span className="rank-tab-idx" aria-hidden="true">
                  0{index + 1}
                </span>
                {localize(item.label)}
              </button>
            ))}
          </div>
          <div className="rank-actions">
            {!placeholder && (
              <button
                className={`rank-scope${scope === 'formal' ? ' active' : ''}`}
                aria-pressed={scope === 'formal'}
                onClick={() =>
                  setScope((value) => (value === 'entertainment' ? 'formal' : 'entertainment'))
                }
                title={t('正式与娱乐数据独立，点击切换榜单')}
              >
                <i aria-hidden="true" /> {t(scope === 'formal' ? '正式测评榜' : '娱乐测评榜')}
              </button>
            )}
            <button
              className="rank-replay"
              onClick={() => setReplaySeed((seed) => seed + 1)}
            >
              <RotateCcw size={13} /> {t('重播入场')}
            </button>
          </div>
        </div>

        {loading ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">{t('LOADING THE VOTES')}</div>
              <h2>
                {t('正在取回')}
                <br />
                {t('每一次选择。')}
              </h2>
              <p>{t('偏好榜由全部投票实时聚合，数据马上就到。')}</p>
            </div>
          </section>
        ) : failed ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">{t('SIGNAL LOST')}</div>
              <h2>
                {t('投票数据')}
                <br />
                {t('暂时取不回来。')}
              </h2>
              <p>{t('网络或服务暂时不可用。稍后重试，或重新加载页面。')}</p>
              <button
                className="rank-empty-action"
                onClick={() => setReplaySeed((seed) => seed + 1)}
              >
                {t('重新拉取')}
                <ArrowUpRight size={17} />
              </button>
            </div>
          </section>
        ) : (allData?.totalVotes ?? 0) === 0 ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">
                {t('AWAITING YOUR FIRST CHOICE')}
              </div>
              <h2>
                {t('第一份排名，')}
                <br />
                {t('从一次选择开始。')}
              </h2>
              <p>
                {t(
                  '这里还没有足够的有效投票。看一组作品，选出你更喜欢的一边，让偏好逐渐有迹可循。',
                )}
              </p>
              <a className="rank-empty-action" href="#random">
                {t('去看一组作品')}
                <ArrowUpRight size={17} />
              </a>
              <small className="rank-empty-hint">
                {localize(
                  placeholder
                    ? '占位符模式已开启：到竞技场亲手投一票，或到开发者面板生成占位投票。'
                    : '投票需要登录；到各竞技场看一组作品，选出你更喜欢的一边。',
                )}
              </small>
            </div>
            <div className="rank-empty-art" aria-hidden="true">
              <div className="rank-ticket">{t('A')}</div>
              <div className="rank-ticket front">{t('B')}</div>
              <div className="rank-sticker">{t('YOUR CHOICE MATTERS')}</div>
            </div>
          </section>
        ) : data!.rows.length === 0 ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">
                {t('MORE PERSPECTIVES NEEDED')}
              </div>
              <h2>
                {localize(
                  BOARD_CATEGORIES.find((c) => c.id === category)?.label,
                )}
                {t('榜， 还差一些判断。')}
              </h2>
              <p>
                {t('这个分类的比较数据还不足以形成榜单。你可以先看综合榜。')}
              </p>
              <button
                className="rank-empty-action"
                onClick={() => setCategory('all')}
              >
                {t('查看综合榜')}
                <ArrowUpRight size={17} />
              </button>
              <small className="rank-empty-hint">
                {t('数据不足时不显示排名与雷达，避免把缺失数据画成零分。')}
              </small>
            </div>
          </section>
        ) : (
          <div className="rank-workspace">
            <section>
              <div className="term-ticks rank-board-ticks" aria-hidden="true" />
              <div className="rank-columns">
                <span>{t('名次')}</span>
                <span>{t('模型 / MODEL')}</span>
                <span className="numeric">{t('偏好评分')}</span>
                <span className="numeric samples">{t('比较次数')}</span>
                <span />
              </div>
              <div
                className="rank-board"
                key={replaySeed}
                ref={boardRef}
                aria-label={t('模型偏好榜')}
              >
                {data!.rows.map((row, index) => (
                  <article
                    key={row.modelId}
                    className={`rank-row${index === 0 ? ' first' : ''}${selected?.modelId === row.modelId ? ' selected' : ''}`}
                  >
                    <span className="rank-row-flash" aria-hidden="true" />
                    <button
                      className="rank-row-top"
                      onClick={() => setSelectedId(row.modelId)}
                    >
                      <span className="rank-num">
                        <RollingNumber
                          value={index + 1}
                          format={{
                            minimumIntegerDigits: 2,
                            useGrouping: false,
                          }}
                          animated={!reduced()}
                          {...ROLLING_MOTION}
                        />
                      </span>
                      <span className="rank-identity">
                        <span
                          className="rank-sigil"
                          style={{ color: row.accent }}
                          aria-hidden="true"
                        >
                          {localize(row.sigil)}
                        </span>
                        <span>
                          <span className="rank-name">
                            {row.name}
                            {row.trial && (
                              <span className="rank-trial">{t('暂定')}</span>
                            )}
                          </span>
                          <span className="rank-sub">{localize(row.sub)}</span>
                        </span>
                      </span>
                      {/* 计分不做切换过渡（2026-09-19 应要求）：直接显示数值 */}
                      <span className="rank-score">{row.rating}</span>
                      <RollingNumber
                        className="rank-count"
                        value={row.games}
                        animated={!reduced()}
                        {...ROLLING_MOTION}
                      />
                      <span className="rank-plus">↗</span>
                    </button>
                  </article>
                ))}
              </div>
              <div className="rank-board-foot">
                <span className="rank-status">
                  {localize(
                    BOARD_CATEGORIES.find((c) => c.id === category)?.label,
                  )}
                  {t('偏好 · 选择模型查看六维档案')}
                </span>
                <span>
                  {localize(
                    placeholder
                      ? '占位数据 · 评分与名次为演示口径'
                      : '评分与名次为演示口径 · 六维画像按真实投票重放',
                  )}
                </span>
              </div>
            </section>
            {selected && (
              <aside>
                <div className="rank-panel-shell" key={replaySeed}>
                  <ProfilePanel
                    row={selected}
                    rank={selectedRank}
                    category={category}
                    totalTopics={scopedTopicTotal || data!.promptCount}
                    wipeSeed={replaySeed}
                    radar={radar}
                  />
                </div>
                <div className="rank-panel-caption">
                  {t(
                    '六维画像按真实投票重放得出：每道题带一组维度权重，一票的分量按权重落到各维度。',
                  )}
                  <br />
                  {t('虚线表示阵容平均值；切换赛道可查看对应赛道的画像。')}
                </div>
              </aside>
            )}
          </div>
        )}
      </main>
      <footer className="rank-footer">
        <span>{t('ARENA OF BIAS / SUBJECTIVITY IS THE POINT.')}</span>
        <span>
          {localize(placeholder ? 'PLACEHOLDER VOTES ONLY' : 'DEMO BUILD 0.1')}
        </span>
      </footer>
    </div>
  );
}
