/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The custom model combobox exposes its keyboard listbox. */
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type SubmitEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Link2,
  LoaderCircle,
  Search,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useAccount, AccountButton } from '@/components/account';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitch } from '@/components/language-switch';
import { useI18n } from '@/lib/locale';
import { apiUrl } from '@/lib/api';
import {
  ATTRIBUTE_KEYS,
  DIFFICULTY_INFO,
  PRICE_TIERS,
  searchGuessModels,
  type AttributeKey,
  type GuessDifficulty,
} from '@/lib/guess-logic';
import type { GuessApiModel } from '@/lib/guess';
import {
  friendRequest,
  FriendRequestError,
  type FriendGuess,
  type FriendRoom,
} from '@/lib/guess-friends';
import './guess-friends.css';

const LABELS: Record<AttributeKey, string> = {
  vendor: '厂商',
  released: '发布',
  openWeights: '权重',
  contextK: '上下文',
  modalities: '模态',
  reasoning: '推理',
  priceTier: '价格',
};
function value(model: GuessApiModel | undefined, key: AttributeKey) {
  if (!model) return '—';
  switch (key) {
    case 'vendor':
      return model.vendor;
    case 'released':
      return model.released;
    case 'openWeights':
      return model.openWeights ? '开放' : '闭源';
    case 'contextK':
      return model.contextK === null ? '?' : `${model.contextK}K`;
    case 'modalities':
      return model.modalities.length === 1
        ? '纯文本'
        : model.modalities
            .filter((m) => m !== 'text')
            .map((m) => ({ image: '图', audio: '音', video: '视' })[m] || m)
            .join('+');
    case 'reasoning':
      return model.reasoning ? '推理' : '直答';
    case 'priceTier':
      return model.priceTier === null ? '?' : PRICE_TIERS[model.priceTier].zh;
  }
}
function Clues({ guess }: { guess: FriendGuess }) {
  const { t } = useI18n();
  return (
    <>
      {ATTRIBUTE_KEYS.map((key, index) => {
        const clue = guess.attributes[key];
        return (
          <td key={key}>
            <div
              className={`gf-cell ${clue.state}`}
              style={{ '--gf-order': index } as CSSProperties}
            >
              <span>{t(value(guess.model, key))}</span>
              <small
                aria-label={t(
                  clue.arrow === 'up'
                    ? '答案更大或更新'
                    : clue.arrow === 'down'
                      ? '答案更小或更早'
                      : clue.state === 'hit'
                        ? '吻合'
                        : '不符',
                )}
              >
                {clue.arrow === 'up'
                  ? '↑'
                  : clue.arrow === 'down'
                    ? '↓'
                    : clue.state === 'hit'
                      ? '✓'
                      : clue.state === 'unknown'
                        ? '?'
                        : '—'}
              </small>
            </div>
          </td>
        );
      })}
    </>
  );
}

export default function GuessFriendsPage() {
  const { user, loading, open } = useAccount();
  const { t } = useI18n();
  return (
    <div className="guess-page gf-page">
      <header className="guess-header">
        <a className="lobby-brand" href="#guess" title={t('返回单人模式')}>
          <span className="gf-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 40 40" fill="none">
              <path d="M14 5H35L32 12H11L14 5Z" />
              <path d="M8 16H29L26 23H5L8 16Z" />
              <path d="M12 27H33L30 34H9L12 27Z" />
            </svg>
          </span>
          <span>
            ARENA OF <b className="brand-tag">BIAS</b>
            <small>{t('模一把 · 好友房')}</small>
          </span>
        </a>
        <div className="guess-header-actions">
          <LanguageSwitch />
          <ThemeToggle />
          <AccountButton />
        </div>
      </header>
      {user ? (
        <FriendGame key={user.id} />
      ) : (
        <main className="gf-main gf-signin gf-curtain">
          <Users size={40} />
          <p className="gf-eyebrow">GUESS TOGETHER</p>
          <h1>{t('双人好友房')}</h1>
          <p>
            {t(
              loading
                ? '正在确认登录状态…'
                : '登录后创建房间，或输入好友的房间码。',
            )}
          </p>
          <button className="gf-primary" onClick={open} disabled={loading}>
            {t('登录 / 注册')}
            <ArrowUpRight size={18} />
          </button>
          <a href="#guess">{t('返回单人模式')}</a>
        </main>
      )}
    </div>
  );
}

function FriendGame() {
  const { t } = useI18n();
  const { refresh } = useAccount();
  const [room, setRoom] = useState<FriendRoom | null>(null);
  const [models, setModels] = useState<GuessApiModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [difficulty, setDifficulty] = useState<GuessDifficulty>(2);
  const [connection, setConnection] = useState<
    'live' | 'recovering' | 'polling'
  >('recovering');
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState(0);
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const offset = useRef(0);
  const alive = useRef(true);
  const pending = useRef(false);
  const epoch = useRef(0);
  const lastRequest = useRef({ model: '', round: 0, code: '', id: '' });
  const applied = useRef<FriendRoom | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const apply = useCallback((next: FriendRoom) => {
    if (!alive.current) return;
    const previous = applied.current;
    if (previous?.code === next.code && previous.version > next.version) return;
    if (previous?.code !== next.code) {
      if (previous) epoch.current++;
      setConnection('recovering');
      setCopied(false);
    }
    if (previous?.code !== next.code || previous.round !== next.round) {
      setQuery('');
      setSelected(0);
      setFocused(false);
      setError('');
    }
    applied.current = next;
    offset.current = next.serverNow - Date.now();
    setNow(next.serverNow);
    setRoom((previous) =>
      previous?.code === next.code && previous.version > next.version
        ? previous
        : next,
    );
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const generation = epoch.current;
    void Promise.all([
      friendRequest<{ room: FriendRoom | null }>(
        'current',
        undefined,
        controller.signal,
      ),
      friendRequest<{ models: GuessApiModel[] }>(
        'catalog',
        undefined,
        controller.signal,
      ),
    ])
      .then(([state, catalog]) => {
        if (controller.signal.aborted || generation !== epoch.current) return;
        setModels(catalog.models);
        if (state.room) apply(state.room);
      })
      .catch((err) => {
        if (controller.signal.aborted || generation !== epoch.current) return;
        setLoadFailed(true);
        setError(err.message);
        if (err.status === 401) void refresh();
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [retry, apply, refresh]);
  const roomCode = room?.code;
  const catalogVersion = room?.catalogVersion;
  useEffect(() => {
    if (!catalogVersion) return;
    const controller = new AbortController();
    void friendRequest<{ models: GuessApiModel[] }>('catalog', undefined, controller.signal)
      .then(catalog => { if (!controller.signal.aborted) setModels(catalog.models); })
      .catch(() => { if (!controller.signal.aborted) setError(t('题库暂时无法更新，请刷新重试。')); });
    return () => controller.abort();
  }, [catalogVersion, roomCode, t]);
  useEffect(() => {
    if (!roomCode) return;
    const controller = new AbortController();
    const generation = epoch.current;
    let lastMessage = 0;
    let lastContact = 0;
    let lastPoll = 0;
    let polling = false;
    const stream = new EventSource(
      apiUrl(`/api/guess/friends/${roomCode}/events`),
      { withCredentials: true },
    );
    stream.addEventListener('room', (event) => {
      if (controller.signal.aborted || generation !== epoch.current) return;
      try {
        const state = JSON.parse((event as MessageEvent).data) as FriendRoom;
        if (state.code !== roomCode) return;
        lastContact = lastMessage = Date.now();
        setConnection('live');
        apply(state);
      } catch {
        setConnection('recovering');
      }
    });
    // SSE reconnects itself. Bounded snapshots also recover through proxies that buffer streams.
    const recover = async () => {
      if (
        polling ||
        Date.now() - lastMessage < 10000 ||
        Date.now() - lastPoll < 3000 ||
        controller.signal.aborted
      )
        return;
      polling = true;
      lastPoll = Date.now();
      try {
        const state = await friendRequest<{ room: FriendRoom }>(
          `${roomCode}/state`,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted || generation !== epoch.current) return;
        lastContact = Date.now();
        apply(state.room);
        setConnection('polling');
      } catch (err) {
        if (controller.signal.aborted || generation !== epoch.current) return;
        if (Date.now() - lastContact >= 12000) setConnection('recovering');
        if (err instanceof FriendRequestError && err.status === 401) {
          stream.close();
          void refresh();
        }
        if (err instanceof FriendRequestError && err.status === 404) {
          epoch.current++;
          setRoom(null);
          setError(err.message);
        }
      } finally {
        polling = false;
      }
    };
    stream.onerror = () => {
      if (!controller.signal.aborted && generation === epoch.current) {
        if (Date.now() - lastContact >= 12000) setConnection('recovering');
        void recover();
      }
    };
    const timer = setInterval(() => {
      setNow(Date.now() + offset.current);
      if (Date.now() - lastContact >= 12000) setConnection('recovering');
      void recover();
    }, 1000);
    return () => {
      clearInterval(timer);
      controller.abort();
      stream.close();
    };
  }, [roomCode, apply, refresh]);

  async function command(
    path: string,
    body: object,
    leaving = false,
  ): Promise<boolean> {
    if (pending.current) return false;
    pending.current = true;
    setBusy(true);
    setError('');
    const generation = epoch.current;
    try {
      const data = await friendRequest<{ room?: FriendRoom }>(path, body);
      if (!alive.current || generation !== epoch.current) return false;
      if (leaving) {
        epoch.current++;
        applied.current = null;
        setRoom(null);
        setConfirmLeave(false);
      } else if (data.room) apply(data.room);
      return true;
    } catch (err) {
      if (alive.current && generation === epoch.current) {
        setError(
          err instanceof Error ? err.message : t('连接暂时失败，请重试。'),
        );
        if (err instanceof FriendRequestError && err.status === 401)
          void refresh();
        if (roomCode && !leaving)
          void friendRequest<{ room: FriendRoom }>(`${roomCode}/state`)
            .then((data) => {
              if (alive.current && generation === epoch.current)
                apply(data.room);
            })
            .catch(() => {});
      }
      return false;
    } finally {
      pending.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const me = room?.players[room.self];
  const opponent = room?.players[1 - room.self];
  const used = useMemo(
    () => new Set(me?.guesses.map((g) => g.model?.id)),
    [me?.guesses],
  );
  const candidates = useMemo(
    () =>
      searchGuessModels(
        models.filter((m) => !used.has(m.id)),
        query,
        6,
      ),
    [models, used, query],
  );
  const duplicate = Boolean(
    query.trim() &&
    !candidates.length &&
    searchGuessModels(
      models.filter((m) => used.has(m.id)),
      query,
      1,
    ).length,
  );
  const remaining = room
    ? Math.max(0, room.rules.attempts - (me?.guesses.length ?? 0))
    : 0;
  const canGuess =
    room?.status === 'playing' &&
    remaining > 0 &&
    !busy &&
    connection !== 'recovering';
  async function submit(model: GuessApiModel | undefined) {
    if (!room || !model || !canGuess || !query.trim()) return;
    let request = lastRequest.current;
    if (
      request.model !== model.id ||
      request.round !== room.round ||
      request.code !== room.code
    ) {
      request = {
        code: room.code,
        round: room.round,
        model: model.id,
        id: crypto.randomUUID(),
      };
      lastRequest.current = request;
    }
    setQuery(model.name);
    setFocused(false);
    if (
      await command(`${room.code}/guess`, {
        round: room.round,
        guessId: model.id,
        requestId: request.id,
      })
    )
      setQuery('');
  }
  async function copyCode() {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
    } catch {
      setError(t('复制失败，请选中房间码手动复制。'));
    }
  }
  const seconds = Math.max(
    0,
    Math.ceil(
      ((room?.status === 'playing' ? room.roundEndsAt : room?.nextAt) ?? now) -
        now,
    ) / 1000,
  );
  const countdown = Math.ceil(seconds);
  const ended = room?.status === 'finished' || room?.status === 'closed';
  const resultText = !room?.result
    ? ''
    : room.result.reason === 'expired'
      ? '房间已到期'
      : room.result.reason === 'catalog_changed'
        ? '题库已更新，本场结束'
        : room.result.matchWinner !== null
          ? room.result.matchWinner === room.self
            ? '本场获胜'
            : '本场失败'
          : room.result.winner !== null
            ? room.result.winner === room.self
              ? '本轮获胜，获得 1 分'
              : '好友本轮获胜，获得 1 分'
            : '本轮平局';
  const activeMatch =
    room && !['waiting', 'finished', 'closed'].includes(room.status);
  const onJoin = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code))
      void command('join', { code });
  };

  return (
    <main className="gf-main" data-pending={busy} data-room={!!room}>
      {!room && (
        <>
          <a className="gf-back" href="#guess">
            <ArrowLeft size={15} />
            {t('返回单人模式')}
          </a>
          <div className="gf-title">
            <div>
              <p className="gf-eyebrow">GUESS TOGETHER / 02</p>
              <h1>
                {t('模一把')}
                <em>{t('好友对决')}</em>
              </h1>
            </div>
            <p>
              {t('双人同题对战')}
              <br />
              {t('先获得 2 分的玩家获胜。')}
            </p>
          </div>
        </>
      )}
      {error && (
        <p className="gf-error" role="alert">
          {t(error)}
        </p>
      )}
      {loading ? (
        <div className="gf-loading" role="status">
          <LoaderCircle className="guess-spinner" />
          {t('正在恢复好友房…')}
        </div>
      ) : loadFailed ? (
        <button
          className="gf-primary"
          onClick={() => {
            setLoading(true);
            setLoadFailed(false);
            setError('');
            setRetry((n) => n + 1);
          }}
        >
          {t('重新连接')}
        </button>
      ) : !room ? (
        <div className="gf-lobby">
          <section className="gf-lobby-card gf-curtain">
            <span className="gf-number">01</span>
            <Users size={28} />
            <h2>{t('创建房间')}</h2>
            <p>{t('选择难度后创建房间，并分享房间码邀请好友。')}</p>
            <fieldset disabled={busy}>
              <legend>{t('选择难度')}</legend>
              <div className="gf-levels">
                {DIFFICULTY_INFO.map((d, i) => (
                  <button
                    key={d.zh}
                    type="button"
                    aria-pressed={difficulty === i + 1}
                    onClick={() => setDifficulty((i + 1) as GuessDifficulty)}
                  >
                    {t(d.zh)}
                  </button>
                ))}
              </div>
            </fieldset>
            <button
              className="gf-primary"
              disabled={busy}
              onClick={() => void command('create', { difficulty })}
            >
              {busy ? (
                <LoaderCircle className="guess-spinner" size={18} />
              ) : null}
              {t('创建房间')}
              <ArrowUpRight size={19} />
            </button>
          </section>
          <form className="gf-lobby-card gf-curtain" onSubmit={onJoin}>
            <span className="gf-number">02</span>
            <Link2 size={28} />
            <h2>{t('加入房间')}</h2>
            <p>{t('输入 8 位房间码加入好友的房间。')}</p>
            <label className="gf-code-label" htmlFor="friend-code">
              {t('房间码')}
            </label>
            <input
              id="friend-code"
              className="gf-code-input"
              value={code}
              autoComplete="off"
              spellCheck={false}
              maxLength={8}
              placeholder="ABCDEFGH"
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/\s/g, ''))
              }
              disabled={busy}
            />
            <button
              className="gf-primary gf-secondary"
              disabled={
                busy || !/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/.test(code)
              }
            >
              {t('加入房间')}
              <ArrowUpRight size={19} />
            </button>
          </form>
          <p className="gf-rules">
            {t('每轮 120 秒 · 每人 8 次 · 先猜中得 1 分 · 平局换题')}
          </p>
        </div>
      ) : (
        <div className="gf-room gf-curtain" key={room.code}>
          <div className="gf-room-bar">
            <div className="gf-room-heading">
              <a
                className="gf-back"
                href="#guess"
                aria-label={t('返回单人模式')}
              >
                <ArrowLeft size={17} />
              </a>
              <h1>{t('好友对决')}</h1>
            </div>
            <div className="gf-room-code">
              <span>{t('房间码')}</span>
              <strong>{room.code}</strong>
              <button
                onClick={() => void copyCode()}
                aria-label={t('复制房间码')}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
            <div className="gf-connection" role="status">
              {connection === 'recovering' ? (
                <WifiOff size={15} />
              ) : (
                <Wifi size={15} />
              )}
              {t(
                connection === 'recovering'
                  ? '连接中，正在恢复…'
                  : connection === 'polling'
                    ? '已连接，定时同步'
                    : '实时连接',
              )}
            </div>
            <span>{t(DIFFICULTY_INFO[room.difficulty - 1].zh)}</span>
            <button
              className="gf-text-button gf-leave-button"
              onClick={() => setConfirmLeave(true)}
              disabled={busy}
            >
              {t(ended ? '关闭房间' : '离开房间')}
            </button>
          </div>
          {confirmLeave && (
            <div
              className="gf-leave"
              role="alertdialog"
              aria-labelledby="gf-leave-title"
            >
              <p id="gf-leave-title">
                {t(
                  activeMatch
                    ? '离开将判定本场失败，是否继续？'
                    : '确认离开房间？',
                )}
              </p>
              <button onClick={() => setConfirmLeave(false)} disabled={busy}>
                {t('取消')}
              </button>
              <button
                className="gf-primary"
                disabled={busy}
                onClick={() => void command(`${room.code}/leave`, {}, true)}
              >
                {t('确认离开')}
              </button>
            </div>
          )}
          <div className="gf-match-header">
            <div className="gf-scoreboard">
              {room.players.map((p, seat) => (
                <div
                  key={seat}
                  className={`gf-player ${seat === room.self ? 'is-me' : ''}`}
                >
                  <span className="gf-avatar" key={p?.name ?? 'empty'}>
                    {p?.name.slice(0, 1) || '?'}
                  </span>
                  <div>
                    <small>{t(seat === room.self ? '你' : '好友')}</small>
                    <h2>{p?.name || t('等待好友加入')}</h2>
                    <span className="gf-player-state" data-ready={p?.ready}>
                      {t(
                        !p
                          ? '邀请好友加入'
                          : p.left
                            ? '已离开'
                            : !p.connected
                              ? '正在重连…'
                              : room.status === 'waiting'
                                ? p.ready
                                  ? '已准备'
                                  : '未准备'
                                : '已连接',
                      )}
                    </span>
                  </div>
                  <b className="gf-score" key={`score-${p?.score ?? 'empty'}`}>
                    {p?.score ?? '—'}
                  </b>
                </div>
              ))}
              <span className="gf-versus" aria-hidden="true">
                VS
              </span>
            </div>
            {!['waiting', 'closed'].includes(room.status) && (
              <div className="gf-round-bar">
                <span>{t('第 {n} 轮', { n: room.round })}</span>
                <span>{t('先得 {n} 分获胜', { n: room.rules.wins })}</span>
                <strong
                  className={
                    room.status === 'playing' && countdown <= 15
                      ? 'is-urgent'
                      : ''
                  }
                >
                  {room.status === 'playing'
                    ? `${String(Math.floor(countdown / 60)).padStart(2, '0')}:${String(countdown % 60).padStart(2, '0')}`
                    : t(
                        room.status === 'starting'
                          ? '{n} 秒后开始'
                          : room.status === 'round_over'
                            ? '{n} 秒后下一轮'
                            : '本场结束',
                        { n: countdown },
                      )}
                </strong>
              </div>
            )}
          </div>
          {room.status === 'waiting' ? (
            <section className="gf-waiting">
              <p className="gf-eyebrow">WAITING ROOM</p>
              <h2>{t(opponent ? '等待玩家准备' : '等待好友加入')}</h2>
              <p>{t('双方准备后自动开始；每轮 8 次机会，先猜中得 1 分。')}</p>
              <button
                className="gf-primary"
                disabled={busy || connection === 'recovering'}
                onClick={() =>
                  void command(`${room.code}/ready`, { ready: !me?.ready })
                }
              >
                {t(me?.ready ? '取消准备' : '准备')}
                <Check size={18} />
              </button>
            </section>
          ) : room.status === 'closed' ? (
            <section className="gf-waiting">
              <h2>{t('房间已关闭')}</h2>
              <p>{t('请创建新房间并重新邀请好友。')}</p>
              <button
                className="gf-primary"
                onClick={() =>
                  void command('create', { difficulty: room.difficulty })
                }
                disabled={busy}
              >
                {t('创建新房间')}
              </button>
            </section>
          ) : (
            <div className="gf-round-stage gf-curtain" key={room.round}>
              {room.result && (
                <section className="gf-result gf-curtain" role="status">
                  <div>
                    <small>
                      {t(
                        ['left', 'disconnect'].includes(room.result.reason)
                          ? '对方离开或重连超时'
                          : room.result.reason === 'abandoned'
                            ? '双方连接中断，本场结束'
                            : '本轮结果',
                      )}
                    </small>
                    <h2>{t(resultText)}</h2>
                    {room.answer && (
                      <p>
                        {t('正确答案：')} <b>{room.answer.name}</b>
                      </p>
                    )}
                  </div>
                  {ended && (
                    <button
                      className="gf-primary"
                      onClick={() =>
                        void command('create', { difficulty: room.difficulty })
                      }
                      disabled={busy}
                    >
                      {t('创建新房间')}
                      <ArrowUpRight size={18} />
                    </button>
                  )}
                </section>
              )}
              {room.status === 'starting' && (
                <p className="gf-countdown" role="status">
                  <span>{t('对局即将开始')}</span>
                  <b key={countdown}>{countdown}</b>
                </p>
              )}
              <div className="gf-match-grid">
                <section
                  className="gf-own gf-curtain gf-play-surface"
                  data-phase={room.status}
                >
                  <div className="gf-section-title">
                    <h2>{t('猜测记录')}</h2>
                    <span>{t('剩余 {n} 次', { n: remaining })}</span>
                  </div>
                  {room.status === 'playing' && (
                    <>
                      <form
                        className="gf-search"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void submit(
                            candidates[
                              Math.min(selected, candidates.length - 1)
                            ],
                          );
                        }}
                      >
                        <Search size={19} />
                        <input
                          role="combobox"
                          aria-label={t('输入要猜的模型名')}
                          aria-autocomplete="list"
                          aria-expanded={focused && !!query.trim()}
                          aria-controls="gf-model-options"
                          aria-activedescendant={
                            focused && candidates[selected]
                              ? `gf-option-${selected}`
                              : undefined
                          }
                          aria-describedby="gf-search-hint"
                          placeholder={t('输入模型名称，按回车提交')}
                          value={query}
                          disabled={!canGuess}
                          onChange={(e) => {
                            setQuery(e.target.value);
                            setSelected(0);
                            setFocused(true);
                          }}
                          onFocus={() => setFocused(true)}
                          onBlur={() => setFocused(false)}
                          onKeyDown={(e) => {
                            if (e.key === 'ArrowDown') {
                              e.preventDefault();
                              setFocused(true);
                              setSelected((n) =>
                                Math.min(n + 1, candidates.length - 1),
                              );
                            }
                            if (e.key === 'ArrowUp') {
                              e.preventDefault();
                              setSelected((n) => Math.max(0, n - 1));
                            }
                            if (e.key === 'Escape') setFocused(false);
                          }}
                        />
                        <button
                          disabled={
                            !canGuess || !query.trim() || !candidates.length
                          }
                        >
                          {busy ? (
                            <LoaderCircle className="guess-spinner" size={17} />
                          ) : (
                            t('提交猜测')
                          )}
                          <ArrowUpRight size={16} />
                        </button>
                        {focused && query.trim() && (
                          <div
                            className="gf-options"
                            id="gf-model-options"
                            role="listbox"
                            aria-label={t('候选模型')}
                          >
                            {candidates.map((m, i) => (
                              <button
                                type="button"
                                key={m.id}
                                role="option"
                                tabIndex={-1}
                                id={`gf-option-${i}`}
                                aria-selected={selected === i}
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => void submit(m)}
                              >
                                {m.name}
                                <small>{m.vendor}</small>
                              </button>
                            ))}
                          </div>
                        )}
                      </form>
                      <p
                        className="gf-search-hint"
                        id="gf-search-hint"
                        role="status"
                      >
                        {t(
                          !remaining
                            ? '本轮猜测次数已用完，等待好友完成。'
                            : duplicate
                              ? '该模型已提交，请选择其他模型。'
                              : query.trim() && !candidates.length
                                ? '未找到匹配模型，请检查名称。'
                                : '完整线索仅自己可见；对方只能查看颜色提示。',
                        )}
                      </p>
                    </>
                  )}
                  <div
                    className="gf-table-scroll"
                    role="region"
                    aria-label={t('你的猜测记录')}
                  >
                    <table className="gf-table">
                      <thead>
                        <tr>
                          <th>{t('模型')}</th>
                          {ATTRIBUTE_KEYS.map((key) => (
                            <th key={key}>{t(LABELS[key])}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {me?.guesses.map((g, index) => (
                          <tr key={g.model?.id ?? index}>
                            <th>
                              <small>
                                {String(index + 1).padStart(2, '0')}
                              </small>
                              {g.model?.name}
                            </th>
                            <Clues guess={g} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!me?.guesses.length && (
                    <p className="gf-empty">
                      {t(
                        room.status === 'starting'
                          ? '倒计时结束后即可提交猜测。'
                          : '暂未提交猜测',
                      )}
                    </p>
                  )}
                </section>
                <aside className="gf-peer">
                  <div className="gf-section-title">
                    <h2>{t('好友进度')}</h2>
                    <span>
                      {opponent?.guesses.length ?? 0} / {room.rules.attempts}
                    </span>
                  </div>
                  <p>{t('本轮结束前，仅显示颜色提示。')}</p>
                  <div className="gf-peer-rows">
                    {Array.from({ length: room.rules.attempts }, (_, index) => {
                      const guess = opponent?.guesses[index];
                      return (
                        <div
                          className={`gf-peer-row${guess ? ' has-guess' : ''}`}
                          key={index}
                        >
                          <span>{String(index + 1).padStart(2, '0')}</span>
                          <div className="gf-tiles">
                            {ATTRIBUTE_KEYS.map((key, order) => (
                              <i
                                key={key}
                                className={guess?.attributes[key].state || ''}
                                style={{ '--gf-order': order } as CSSProperties}
                                aria-label={t(
                                  !guess
                                    ? '尚未猜测'
                                    : guess.attributes[key].state === 'hit'
                                      ? '吻合'
                                      : guess.attributes[key].state === 'near'
                                        ? '接近'
                                        : guess.attributes[key].state ===
                                            'unknown'
                                          ? '未公开'
                                          : '不符',
                                )}
                              />
                            ))}
                          </div>
                          {guess?.model && <small>{guess.model.name}</small>}
                        </div>
                      );
                    })}
                  </div>
                  <div className="gf-legend">
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
                  <div className="gf-peer-guide">
                    <section className="gf-guide-section">
                      <h3>{t('对局规则')}</h3>
                      <dl className="gf-rule-stats">
                        <div>
                          <dt>{t('每轮时限')}</dt>
                          <dd>
                            {t('{n} 秒', { n: room.rules.roundMs / 1000 })}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('猜测机会')}</dt>
                          <dd>{t('{n} 次', { n: room.rules.attempts })}</dd>
                        </div>
                      </dl>
                      <p>
                        {t('先猜中得 1 分，先得 {n} 分获胜。', {
                          n: room.rules.wins,
                        })}
                      </p>
                      <p>{t('双方未猜中则平局换题。')}</p>
                    </section>
                    <section className="gf-guide-section">
                      <h3>{t('线索说明')}</h3>
                      <dl className="gf-clue-guide">
                        <div>
                          <dt>↑</dt>
                          <dd>{t('答案更大或更新')}</dd>
                        </div>
                        <div>
                          <dt>↓</dt>
                          <dd>{t('答案更小或更早')}</dd>
                        </div>
                        <div>
                          <dt>?</dt>
                          <dd>{t('未公开的数据不参与比较。')}</dd>
                        </div>
                      </dl>
                    </section>
                  </div>
                </aside>
              </div>
            </div>
          )}
          <p className="gf-rules">
            {t('刷新可恢复对局；离线超过 30 秒判负。联机不计入每日挑战战绩。')}
          </p>
        </div>
      )}
    </main>
  );
}
