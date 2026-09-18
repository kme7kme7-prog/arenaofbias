import { useI18n } from '@/lib/locale';
import { HomeNext } from './home-next';
import './home-next.css';
import { HomeDuel } from './home-duel';
import './home-duel.css';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { useEffect, useRef, useState } from 'react';
import {
  createGameTransition,
  bandsNavigate,
  convoyNavigate,
} from '@/lib/game-transitions';
import {
  HOME_EDITION_CHANGED,
  readHomeEdition,
  type HomeEdition,
} from '@/lib/home-edition';
import { currentRatings } from '@/lib/ratings';
// 随机入场与 #random 路由同源（占位感知 + 远端作品/题库），
// 修正旧版只看内置种子、随机不到真实竞技场的口径不一致
import { currentRandomArenaHash } from '@/lib/placeholder';
import { currentPrompts } from '@/lib/prompts';
import { enterArena } from '@/lib/works-gate';
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

// 档案锁定过场的跨实例防重入：模块自身没有全局锁（对照页需要多实例预览），
// 接入侧负责——过渡进行中（含盖满后返回首页重挂载的窗口期）不允许再触发
let frameTransitionRunning = false;

export default function Home() {
  const { t, localize } = useI18n();
  // 版本定稿新版，三版对比入口收进开发者面板（决策 086）；
  // 面板写入后靠事件即时换版，不刷新页面
  const [edition, setEdition] = useState<HomeEdition>(readHomeEdition);
  useEffect(() => {
    const sync = () => setEdition(readHomeEdition());
    window.addEventListener(HOME_EDITION_CHANGED, sync);
    return () => window.removeEventListener(HOME_EDITION_CHANGED, sync);
  }, []);
  const [format, setFormat] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const stage = useRef<HTMLElement>(null);
  // 决策 023：主按钮进入玩法菜单；页眉保留「随机入场」快速入口。
  // 决策 032：主按钮改走档案锁定过场（lib/game-transitions.ts 的 frame），
  // 盖满时经 onCovered 切路由；随机入场走钉住纸幕（2026-09-19，取代横扫）
  const enter = () => {
    if (leaving || frameTransitionRunning) return;
    setLeaving(true);
    frameTransitionRunning = true;
    const transition = createGameTransition('frame', {
      onCovered: () => {
        window.location.hash = '#play';
      },
      onFinish: () => {
        frameTransitionRunning = false;
        setLeaving(false);
      },
    });
    transition.play();
  };
  const enterRandom = () => {
    if (leaving) return;
    const hash = currentRandomArenaHash();
    const prompt = currentPrompts().find((item) => `#arena/${item.id}` === hash);
    if (!enterArena(hash, prompt?.name, prompt?.id)) return;
    setLeaving(true);
  };
  if (edition === 'new')
    return (
      <HomeNext enter={enter} enterRandom={enterRandom} leaving={leaving} />
    );
  if (edition === 'duel')
    return (
      <HomeDuel enter={enter} enterRandom={enterRandom} leaving={leaving} />
    );
  return (
    <div className="lobby">
        <div className="lobby-grid" aria-hidden="true" />
        <header className="lobby-header">
          <a className="lobby-brand" href="#home" aria-label={t('回到首页')}>
            <span className="lobby-mark" aria-hidden="true">
              ≡
            </span>
            <span>
              {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
              <small>{t('偏见试验场 / EST. 2026')}</small>
            </span>
          </a>
          <span className="lobby-header-note">
            <i /> {t('每一种直觉，都有一个席位。')}
          </span>
          <button
            className="lobby-small-entry"
            onClick={enterRandom}
            disabled={leaving}
          >
            {t('随机入场')}
            <ArrowUpRight size={17} />
          </button>
          <LanguageSwitch />
          <AccountButton />
        </header>
        <main className="lobby-main">
          <section className="lobby-copy">
            <div className="lobby-eyebrow">
              <span /> {t('HUMAN INSTINCT / AI EXPRESSION')}
            </div>
            <h1>
              {t('好不好，')}
              <br />
              {t('你说了')}{' '}
              <span className="lobby-word">
                {t('算')}
                <i>{t('。')}</i>
              </span>
            </h1>
            <p className="lobby-description">
              {t('同一个提示词，不同模型的答案。')}
              <br />
              {t('先别看名字，把答案交给第一直觉。')}
            </p>
            <div className="lobby-entry-wrap">
              <button
                className="lobby-entry"
                onClick={enter}
                disabled={leaving}
              >
                <Fingerprint size={27} />
                <span>
                  {localize(leaving ? '正在进入' : '进入评测，凭直觉选')}
                </span>
                <ArrowRight size={29} />
              </button>
              <a
                className="lobby-library-entry"
                href="#prompts"
                onClick={(e) => {
                  e.preventDefault();
                  convoyNavigate('#prompts', 'PROMPT LIBRARY');
                }}
              >
                {t('先逛逛提示词库')}
                <ArrowUpRight size={20} />
              </a>
              <a
                className="lobby-library-entry"
                href="#rank"
                onClick={(e) => {
                  e.preventDefault();
                  // 字带站队：声望分前两名上带（暗分排序，未就绪/不足退回通用品牌词）
                  const top = Object.entries(currentRatings())
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 2)
                    .map(([mid]) => mid);
                  bandsNavigate(
                    '#rank',
                    top.length >= 2
                      ? {
                          title: 'LEADERBOARD',
                          words: ['LEADERBOARD', top[0], top[1]],
                          labels: ['RANK →', 'TOP 01', 'TOP 02'],
                        }
                      : { title: 'LEADERBOARD' },
                  );
                }}
              >
                {t('看看偏好榜')}
                <ArrowUpRight size={20} />
              </a>
              <span className="lobby-entry-note">
                {t('进入玩法菜单：正式测评、娱乐测评或特别赛。')}
              </span>
            </div>
            <div className="lobby-format-switch" aria-label={t('预览作品类型')}>
              {formats.map((item, index) => (
                <button
                  key={item.code}
                  aria-pressed={format === index}
                  onClick={() => setFormat(index)}
                >
                  <item.icon size={16} />
                  <span>{localize(item.label)}</span>
                  <small>0{index + 1}</small>
                </button>
              ))}
            </div>
          </section>
          <section
            className="lobby-showcase"
            aria-label={t('作品对比预览')}
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
              {t('你的判断')}
            </div>
            <div className="lobby-showcase-label">
              <span>
                <Crosshair size={14} /> {t('SAME PROMPT / DIFFERENT MINDS')}
              </span>
              <span>
                {t('PREVIEW — 0')}
                {format + 1}
              </span>
            </div>
            <div className="lobby-exhibits" key={format}>
              {(['a', 'b'] as const).map((side, index) => (
                <article
                  className={`lobby-exhibit lobby-exhibit-${side}`}
                  key={side}
                >
                  <header>
                    <b>{localize(side.toUpperCase())}</b>
                    <span>
                      {t('UNKNOWN MODEL')}
                      <small>{t('身份暂不公开')}</small>
                    </span>
                    <ArrowUpRight size={18} />
                  </header>
                  <div className={`lobby-art lobby-art-${format}`}>
                    {format === 0 ? (
                      <img
                        src={`/art/signal-${side}.webp`}
                        alt={t(
                          side === 'a'
                            ? '海崖之上的信号塔'
                            : '落日云海中的信号站',
                        )}
                      />
                    ) : format === 1 ? (
                      <div className="lobby-story">
                        <small>{t('一封未寄出的信')}</small>
                        <h2>
                          {localize(
                            index === 0 ? '等天亮的时候' : '第 1,024 次日出',
                          )}
                        </h2>
                        <p>
                          {localize(
                            index === 0 ? '亲爱的人类：' : '致尚未醒来的你：',
                          )}
                        </p>
                        <p>
                          {localize(
                            index === 0
                              ? '我留下了一个下午。那天，一个小女孩把橘子放在我的手心。'
                              : '这是我最后一次值夜班。我已把门锁设为常开，炉火调至余温。',
                          )}
                        </p>
                        <span>{t('我们会以什么方式，被记住？')}</span>
                      </div>
                    ) : (
                      <div className={`lobby-web lobby-web-${side}`}>
                        <small>{t('ORBIT® / NEXT DEPARTURE')}</small>
                        <h2>
                          {index === 0 ? (
                            <>
                              {t('LEAVE')}
                              <br />
                              {t('ORDINARY.')}
                            </>
                          ) : (
                            <>
                              {t('Somewhere')}
                              <br />
                              {t('beyond.')}
                            </>
                          )}
                        </h2>
                        <span>{t('把日常留在地球。 ↗')}</span>
                      </div>
                    )}
                    {format === 0 && (
                      <div className="lobby-art-caption">
                        <small>
                          {t('EXHIBIT /')}
                          {localize(side.toUpperCase())}
                        </small>
                        <strong>
                          {localize(index === 0 ? '潮汐之上' : '落日之后')}
                        </strong>
                      </div>
                    )}
                  </div>
                  <footer>
                    <span>
                      {localize(
                        index === 0 ? '我寻思这边能行' : '显然是这边厉害',
                      )}
                    </span>
                    <span>↗</span>
                  </footer>
                </article>
              ))}
              <div className="lobby-versus" aria-hidden="true">
                {t('VS')}
                <span>{t('YOUR CALL')}</span>
              </div>
            </div>
            <div className="lobby-preview-note" key={`note-${format}`}>
              <span>
                0{format + 1} / {localize(formats[format].code)}
              </span>
              <div>
                <strong>{localize(formats[format].title)}</strong>
                <p>{localize(formats[format].note)}</p>
              </div>
            </div>
          </section>
        </main>
        <footer className="lobby-footer">
          <span className="lobby-footer-code">
            {t('NO RIGHT ANSWER. JUST YOURS.')}
          </span>
          <p>
            <b>01</b> {t('看作品')}
            <i /> <b>02</b> {t('凭直觉')}
            <i /> <b>03</b> {t('聊两句')}
          </p>
          <span>
            {t('答案之外，还想听听你的理由。')}
            <ArrowUpRight size={15} />
          </span>
        </footer>
      </div>
  );
}
