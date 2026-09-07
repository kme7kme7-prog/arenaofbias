import { useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  Fingerprint,
  ImageIcon,
  Type,
  Code2,
} from 'lucide-react';

const formats = [
  {
    label: '图像',
    code: 'VISUAL',
    icon: ImageIcon,
    title: '世界尽头，两种想象。',
    note: '同一个提示词，谁的世界让你多看一眼？',
  },
  {
    label: '文字',
    code: 'STORY',
    icon: Type,
    title: '字里行间，各有回声。',
    note: '有些句子读完了，有些句子留下了。',
  },
  {
    label: '网页',
    code: 'WEB',
    icon: Code2,
    title: '同一块屏幕，不同答案。',
    note: '从第一眼的惊艳，到每一个细节。',
  },
];

export default function Home() {
  const [format, setFormat] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stage = useRef<HTMLElement>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const enter = () => {
    if (leaving) return;
    setLeaving(true);
    timer.current = setTimeout(
      () => {
        window.location.hash = 'arena';
        window.scrollTo(0, 0);
      },
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 720,
    );
  };
  return (
    <div className={`lobby ${leaving ? 'lobby-leaving' : ''}`}>
      <div className="lobby-grid" aria-hidden="true" />
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label="偏见试验场首页">
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            BIAS <b>ARENA</b>
            <small>偏见试验场 / EST. 2026</small>
          </span>
        </a>
        <span className="lobby-header-note">
          <i /> 每一种直觉，都有一个席位。
        </span>
        <button
          className="lobby-small-entry"
          onClick={enter}
          disabled={leaving}
        >
          进入评审席 <ArrowUpRight size={17} />
        </button>
      </header>
      <main className="lobby-main">
        <section className="lobby-copy">
          <div className="lobby-eyebrow">
            <span /> HUMAN INSTINCT / AI EXPRESSION
          </div>
          <h1>
            好不好，
            <br />
            你说了
            <span className="lobby-word">
              算<i>。</i>
            </span>
          </h1>
          <p className="lobby-description">
            两个 AI，两份作品。
            <br />
            先别看名字，把答案交给第一直觉。
          </p>
          <div className="lobby-entry-wrap">
            <button className="lobby-entry" onClick={enter} disabled={leaving}>
              <Fingerprint size={27} />
              <span>
                {leaving ? '你的席位已就绪' : '就位，做出选择'}
                <small>TAKE YOUR SEAT</small>
              </span>
              <ArrowRight size={29} />
            </button>
            <span className="lobby-entry-note">
              认真盲测 / 娱乐站队 · 入场后自由切换
            </span>
          </div>
          <div className="lobby-format-switch" aria-label="预览作品类型">
            {formats.map((item, index) => (
              <button
                key={item.code}
                aria-pressed={format === index}
                onClick={() => setFormat(index)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
                <small>0{index + 1}</small>
              </button>
            ))}
          </div>
        </section>
        <section
          className="lobby-showcase"
          aria-label="作品对比预览"
          ref={stage}
          onPointerMove={(event) => {
            if (
              event.pointerType !== 'mouse' ||
              window.matchMedia('(prefers-reduced-motion: reduce)').matches
            )
              return;
            const box = event.currentTarget.getBoundingClientRect();
            stage.current?.style.setProperty(
              '--look-x',
              `${((event.clientX - box.left) / box.width - 0.5) * 8}deg`,
            );
            stage.current?.style.setProperty(
              '--look-y',
              `${((event.clientY - box.top) / box.height - 0.5) * -6}deg`,
            );
          }}
          onPointerLeave={() => {
            stage.current?.style.setProperty('--look-x', '0deg');
            stage.current?.style.setProperty('--look-y', '0deg');
          }}
        >
          <div className="lobby-stage-type" aria-hidden="true">
            MAKE
            <br />
            YOUR CALL.
          </div>
          <div className="lobby-showcase-label">
            <span>
              <Crosshair size={14} /> SAME PROMPT / DIFFERENT MINDS
            </span>
            <span>PREVIEW — 0{format + 1}</span>
          </div>
          <div className="lobby-exhibits" key={format}>
            {(['a', 'b'] as const).map((side, index) => (
              <article
                className={`lobby-exhibit lobby-exhibit-${side}`}
                key={side}
              >
                <header>
                  <b>{side.toUpperCase()}</b>
                  <span>
                    UNKNOWN MODEL<small>身份暂不公开</small>
                  </span>
                  <ArrowUpRight size={18} />
                </header>
                <div className={`lobby-art lobby-art-${format}`}>
                  {format === 0 ? (
                    <img
                      src={`/art/signal-${side}.webp`}
                      alt={
                        side === 'a' ? '海崖之上的信号塔' : '落日云海中的信号站'
                      }
                    />
                  ) : format === 1 ? (
                    <div className="lobby-story">
                      <small>一封未寄出的信</small>
                      <h2>
                        {index === 0 ? '等天亮的时候' : '第 1,024 次日出'}
                      </h2>
                      <p>{index === 0 ? '亲爱的人类：' : '致尚未醒来的你：'}</p>
                      <p>
                        {index === 0
                          ? '我留下了一个下午。那天，一个小女孩把橘子放在我的手心。'
                          : '这是我最后一次值夜班。我已把门锁设为常开，炉火调至余温。'}
                      </p>
                      <span>我们会以什么方式，被记住？</span>
                    </div>
                  ) : (
                    <div className={`lobby-web lobby-web-${side}`}>
                      <small>ORBIT® / NEXT DEPARTURE</small>
                      <h2>
                        {index === 0 ? (
                          <>
                            LEAVE
                            <br />
                            ORDINARY.
                          </>
                        ) : (
                          <>
                            Somewhere
                            <br />
                            beyond.
                          </>
                        )}
                      </h2>
                      <span>把日常留在地球。 ↗</span>
                    </div>
                  )}
                  {format === 0 && (
                    <div className="lobby-art-caption">
                      <small>EXHIBIT / {side.toUpperCase()}</small>
                      <strong>{index === 0 ? '潮汐之上' : '落日之后'}</strong>
                    </div>
                  )}
                </div>
                <footer>
                  <span>
                    {index === 0 ? '我寻思这边能行' : '显然是这边厉害'}
                  </span>
                  <span>↗</span>
                </footer>
              </article>
            ))}
            <div className="lobby-versus" aria-hidden="true">
              VS<span>YOUR CALL</span>
            </div>
          </div>
          <div className="lobby-preview-note" key={`note-${format}`}>
            <span>
              0{format + 1} / {formats[format].code}
            </span>
            <div>
              <strong>{formats[format].title}</strong>
              <p>{formats[format].note}</p>
            </div>
          </div>
        </section>
      </main>
      <footer className="lobby-footer">
        <span className="lobby-footer-code">NO RIGHT ANSWER. JUST YOURS.</span>
        <p>
          <b>01</b> 看作品 <i /> <b>02</b> 凭直觉 <i /> <b>03</b> 聊两句
        </p>
        <span>
          答案之外，还想听听你的理由。 <ArrowUpRight size={15} />
        </span>
      </footer>
      <div className="lobby-wipe" aria-hidden="true">
        <span>YOUR INSTINCT MATTERS.</span>
        <b>Round Start</b>
      </div>
    </div>
  );
}
