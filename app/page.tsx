'use client';

import { AccountButton, useAccount } from '@/components/account';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Check,
  Crosshair,
  Expand,
  Eye,
  Fingerprint,
  ImageIcon,
  LockKeyhole,
  Maximize,
  RotateCcw,
  SkipForward,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  arenaReducer,
  initialState,
  rounds,
  type ModelResult,
  type Prompt,
  type Matchup,
  type Side,
} from '@/lib/arena';
import {
  appendPlaceholderVote,
  currentMatchup,
  currentPairs,
  currentRandomArenaHash,
  currentResultsForPrompt,
  isPlaceholderMode,
} from '@/lib/placeholder';
import { submitVote } from '@/lib/votes';
import { DocumentDecryption } from '@/lib/decryption';
import { scrollWorkToBottom } from '@/lib/scroll-tour';
import { Afterparty } from '@/components/afterparty';

const ABORTED = 'sequence-cancelled';
const motionQuery = '(prefers-reduced-motion: reduce)';

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

function Work({
  result,
  side,
  expanded = false,
  imageFailed = false,
}: {
  result: ModelResult;
  side: Side;
  expanded?: boolean;
  imageFailed?: boolean;
}) {
  if (result.content.kind === 'image')
    return imageFailed ? (
      <div className="asset-error">
        <ImageIcon />
        <strong>画面暂时未能载入</strong>
        <span>可先切换至文字或网页对决</span>
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
    // 内联占位作品（srcDoc）不加载外部资源，沙箱保持最小权限
    const inline = 'html' in content;
    return (
      <iframe
        className="html-work"
        title={result.title}
        src={inline ? undefined : content.src}
        srcDoc={inline ? content.html : undefined}
        sandbox={inline ? 'allow-scripts' : 'allow-scripts allow-same-origin'}
        inert={!expanded}
        style={{ pointerEvents: expanded ? 'auto' : 'none' }}
      />
    );
  }
  const story = result.content.story;
  return (
    <article className={`story-work story-${side}`} data-tour-scroll>
      <div className="story-meta">
        <span>一封未寄出的信</span>
        <span>23:59:59</span>
      </div>
      <h3>
        {story.heading}
        <span>。</span>
      </h3>
      <div className="story-body">
        {story.paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <footer>
        <span>{story.ending}</span>
        <AudioLines size={20} />
      </footer>
    </article>
  );
}

export default function Arena({ prompt }: { prompt: Prompt }) {
  const promptIndex = rounds.findIndex((item) => item.id === prompt.id);
  const [state, dispatch] = useReducer(arenaReducer, {
    ...initialState,
    round: promptIndex,
    pendingRound: promptIndex,
  });
  const [pair, setPair] = useState<Matchup>(() => currentMatchup(prompt.id)!);
  const pairCount = currentPairs(prompt.id).length;
  const resultCount = currentResultsForPrompt(prompt.id).length;
  const [spotlight, setSpotlight] = useState<Side | null>(null);
  const [expanded, setExpanded] = useState<Side | null>(null);
  const [sound, setSound] = useState(false);
  const reducedMotion = useSyncExternalStore(
    subscribeMotion,
    getMotionPreference,
    getServerMotionPreference,
  );
  const [failedAssets, setFailedAssets] = useState<string[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
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
  const revealed = state.mode === 'party' || state.phase === 'result';
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
      await animation.finished;
      if (signal.aborted) throw new Error(ABORTED);
    };
    const sequence = async () => {
      resetScroll();
      if (reducedMotion) {
        await delay(200, signal);
        dispatch({ type: 'READY' });
        return;
      }
      // Let long-form work get into its reading motion a touch sooner.
      await delay(prompt.kind === 'text' ? 500 : 600, signal);
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
          780,
        );
        const scrollable =
          element.querySelector<HTMLElement>('[data-tour-scroll]');
        if (scrollable) {
          // Long-form work begins reading sooner; the first beat is still
          // long enough to establish the enlarged frame before motion starts.
          await delay(500, signal);
          await scrollWorkToBottom(
            scrollable,
            signal,
            prompt.kind === 'text' ? 48 : 62,
          );
          await delay(1300, signal);
        } else {
          await delay(1550, signal);
        }
        await animate(
          element,
          [
            { transform: focusTransform },
            { transform: 'translate3d(0,0,0) scale(1)' },
          ],
          680,
        );
        if (scrollable) scrollable.scrollTop = 0;
        setSpotlight(null);
        await delay(180, signal);
      }
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
  }, [state.phase, state.run, state.round, prompt.kind, reducedMotion, play]);

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
              reducedMotion ? 80 : 1150,
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

  // 反馈与提交时所属的对局（run）绑定：换组、重播、切模式都会递增 run，
  // 旧 run 的提交结果——包括网络晚到的响应——不会再覆盖新一轮的反馈
  const [voteRecord, setVoteRecord] = useState<{
    run: number;    outcome: VoteOutcome;
  }>({ run: state.run, outcome: { state: 'idle' } });
  const voteOutcome: VoteOutcome =
    voteRecord.run === state.run ? voteRecord.outcome : { state: 'idle' };
  const { open: openAccount } = useAccount();

  const recordVote = useCallback(
    (side: Side) => {
      const winner = side === 'a' ? pair[0] : pair[1];
      const loser = side === 'b' ? pair[0] : pair[1];
      if (isPlaceholderMode()) {
        const appended = appendPlaceholderVote({
          promptId: prompt.id,
          winnerId: winner.modelId,
          loserId: loser.modelId,
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
    (side: Side) => {
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

  const statusText =
    state.phase === 'loading'
      ? '画面载入中'
      : state.phase === 'intro'
        ? spotlight
          ? `正在观测作品 ${spotlight.toUpperCase()}`
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
      <div className="edge-coordinate left" aria-hidden="true">
        BIAS / OBSERVATION SYSTEM — 026
      </div>
      <header className="topbar">
        <a className="brand" href="#home" aria-label="回到首页">
          <Mark />
          <div>
            <strong>
              ARENA OF <span className="brand-tag">BIAS</span>
            </strong>
            <small>
              偏见试验场 <span>／</span> EST. 2026
            </small>
          </div>
        </a>
        <div className="header-divider" />
        <div className="terminal-label">
          <span className="live-dot" />{' '}
          <a href="#home" className="arena-home-link">
            返回首页
          </a>{' '}
          <a href="#prompts" className="arena-home-link">
            / 提示词库
          </a>
        </div>
        <div className="header-right">
          <AccountButton />
          <span className="demo-label">
            {isPlaceholderMode() ? (
              <>
                PLACEHOLDER <b>DATA</b>
              </>
            ) : (
              <>
                DEMO BUILD <b>0.1</b>
              </>
            )}
          </span>
          <button
            className={`icon-button ${sound ? 'on' : ''}`}
            onClick={toggleSound}
            aria-label={sound ? '关闭音效' : '开启音效'}
            title={sound ? '关闭音效' : '开启音效'}
          >
            {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
          </button>
          <button
            className="icon-button fullscreen-button"
            onClick={toggleFullscreen}
            aria-label="切换全屏"
            title="切换全屏"
          >
            <Maximize size={17} />
          </button>
        </div>
      </header>

      <main className="main-terminal">
        <section className="command-row">
          <div className="section-heading">
            <span className="section-code">{'// SUBJECTIVE JUDGEMENT'}</span>
            <h1>
              直觉，即是答案<span>。</span>
            </h1>
          </div>
          <Tabs
            value={state.mode}
            onValueChange={(value) =>
              dispatch({ type: 'MODE', mode: value as 'blind' | 'party' })
            }
            className="mode-tabs"
            aria-label="评审模式"
          >
            <TabsList>
              <TabsTrigger value="blind" disabled={blocked}>
                <Fingerprint size={17} />
                <span>认真盲测</span>
              </TabsTrigger>
              <TabsTrigger value="party" disabled={blocked}>
                <Zap size={17} />
                <span>娱乐站队</span>
              </TabsTrigger>
            </TabsList>
            <p>
              {state.mode === 'blind'
                ? '隐藏名字，只看作品。'
                : '阵营已公开，喜欢就站这边。'}
            </p>
          </Tabs>
        </section>

        <section className="briefing" aria-label="本轮创作要求">
          <div className="round-tag">
            <Crosshair size={19} />
            <span>
              Round Start <b>{round.id}</b>
            </span>
          </div>
          <div className="briefing-copy">
            <span className="prompt-label">本轮命题</span>
            <h2 key={round.id}>{round.prompt}</h2>
          </div>
          <span className="briefing-detail">{round.detail}</span>
          <div className="briefing-corner" aria-hidden="true" />
        </section>

        <aside
          className="match-commentary"
          key={`commentary-${round.id}`}
          aria-label="本题旁白"
        >
          <span className="commentary-badge">
            <Mark small />
            评审附言
          </span>
          <p>“{round.commentary}”</p>
          <span className="commentary-id">FIELD NOTE / {round.id}</span>
        </aside>
        <div className="field-meta">
          <span>
            <i /> LIVE COMPARISON <span className="meta-slash">/</span>{' '}
            {round.category}
          </span>
          <output className="field-status" aria-live="polite">
            <i />
            {statusText}
          </output>
          <span className="meta-right">
            {state.mode === 'blind' ? (
              <LockKeyhole size={12} />
            ) : (
              <Eye size={12} />
            )}{' '}
            {revealed ? 'IDENTITY OPEN' : 'IDENTITY ENCRYPTED'}
          </span>
        </div>

        <div className="arena-stage" ref={stageRef}>
          <div className="stage-watermark" aria-hidden="true">
            {spotlight ? spotlight.toUpperCase() : 'VS'}
          </div>
          {(['a', 'b'] as const).map((side, index) => {
            const chosen = state.choice === side;
            const result = pair[index];
            return (
              <div
                key={side}
                className={`contender contender-${side} ${chosen ? 'is-chosen' : ''} ${state.choice && !chosen ? 'not-chosen' : ''}`}
              >
                <div className="work-panel" ref={index === 0 ? cardA : cardB}>
                  <div className="panel-heading">
                    <div className="panel-identity">
                      <span className="side-letter">{side.toUpperCase()}</span>
                      <span className="model-identity">
                        {revealed ? round.models[index] : '未知模型'}
                        <small>
                          {revealed ? 'DEMO IDENTITY' : 'ANONYMOUS ENTRY'}
                        </small>
                      </span>
                    </div>
                    <span className="entry-number">
                      {round.code} / 0{index + 1}
                    </span>
                    <span className="panel-lock">
                      {revealed ? <Eye size={15} /> : <LockKeyhole size={15} />}
                    </span>
                  </div>
                  <div
                    className={`work-viewport ${prompt.kind === 'text' ? 'is-story' : ''}`}
                  >
                    <div
                      className="work-inner"
                      key={`${state.round}-${side}`}
                      data-tour-scroll={
                        prompt.kind === 'web' ? true : undefined
                      }
                    >
                      <Work
                        result={result}
                        side={side}
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
                        <span>EXHIBIT {side.toUpperCase()}</span>
                        <strong>{round.labels[index]}</strong>
                      </div>
                    )}
                    <button
                      className="expand-control"
                      onClick={() => setExpanded(side)}
                      disabled={state.phase === 'intro' || blocked}
                      aria-label={`放大查看作品 ${side.toUpperCase()}`}
                      title={
                        prompt.kind === 'web' ? '打开交互预览' : '放大查看'
                      }
                    >
                      <Expand size={17} />
                    </button>
                    {chosen && (
                      <div className="chosen-stamp">
                        <Check size={17} />
                        <span>YOUR PICK</span>
                      </div>
                    )}
                  </div>
                  <div className="panel-bottom">
                    <span>
                      <i />
                      {state.phase === 'result'
                        ? '身份已揭晓'
                        : prompt.kind === 'web'
                          ? 'HTML / 可打开交互预览'
                          : prompt.kind === 'text'
                            ? 'TEXT / 短篇创作'
                            : 'IMAGE / 概念设计'}
                    </span>
                    <span className="panel-bars" aria-hidden="true">
                      ▌▌▏▌▏▌▌
                    </span>
                    <span>
                      0{index + 1} — {round.id}
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
                      {side === 'a' ? '我寻思这边能行' : '显然是这边厉害'}
                    </strong>
                    <small>
                      {state.phase === 'intro' || state.phase === 'loading'
                        ? 'AWAITING YOUR JUDGEMENT'
                        : chosen
                          ? 'CHOICE CONFIRMED'
                          : 'TRUST YOUR INSTINCT'}
                    </small>
                  </span>
                  <kbd>{side === 'a' ? 'A' : 'D'}</kbd>
                </button>
                {state.phase === 'result' && (
                  <div className="side-result">
                    <span>{chosen ? '你站在了这一边' : '另一种直觉'}</span>
                    <strong>{chosen ? '已选择' : '未选择'}</strong>
                  </div>
                )}
              </div>
            );
          })}
          <div className="versus-spine" aria-hidden="true">
            <div className="spine-line" />
            <div className="vs-emblem">
              <span className="vs-orbit" />
              <span className="vs-orbit second" />
              <b>VS</b>
            </div>
            <span className="vs-sub">
              MAKE
              <br />
              YOUR
              <br />
              CALL
            </span>
            <div className="spine-line" />
          </div>
          {state.phase === 'intro' && (
            <div className="intro-label" key={state.run} aria-hidden="true">
              <span>NEW ENCOUNTER</span>
              <strong>
                Round Start <b>{round.id}</b>
              </strong>
              <span>两种表达。一个选择。</span>
            </div>
          )}
          {state.phase === 'loading' && (
            <div className="loading-overlay">
              <Mark />
              <span>正在接入试验场</span>
              <div className="load-track" />
            </div>
          )}
          <div className="transition-shutter" aria-hidden="true">
            <span>SWITCHING FREQUENCY</span>
            <b>{String(state.pendingRound + 1).padStart(2, '0')}</b>
          </div>
          {state.phase === 'locking' && (
            <div className="lock-announcement" aria-hidden="true">
              <Crosshair size={28} />
              <span>直觉已锁定</span>
              <small>JUDGEMENT REGISTERED</small>
            </div>
          )}
        </div>

        <div
          className={`round-console ${state.phase === 'result' ? 'show-result' : ''}`}
        >
          {state.phase === 'result' ? (
            <div className="result-console">
              <div className="result-caption">
                <Check size={17} />
                <strong>好，你有自己的答案。</strong>
                <span
                  className="vote-note"
                  data-state={voteOutcome.state}
                >
                  {voteOutcome.state === 'saved' &&
                    (isPlaceholderMode()
                      ? '已写入本地演示数据 · 占位模式'
                      : '你的选择已计入偏好榜')}
                  {voteOutcome.state === 'auth' && (
                    <button
                      type="button"
                      className="vote-note-login"
                      onClick={openAccount}
                    >
                      登录后，你的选择会计入偏好榜 ↗
                    </button>
                  )}
                  {voteOutcome.state === 'dup' &&
                    '这一对作品你已经投过票了'}
                  {voteOutcome.state === 'failed' && voteOutcome.message}
                  {(voteOutcome.state === 'idle' ||
                    voteOutcome.state === 'saving') &&
                    '正在记录你的选择…'}
                </span>
                <a className="result-board-link" href="#rank">
                  看看偏好榜 ↗
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
                <b>01</b>作品入场
              </span>
              <i />
              <span className={state.phase === 'voting' ? 'current' : ''}>
                <b>02</b>直觉投票
              </span>
              <i />
              <span>
                <b>03</b>身份揭晓
              </span>
            </div>
          )}
          <div className="round-actions">
            {state.phase === 'intro' ? (
              <button
                className="text-button"
                onClick={() => dispatch({ type: 'READY' })}
              >
                <SkipForward size={15} />
                跳过入场 <kbd>SPACE</kbd>
              </button>
            ) : (
              <button
                className="text-button"
                onClick={() => dispatch({ type: 'REPLAY' })}
                disabled={blocked}
              >
                <RotateCcw size={14} />
                重播入场
              </button>
            )}
            <button
              className={`next-button ${state.phase === 'result' ? 'highlight' : ''}`}
              onClick={() => nextMatchup()}
              disabled={blocked}
            >
              {pairCount > 1 ? '同提示词 · 换一组' : '重新比较本提示词'}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>

        {state.phase === 'result' && state.choice && (
          <div className="afterparty-reveal">
            {isPlaceholderMode() ? (
              <div className="placeholder-note">
                占位符模式：评论区停用，占位数据不入库。
              </div>
            ) : (
              <div>
                <Afterparty
                  key={`${round.id}-${state.run}`}
                  roundId={round.id}
                  side={state.choice}
                />
              </div>
            )}
          </div>
        )}

        <section
          className="round-selector prompt-context"
          aria-label="当前提示词竞技场"
        >
          <div className="selector-heading">
            <span className="section-code">ONE PROMPT / ONE ARENA</span>
            <strong>{prompt.name}</strong>
          </div>
          <p>
            本场收录{' '}
            {
              new Set(
                currentResultsForPrompt(prompt.id).map(
                  (entry) => entry.modelId,
                ),
              ).size
            }{' '}
            个模型的 {resultCount} 份结果，只在这个提示词内比较。
          </p>
          <p>
            {pairCount === 1
              ? '当前仅有一组可比较作品，可重看本组，或前往其他提示词竞技场。'
              : '换一组会优先抽取不同的作品组合。'}
          </p>
          <div className="prompt-context-links">
            <a href="#prompts">
              返回提示词库 <ArrowUpRight size={16} />
            </a>
            <button
              onClick={() => {
                window.location.hash = currentRandomArenaHash(prompt.id);
              }}
            >
              随机换个竞技场 <ArrowRight size={16} />
            </button>
          </div>
        </section>
      </main>

      <footer className="system-footer">
        <span>
          <span className="live-dot" /> SYSTEM ONLINE <i /> NO RIGHT ANSWER.
        </span>
        <span className="footer-keyboard">
          <kbd>A</kbd> 左侧 <kbd>D</kbd> 右侧 <kbd>N</kbd> 同题换组
        </span>
        <span>
          仅供体验 <span className="footer-cross">＋</span> ARENA OF{' '}
          <span className="brand-tag">BIAS</span> / 2026
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
                作品 {expanded?.toUpperCase()} <span>/ {round.category}</span>
              </DialogTitle>
              <DialogDescription>{round.prompt}</DialogDescription>
            </div>
            <button
              className="icon-button"
              onClick={() => setExpanded(null)}
              aria-label="关闭作品预览"
            >
              <X size={22} />
            </button>
          </div>
          <div className="expanded-work">
            {expanded && (
              <Work
                result={pair[expanded === 'a' ? 0 : 1]}
                side={expanded}
                expanded
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
              {prompt.kind === 'web'
                ? '演示页面 · 可以试试预订与目的地按钮'
                : 'ESC 返回对决'}
            </span>
            <span>
              {revealed && expanded
                ? round.models[expanded === 'a' ? 0 : 1]
                : '身份隐藏中'}
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
