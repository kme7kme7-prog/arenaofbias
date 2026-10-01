import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, ChartNoAxesColumn, PanelsTopLeft, Pause, Play, UserRound } from 'lucide-react';
import { ThemeToggle } from '../components/theme-toggle';
import { LanguageSwitch } from '../components/language-switch';
import { LegalFooter } from '../components/legal-footer';
import { useI18n } from '../lib/locale';
import { initTheme } from '../lib/theme';
import '../app/spatial-fonts.css';
import '../app/globals.css';
import '../app/home.css';
import '../app/home-next.css';
import '../app/theme.css';
import '../app/site-scale.css';
import './hero-review.css';

// Local design study only: no account provider, remote catalogue, ratings, votes,
// analytics, or API imports. These are prompt covers, not competing model works.
// Names and assets: docs/artwork/2026-10-01-prompt-covers.md, with catalogue titles
// checked against the saved public prompts snapshot from 2026-10-01.
const dossiers = [
  {
    id: '016',
    title: ['云山巨城', 'City among the clouds'],
    caption: ['在群山之间，造一座属于想象的城。', 'Build an imagined city between mountains.'],
    type: ['体素世界', 'VOXEL WORLD'],
    cover: '/art/prompt-cover-016.webp',
    alt: ['云雾与瀑布之间的中式体素建筑群', 'A Chinese voxel city among clouds and waterfalls'],
  },
  {
    id: '009',
    title: ['桌面微缩铁路小镇', 'A miniature railway town'],
    caption: ['让一列小火车，串起一个完整的世界。', 'Let a little train bring a whole world together.'],
    type: ['微缩场景', 'MINIATURE WORLD'],
    cover: '/art/prompt-cover-009.webp',
    alt: ['微缩小镇、铁路、河流与红色列车', 'A miniature town, railway, river and red train'],
  },
  {
    id: '019',
    title: ['雨中荷塘', 'Lotus pond in the rain'],
    caption: ['一场雨，落进光影与水波的细节里。', 'A passing rain, a study in light and ripples.'],
    type: ['自然模拟', 'NATURE STUDY'],
    cover: '/art/prompt-cover-019.webp',
    alt: ['细雨中的荷花、荷叶与水面涟漪', 'Lotus flowers, leaves and rippling water in the rain'],
  },
] as const;

const ribs = Array.from({ length: 36 }, (_, index) => ({
  column: index % 12,
  row: Math.floor(index / 12),
}));

function HeroReview() {
  const { language, t } = useI18n();
  const en = language === 'en';
  const lang = en ? 1 : 0;
  const [selected, setSelected] = useState(0);
  const [still, setStill] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const active = dossiers[selected];
  const pick = (index: number, focus = false) => {
    const next = (index + dossiers.length) % dossiers.length;
    setSelected(next);
    if (focus) tabs.current[next]?.focus();
  };

  useEffect(() => {
    document.title = en ? 'Hero design study · Arena of Bias' : 'Hero 设计预览 · 偏见试验场';
  }, [en]);

  const onArchiveKey = (event: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const focused = tabs.current.findIndex(tab => tab === event.currentTarget);
    const from = focused >= 0 ? focused : selected;
    pick(event.key === 'Home' ? 0 : event.key === 'End' ? dossiers.length - 1 : from + (event.key === 'ArrowRight' ? 1 : -1), true);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    swipe.current = { x: event.clientX, y: event.clientY };
    swiped.current = false;
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = swipe.current;
    if (!start || !event.isPrimary) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.3) {
      // Capture on the stable stage only after recognizing a swipe. A simple
      // tap still belongs to the cover button; a drag can cross its moving edge.
      event.currentTarget.setPointerCapture(event.pointerId);
    }
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const x = event.clientX - start.x;
    const y = event.clientY - start.y;
    if (Math.abs(x) > 45 && Math.abs(x) > Math.abs(y) * 1.3) {
      swiped.current = true;
      pick(selected + (x < 0 ? 1 : -1));
    }
  };

  return (
    <div className="hero-review" data-still={still}>
      <section className="hr-review-bar" aria-label={en ? 'Design preview controls' : '设计预览工具'}>
        <div className="hr-review-label"><i aria-hidden="true" />{en ? 'Hero design preview' : 'Hero 设计预览'}<span>01 / ARCHIVE</span></div>
        <div className="hr-review-actions">
          <a href="/#home">{en ? 'Original' : '原版对照'}<ArrowUpRight size={13} aria-hidden="true" /></a>
          <button type="button" aria-pressed={still} onClick={() => setStill(!still)}>
            {still ? <Play size={12} aria-hidden="true" /> : <Pause size={12} aria-hidden="true" />}
            {en ? (still ? 'Motion off' : 'Motion on') : (still ? '静止：开' : '静止：关')}
          </button>
        </div>
      </section>

      <div className="hr-shell">
        <header className="next-header hr-header">
          <a href="/#home" className="lobby-brand next-brand" aria-label={t('回到首页')}>
            <span className="lobby-mark" aria-hidden="true">≡</span>
            <span>ARENA OF <b className="brand-tag">BIAS</b></span>
          </a>
          <nav aria-label={t('主导航')}>
            <a href="https://gallery.arenaofbias.icu/">{t('展览馆')}<ArrowUpRight size={13} aria-hidden="true" /></a>
            <a href="https://gallery.arenaofbias.icu/#/questions">{t('投稿作品')}</a>
          </nav>
          <div className="next-utilities hr-header-utilities">
            <ThemeToggle />
            <LanguageSwitch />
            <button type="button" className="hr-account" disabled title={en ? 'Account is unavailable in this design preview' : '设计预览中不启用账号'}>
              <UserRound size={15} aria-hidden="true" /><span>{en ? 'Log in' : '登录'}</span>
            </button>
          </div>
        </header>

        <main className="hr-main">
          <section className="hr-copy" aria-labelledby="hero-title">
            <p className="hr-eyebrow"><span aria-hidden="true" />HUMAN INSTINCT / AI EXPRESSION</p>
            <h1 id="hero-title">{en ? <>Good or not.<br />Your <span>call.</span></> : <>好不好，<br />你说了<span>算。</span></>}</h1>
            <p className="hr-intro">{en ? 'One prompt. Different models. Your instinct.' : '同一提示词，匿名比较模型作品。'}</p>
            <div className="hr-actions">
              <a href="/#play" className="hr-enter"><span>{t('开始评测')}</span><ArrowRight size={27} aria-hidden="true" /></a>
              <a href="/#random" className="hr-random">{t('随机入场')}<ArrowUpRight size={16} aria-hidden="true" /></a>
            </div>
            <nav className="hr-discover" aria-label={t('继续探索')}>
              <a href="/#prompts"><PanelsTopLeft size={18} aria-hidden="true" /><span>{t('提示词库')}</span><ArrowUpRight size={14} aria-hidden="true" /></a>
              <a href="/#rank"><ChartNoAxesColumn size={18} aria-hidden="true" /><span>{t('偏好榜')}</span><ArrowUpRight size={14} aria-hidden="true" /></a>
            </nav>
            <div className="hr-copy-foot" aria-hidden="true"><span>NO RIGHT ANSWER.</span><span>JUST YOURS.</span><ArrowDown size={15} /></div>
          </section>

          <section className="hr-archive" aria-labelledby="archive-label">
            <div className="hr-archive-heading"><span id="archive-label">{en ? 'THE PROMPT ARCHIVE' : '题目档案'}</span><span className="hr-archive-heading-rule" /><span>ARCHIVE / {active.id}</span></div>
            <div
              className="hr-stage"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={() => { swipe.current = null; }}
              onPointerLeave={() => { swipe.current = null; }}
              onClickCapture={(event) => {
                if (!swiped.current) return;
                event.preventDefault();
                event.stopPropagation();
                swiped.current = false;
              }}
            >
              <div className="hr-field" aria-hidden="true">
                <div className="hr-field-floor" />
                {ribs.map(({ column, row }, index) => (
                  <div key={index} className="hr-rib" style={{ '--column': column, '--row': row } as CSSProperties}>
                    <span className="hr-rib-cap" /><span className="hr-rib-face"><i /><small>{String(index + 1).padStart(3, '0')}</small><b>AOB</b><i /></span><span className="hr-rib-edge" />
                  </div>
                ))}
              </div>

              <div className="hr-files">
                {dossiers.map((dossier, index) => {
                  const position = index === selected ? 'active' : index === (selected + 1) % dossiers.length ? 'next' : 'previous';
                  return (
                    <button
                      key={dossier.id}
                      type="button"
                      className="hr-file"
                      data-position={position}
                      onClick={() => pick(index)}
                      aria-label={`${en ? 'Select prompt' : '选择题目'} ${dossier.id} ${dossier.title[lang]}`}
                      aria-pressed={selected === index}
                      tabIndex={-1}
                    >
                      <span className="hr-file-back" aria-hidden="true" />
                      <span className="hr-file-edge" aria-hidden="true" />
                      <span className="hr-file-top" aria-hidden="true" />
                      <span className="hr-file-cover">
                        <span className="hr-file-head"><b>AOB</b><span>PROMPT / {dossier.id}</span><span className="hr-file-plus" aria-hidden="true">+</span></span>
                        <span className="hr-file-image"><img src={dossier.cover} alt={dossier.alt[lang]} draggable="false" decoding="async" /></span>
                        <span className="hr-file-caption"><span>{dossier.type[lang]}</span><span>{en ? 'PROMPT COVER' : '题目封面'}</span></span>
                        <span className="hr-file-name">{dossier.title[lang]}</span>
                        <span className="hr-file-foot"><span>ARENA OF BIAS</span><span className="hr-barcode" aria-hidden="true" /><b>{dossier.id}</b></span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <span className="hr-stage-cross hr-stage-cross-a" aria-hidden="true">+</span>
              <span className="hr-stage-cross hr-stage-cross-b" aria-hidden="true">+</span>
              <span className="hr-stage-note">{en ? 'PROMPT COVERS / EXPLORE' : '题目封面 / 滑动浏览'}</span>
            </div>

            <div className="hr-archive-bottom">
              <div className="hr-active-info" aria-live="polite" aria-atomic="true">
                <div className="hr-active-kicker"><i aria-hidden="true" /><span>{en ? 'SELECTED PROMPT' : '当前题目'}</span><span>/{active.id}</span></div>
                <h2>{active.title[lang]}</h2>
                <p>{active.caption[lang]}</p>
              </div>
              <fieldset className="hr-browse" aria-label={en ? 'Select an archive; arrow keys to browse' : '选择题目档案；左右键浏览'}>
                <div className="hr-browse-top"><span>{String(selected + 1).padStart(2, '0')}<small> / 03</small></span><div className="hr-arrows"><button type="button" aria-label={en ? 'Previous prompt' : '上一个题目'} onKeyDown={onArchiveKey} onClick={() => pick(selected - 1)}><ArrowLeft size={21} aria-hidden="true" /></button><button type="button" aria-label={en ? 'Next prompt' : '下一个题目'} onKeyDown={onArchiveKey} onClick={() => pick(selected + 1)}><ArrowRight size={21} aria-hidden="true" /></button></div></div>
                <div className="hr-index">
                  {dossiers.map((dossier, index) => <button key={dossier.id} ref={(node) => { tabs.current[index] = node; }} type="button" tabIndex={index === selected ? 0 : -1} aria-pressed={index === selected} aria-label={`${en ? 'Select prompt' : '选择题目'} ${dossier.id} ${dossier.title[lang]}`} onKeyDown={onArchiveKey} onClick={() => pick(index)}><span>{dossier.id}</span><i aria-hidden="true" /></button>)}
                </div>
              </fieldset>
            </div>
          </section>
        </main>
        <LegalFooter />
      </div>
    </div>
  );
}

const disposeTheme = initTheme();
const root = createRoot(document.getElementById('hero-review-root')!);
root.render(<HeroReview />);
if (import.meta.hot) import.meta.hot.dispose(() => { root.unmount(); disposeTheme(); });
