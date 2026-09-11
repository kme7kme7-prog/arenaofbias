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
  leaderboardData,
  RADAR_LABELS,
  radarAverage,
  radarProfile,
} from '@/lib/leaderboard';
import type {
  BoardCategory,
  BoardRow,
  BoardScope,
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

function loadVotes(): Promise<VoteRecord[] | null> {
  if (isPlaceholderMode()) {
    return Promise.resolve(readPlaceholderVotes());
  }
  return fetchVotes().then((votes) =>
    votes ? votes.map(voteToRecord) : null,
  );
}

function useBoardVotes(replaySeed: number): {
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
    votes: VoteRecord[] | null;
    failed: boolean;
  }>({ votes: null, failed: false });
  useEffect(() => {
    let live = true;
    void loadVotes().then((result) => {
      if (!live) return;
      setState({ votes: result, failed: result === null });
    });
    return () => {
      live = false;
    };
  }, [replaySeed, worksState, promptsState]);
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
const coord = (i: number, r: number): [number, number] => {
  const angle = ((i * 60 - 90) * Math.PI) / 180;
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
      aria-label={`六项模拟指标：${labels.map((label, i) => `${label}${Math.round(display[i])}`).join('，')}`}
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
          {label}
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
}: {
  row: BoardRow;
  rank: number;
  category: BoardCategory;
  totalTopics: number;
  wipeSeed: number;
}) {
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
    () => radarProfile(shown.modelId, shownCategory),
    [shown.modelId, shownCategory],
  );
  const average = useMemo(() => radarAverage(shownCategory), [shownCategory]);
  const labels = RADAR_LABELS[shownCategory];

  return (
    <div
      className="rank-panel"
      style={{ '--model-accent': shown.accent } as React.CSSProperties}
    >
      <div className="rank-panel-wipe" ref={wipeRef} aria-hidden="true" />
      <div className="rank-panel-header">
        <span>
          模型画像 / {BOARD_CATEGORIES.find((c) => c.id === shownCategory)?.label}
        </span>
        <span className="rank-panel-live">
          {shown.trial ? 'PROVISIONAL' : 'IN FOCUS'}
        </span>
      </div>
      <div className="rank-panel-name">
        <div>
          <h2><RollingLabel text={shown.name} reduced={reduced()} /></h2>
          <small>{shown.sub}</small>
        </div>
        <div className="rank-panel-rank">
          <span>当前名次</span>
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
          当前模型
        </span>
        <span>
          <i className="muted" />
          阵容平均
        </span>
      </div>
      <div className="rank-panel-foot">
        <div>
          <b>
            <RollingNumber
              value={shown.rating}
              format={{ useGrouping: false }}
              animated={!reduced()}
              {...ROLLING_MOTION}
            />
          </b>
          <span>偏好评分</span>
        </div>
        <div>
          <b>
            <RollingNumber
              value={shown.games}
              animated={!reduced()}
              {...ROLLING_MOTION}
            />
          </b>
          <span>参与比较</span>
        </div>
        <div>
          <b>
            {shown.topics}
            <small> / {totalTopics}</small>
          </b>
          <span>题目覆盖</span>
        </div>
      </div>
      <p className="rank-panel-note">
        {shown.wins} 胜 / {shown.losses} 负 · 胜率 {Math.round(shown.winrate * 100)}%。
        {shown.note}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面本体
// ---------------------------------------------------------------------------

export default function Ranking() {
  const [category, setCategory] = useState<BoardCategory>('all');
  const [replaySeed, setReplaySeed] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 榜单口径（决策 026）：混榜 / 只看正式。占位投票无模式之分，开关只对真实数据出现
  const [scope, setScope] = useState<BoardScope>('mixed');
  const placeholder = isPlaceholderMode();
  // 开发者面板生成/清空占位投票后立即重读并重播入场（storage 事件同页不触发）
  useEffect(() => {
    const refresh = () => setReplaySeed((seed) => seed + 1);
    window.addEventListener('aob:placeholder-votes-changed', refresh);
    return () => window.removeEventListener('aob:placeholder-votes-changed', refresh);
  }, []);
  const { votes, failed, loading } = useBoardVotes(replaySeed);
  const data = useMemo(
    () => (votes ? leaderboardData(category, votes, scope) : null),
    [category, scope, votes],
  );
  const allData = useMemo(
    () => (votes ? leaderboardData('all', votes, scope) : null),
    [scope, votes],
  );
  const selected =
    data?.rows.find((row) => row.modelId === selectedId) ?? data?.rows[0] ?? null;
  const selectedRank = selected
    ? (data?.rows.findIndex((row) => row.modelId === selected.modelId) ?? -1) + 1
    : 0;
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeTabIndex = BOARD_CATEGORIES.findIndex((c) => c.id === category);
  const [indicator, setIndicator] = useState({ left: 4, width: 0 });
  useEffect(() => {
    const tab = tabRefs.current[activeTabIndex];
    if (tab) setIndicator({ left: tab.offsetLeft, width: tab.offsetWidth });
  }, [activeTabIndex]);

  // 赛道切换的换位动画与原型 setMode 一致：榜单行不按赛道重挂载，
  // 而是取消进行中的动画后，从上一赛道的旧位置滑向新位置（FLIP），
  // 并附带计分淡入与首行扫光；重播入场仍靠 key={replaySeed} 重挂载。
  //
  // 入场与换位都走 WAAPI 而不是常驻 CSS 动画：行的入场延迟跟名次挂钩，
  // 若用 CSS 动画 + 内联 animation-delay，换赛道时名次的延迟值变化会触发
  // 动画整段重播（行消失后从左侧重新插入）——这正是与原型不一致的根因。
  const boardRef = useRef<HTMLDivElement>(null);
  const rowTops = useRef<Map<string, number> | null>(null);
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
  useLayoutEffect(() => {
    const board = boardRef.current;
    const previous = rowTops.current;
    if (!board || !previous || reduced()) return;
    rowMotions.current.forEach((motion) => motion.cancel());
    rowMotions.current = [];
    [...board.querySelectorAll<HTMLElement>('.rank-row')].forEach((el, i) => {
      const old = previous.get(el.dataset.mid ?? '');
      // offsetTop 是布局值，不受进行中的变换动画污染
      const delta = old === undefined ? 0 : old - el.offsetTop;
      if (delta !== 0) {
        rowMotions.current.push(
          el.animate(
            [
              { transform: `translateY(${delta}px)` },
              { transform: 'translateY(0)' },
            ],
            {
              duration: 1200,
              delay: i * 28,
              easing: 'cubic-bezier(.22,1,.36,1)',
              fill: 'backwards',
            },
          ),
        );
      } else if (old === undefined) {
        // 该赛道新进入榜单的行没有旧位置，轻量淡入
        rowMotions.current.push(
          el.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 500,
            delay: i * 28,
            fill: 'backwards',
          }),
        );
      }
      const score = el.querySelector('.rank-score');
      if (score)
        rowMotions.current.push(
          score.animate(
            [
              { opacity: 0.25, transform: 'translateY(5px)' },
              { opacity: 1, transform: 'translateY(0)' },
            ],
            { duration: 500, delay: 250, fill: 'backwards' },
          ),
        );
      if (i === 0) {
        const flash = el.querySelector('.rank-row-flash');
        if (flash)
          rowMotions.current.push(
            flash.animate(
              [
                { transform: 'translateX(-100%)' },
                { transform: 'translateX(110%)' },
              ],
              { duration: 1100, delay: 400, easing: 'ease-in-out' },
            ),
          );
      }
    });
  }, [category]);
  // 每次提交后记录各行布局位置，供下一次赛道切换计算位移。
  // 声明在 FLIP 之后：同一提交内 FLIP 先读到上一轮的值，再由这里覆盖。
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) {
      rowTops.current = null;
      return;
    }
    const map = new Map<string, number>();
    board.querySelectorAll<HTMLElement>('.rank-row').forEach((el) => {
      if (el.dataset.mid) map.set(el.dataset.mid, el.offsetTop);
    });
    rowTops.current = map;
  });

  return (
    <div className="rank-page">
      <header className="rank-header">
        <a
          className="lobby-brand"
          href="#home"
          aria-label="回到首页"
          onClick={(e) => {
            e.preventDefault();
            bandsNavigate('#home');
          }}
        >
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            ARENA OF <b className="brand-tag">BIAS</b>
            <small>偏好榜 / PREFERENCE INDEX</small>
          </span>
        </a>
        <span className="rank-header-note">
          <i /> 由每一次选择组成
        </span>
        <span className="demo-label">
          {placeholder ? (
            <>
              PLACEHOLDER <b>DATA</b>
            </>
          ) : (
            <>
              DEMO <b>DATA</b>
            </>
          )}
        </span>
      </header>
      <main className="rank-main">
        <section className="rank-hero">
          <div>
            <div className="rank-eyebrow">THE PUBLIC PREFERENCE INDEX / 01</div>
            <h1>
              偏好，有迹可循<span>。</span>
            </h1>
            <p>没有标准答案。但每一次选择，都让偏好更清晰。</p>
          </div>
          <div className="rank-hero-note">
            <small>{(allData?.totalVotes ?? 0) > 0 ? '参与比较' : '有效比较'}</small>
            <strong>
              {(allData?.totalVotes ?? 0) > 0 ? (
                <RollingNumber
                  value={allData!.totalVotes}
                  animated={!reduced()}
                  {...ROLLING_MOTION}
                />
              ) : (
                '—'
              )}
              {(allData?.totalVotes ?? 0) > 0 && (
                <span className="rank-note-arrow"> ↗</span>
              )}
            </strong>
            <p>
              {(allData?.totalVotes ?? 0) > 0
                ? `${allData!.modelCount} 个模型 · ${allData!.promptCount} 道题目`
                : '尚未形成排名'}
            </p>
          </div>
        </section>
        <div className="rank-controls">
          <div className="rank-tabs" role="tablist" aria-label="榜单类别">
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
                {item.label}
              </button>
            ))}
          </div>
          <div className="rank-actions">
            {!placeholder && (
              <button
                className={`rank-scope${scope === 'formal' ? ' active' : ''}`}
                aria-pressed={scope === 'formal'}
                onClick={() =>
                  setScope((value) => (value === 'mixed' ? 'formal' : 'mixed'))
                }
                title="正式与娱乐混榜，或只看正式测评的票（决策 026）"
              >
                <i aria-hidden="true" /> 只看正式
              </button>
            )}
            <button
              className="rank-replay"
              onClick={() => setReplaySeed((seed) => seed + 1)}
            >
              <RotateCcw size={13} /> 重播入场
            </button>
          </div>
        </div>

        {loading ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">LOADING THE VOTES</div>
              <h2>
                正在取回
                <br />
                每一次选择。
              </h2>
              <p>偏好榜由全部投票实时聚合，数据马上就到。</p>
            </div>
          </section>
        ) : failed ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">SIGNAL LOST</div>
              <h2>
                投票数据
                <br />
                暂时取不回来。
              </h2>
              <p>网络或服务暂时不可用。稍后重试，或重新加载页面。</p>
              <button
                className="rank-empty-action"
                onClick={() => setReplaySeed((seed) => seed + 1)}
              >
                重新拉取 <ArrowUpRight size={17} />
              </button>
            </div>
          </section>
        ) : (allData?.totalVotes ?? 0) === 0 ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">AWAITING YOUR FIRST CHOICE</div>
              <h2>
                第一份排名，
                <br />
                从一次选择开始。
              </h2>
              <p>
                这里还没有足够的有效投票。看一组作品，选出你更喜欢的一边，让偏好逐渐有迹可循。
              </p>
              <a className="rank-empty-action" href="#random">
                去看一组作品 <ArrowUpRight size={17} />
              </a>
              <small className="rank-empty-hint">
                {placeholder
                  ? '占位符模式已开启：到竞技场亲手投一票，或到开发者面板生成占位投票。'
                  : '投票需要登录；到各竞技场看一组作品，选出你更喜欢的一边。'}
              </small>
            </div>
            <div className="rank-empty-art" aria-hidden="true">
              <div className="rank-ticket">A</div>
              <div className="rank-ticket front">B</div>
              <div className="rank-sticker">YOUR CHOICE MATTERS</div>
            </div>
          </section>
        ) : data!.rows.length === 0 ? (
          <section className="rank-empty" aria-live="polite">
            <div>
              <div className="rank-empty-code">MORE PERSPECTIVES NEEDED</div>
              <h2>
                {BOARD_CATEGORIES.find((c) => c.id === category)?.label}榜，
                还差一些判断。
              </h2>
              <p>这个分类的比较数据还不足以形成榜单。你可以先看综合榜。</p>
              <button
                className="rank-empty-action"
                onClick={() => setCategory('all')}
              >
                查看综合榜 <ArrowUpRight size={17} />
              </button>
              <small className="rank-empty-hint">
                数据不足时不显示排名与雷达，避免把缺失数据画成零分。
              </small>
            </div>
          </section>
        ) : (
          <div className="rank-workspace">
            <section>
              <div className="term-ticks rank-board-ticks" aria-hidden="true" />
              <div className="rank-columns">
                <span>名次</span>
                <span>模型 / MODEL</span>
                <span className="numeric">偏好评分</span>
                <span className="numeric samples">比较次数</span>
                <span />
              </div>
              <div
                className="rank-board"
                key={replaySeed}
                ref={boardRef}
                aria-label="模型偏好榜"
              >
                {data!.rows.map((row, index) => (
                  <article
                    key={row.modelId}
                    data-mid={row.modelId}
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
                          format={{ minimumIntegerDigits: 2, useGrouping: false }}
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
                          {row.sigil}
                        </span>
                        <span>
                          <span className="rank-name">
                            {row.name}
                            {row.trial && (
                              <span className="rank-trial">暂定</span>
                            )}
                          </span>
                          <span className="rank-sub">{row.sub}</span>
                        </span>
                      </span>
                      <RollingNumber
                        className="rank-score"
                        value={row.rating}
                        format={{ useGrouping: false }}
                        animated={!reduced()}
                        {...ROLLING_MOTION}
                      />
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
                  {BOARD_CATEGORIES.find((c) => c.id === category)?.label}偏好 ·
                  选择模型查看六维档案
                </span>
                <span>
                  {placeholder
                    ? '占位数据 · 评分与排名均为演示'
                    : '评分与排名均为演示'}
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
                    totalTopics={data!.promptCount}
                    wipeSeed={replaySeed}
                  />
                </div>
                <div className="rank-panel-caption">
                  指标结构演示 · 六个维度均为模拟数据，尚未建立实际测量规则。
                  <br />
                  虚线表示阵容平均值；切换赛道可查看不同的指标组合。
                </div>
              </aside>
            )}
          </div>
        )}
      </main>
      <footer className="rank-footer">
        <span>ARENA OF BIAS / SUBJECTIVITY IS THE POINT.</span>
        <span>
          {placeholder ? 'PLACEHOLDER VOTES ONLY' : 'DEMO BUILD 0.1'}
        </span>
      </footer>
    </div>
  );
}
