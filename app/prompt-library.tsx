import { entertainmentWorkCount, ENTERTAINMENT_MIN_WORKS } from '@/lib/arena';
import { LegalFooter } from '@/components/legal-footer';
import { ThemeToggle } from '@/components/theme-toggle';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { PromptVariantSwitch } from '@/components/prompt-variant-switch';
import {
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Shuffle,
  ChevronDown,
  X,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bike,
} from 'lucide-react';
import { convoyNavigate } from '@/lib/game-transitions';
import { revealLibrary } from '@/lib/library-motion';
import { currentPrompts, getPromptsState, loadPrompts, subscribePrompts } from '@/lib/prompts';
import { getWorksState, loadWorks, subscribeWorks } from '@/lib/works';
import { GALLERY_QUESTIONS } from '@/lib/gallery-links';
import type { Prompt } from '@/lib/arena';
import {
  currentPairs,
  currentResultsForPrompt,
  isPlaceholderMode,
} from '@/lib/placeholder';
import './prompt-archive.css';

const filters = [
  ['all', '全部'],
  ['text', '文字'],
  ['web', '网页'],
  ['image', '图像'],
] as const;
// 封面是题目意象，与参赛作品无关；未配置的新题使用图集最后一格通用封面。
const coverIds = ['001', '002', '003', '004', '005', '006', '007'];
const individualCoverIds = new Set([
  '008', '009', '010', '011', '012', '013', '014', '016', '018',
  '019', '020', '021', '022', '023', '024', '025', '026', '027',
  'q-5ebd7c84dff7cd8f', 'q-7520307699d6010e',
  'q-c7e65f283bc453a5', 'q-d9886c5bbd71a318',
]);
const motionQuery = '(prefers-reduced-motion: reduce)';
const PAGE_SIZE = 8;
function subscribeMotion(callback: () => void) {
  const media = window.matchMedia(motionQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
const reducedMotion = () => window.matchMedia(motionQuery).matches;
function coverStyle(id: string): CSSProperties {
  if (individualCoverIds.has(id))
    return {
      '--cover-x': '50%',
      '--cover-y': '50%',
      '--cover-bg': 'var(--cover-0)',
      '--cover-image': `url('/art/prompt-cover-${id}.webp')`,
      '--cover-size': 'cover',
    } as CSSProperties;
  const index = coverIds.includes(id) ? coverIds.indexOf(id) : 7;
  const backgrounds = [
    'var(--cover-1)',
    'var(--cover-2)',
    'var(--cover-3)',
    'var(--cover-4)',
    'var(--cover-5)',
    'var(--cover-6)',
    'var(--cover-7)',
    'var(--cover-8)',
  ];
  return {
    '--cover-x': `${(index % 2) * 100}%`,
    '--cover-y': `${(Math.floor(index / 2) * 100) / 3}%`,
    '--cover-bg': backgrounds[index],
    '--cover-image': "url('/art/prompt-covers-natural.webp')",
    '--cover-size': '200% 400%',
  } as CSSProperties;
}
function promptStats(id: string) {
  const results = currentResultsForPrompt(id);
  const entries = results.filter((result) => !result.isDemo);
  return {
    models: new Set(entries.map((result) => result.modelId)).size,
    works: entertainmentWorkCount(id, results),
    samples: results.filter((result) => result.isDemo).length,
    ready: currentPairs(id).length > 0,
  };
}
function PromptDossier({ prompt }: { prompt: Prompt }) {
  const { t, localize } = useI18n();
  const reduced = useSyncExternalStore(
    subscribeMotion,
    reducedMotion,
    () => true,
  );
  const panel = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [variant, setVariant] = useState(prompt.promptVariants?.[0]?.id ?? '');
  const promptText = prompt.promptVariants?.find((item) => item.id === variant)?.prompt ?? prompt.prompt;
  const stats = promptStats(prompt.id);
  const long = promptText.length > 180;
  useLayoutEffect(
    () => (panel.current ? revealLibrary(panel.current) : undefined),
    [],
  );
  return (
    <article
      className="archive-dossier"
      id="prompt-dossier"
      aria-labelledby="dossier-title"
      ref={panel}
    >
      <div
        className={`archive-cover ${prompt.id === '001' ? 'archive-cover-live' : ''}`}
        style={coverStyle(prompt.id)}
      >
        {prompt.id === '001' ? (
          <iframe
            className="archive-pelican"
            src={`/art/pelican-cover.html${reduced ? '?motion=reduce' : ''}`}
            title={t('鹈鹕骑行 SVG 动画演示')}
            sandbox="allow-scripts"
          />
        ) : (
          <>
            <div className="archive-cover-haze" aria-hidden="true" />
            <div className="archive-cover-drift" aria-hidden="true">
              <div className="archive-cover-art" />
            </div>
          </>
        )}
        <div className="archive-cover-shutter" />
      </div>
      <div className="archive-caption">
        <span>
          {localize(prompt.code)} / {localize(prompt.category)}
        </span>
        <span>
          {localize(
            prompt.id === '001'
              ? 'SVG 动画演示，非参赛作品'
              : '题目意象，非参赛作品',
          )}
        </span>
      </div>
      <div className="archive-dossier-body">
        <div className="archive-title-line" data-library-reveal>
          <div>
            <p className="archive-selected-label">{t('当前命题')}</p>
            <h2 id="dossier-title">{prompt.name}</h2>
          </div>
          <span className="archive-dossier-number" data-long-id={prompt.id.length > 3 || undefined} title={prompt.id} aria-hidden="true">
            {localize(prompt.id)}
          </span>
        </div>
        {localize(
          prompt.commentary && (
            <p className="archive-commentary" data-library-reveal>
              {localize(prompt.commentary)}
            </p>
          ),
        )}
        <section
          className="archive-brief"
          aria-label={t('提示词原文')}
          data-library-reveal
        >
          <div className="archive-brief-heading">
            <span>{t('命题原文')}</span>
            <span>
              {promptText.length} {t('字符')}
            </span>
          </div>
          <PromptVariantSwitch prompt={prompt} selected={variant} onChange={(id) => {
            setVariant(id); setExpanded(false);
          }} />
          <div
            id={`brief-${prompt.id}`}
            className={`archive-brief-text ${long && !expanded ? 'is-collapsed' : ''}`}
          >
            {promptText}
          </div>
          {long && (
            <button
              className="archive-expand"
              aria-expanded={expanded}
              aria-controls={`brief-${prompt.id}`}
              onClick={() => setExpanded((value) => !value)}
            >
              {localize(expanded ? '收起命题' : '展开完整命题')}
              <ChevronDown size={15} />
            </button>
          )}
        </section>
        <div className="archive-dossier-bottom" data-library-reveal>
          <div className="archive-roster">
            <span>
              <b>{localize(stats.models.toString().padStart(2, '0'))}</b>{' '}
              {t('个模型')}
            </span>
            <span>
              <b>{localize(stats.works.toString().padStart(2, '0'))}</b>{' '}
              {t('份结果')}
            </span>
            {!stats.ready && stats.works < ENTERTAINMENT_MIN_WORKS && (
              <small>{t('作品收集中（{count}/{minimum}），暂未开放娱乐盲测', { count: stats.works, minimum: ENTERTAINMENT_MIN_WORKS })}</small>
            )}
            {stats.samples > 0 && (
              <small>
                {t('另有')}
                {stats.samples} {t('份演示样例')}
              </small>
            )}
          </div>
          <a
            className="archive-enter"
            href={GALLERY_QUESTIONS}
          >
            <span>
              {t('前往展览馆')}
              <small>
                {t('浏览提示词与作品')}
              </small>
            </span>
            <ArrowUpRight size={27} />
          </a>
        </div>
      </div>
    </article>
  );
}
export default function PromptLibrary() {
  const { t, localize } = useI18n();
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const focusSelection = useRef(false);
  const promptsState = useSyncExternalStore(subscribePrompts, getPromptsState);
  const worksState = useSyncExternalStore(subscribeWorks, getWorksState);
  const catalogLoading = promptsState.status === 'loading' || worksState.status === 'loading';
  const catalogUnavailable = (promptsState.status === 'ready' && promptsState.source === 'builtin') ||
    (worksState.status === 'ready' && worksState.source === 'builtin');
  const prompts = currentPrompts();
  const visible = prompts.filter(
    (prompt) =>
      (kind === 'all' || prompt.kind === kind) &&
      `${prompt.id} ${prompt.name} ${prompt.prompt} ${prompt.category}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const selected =
    visible.find((prompt) => prompt.id === selectedId) ?? visible[0];
  const selectedIndex = selected
    ? visible.findIndex((prompt) => prompt.id === selected.id)
    : -1;
  // Derive the page from selection so dossier navigation and the directory agree.
  const page = Math.floor(Math.max(0, selectedIndex) / PAGE_SIZE);
  const pageCount = Math.ceil(visible.length / PAGE_SIZE);
  const pageStart = page * PAGE_SIZE;
  const pagePrompts = visible.slice(pageStart, pageStart + PAGE_SIZE);
  const readyCount = prompts.filter(
    (prompt) => currentPairs(prompt.id).length > 0,
  ).length;
  const visibleKey = pagePrompts.map((prompt) => prompt.id).join(',');
  useLayoutEffect(
    () => (list.current ? revealLibrary(list.current) : undefined),
    [visibleKey],
  );
  useLayoutEffect(() => {
    const container = list.current;
    const option = container?.querySelector<HTMLElement>(
      '[aria-pressed="true"]',
    );
    if (!container || !option) return;
    if (focusSelection.current) {
      option.focus({ preventScroll: true });
      focusSelection.current = false;
    }
    const alignSelection = () => {
      if (container.scrollWidth <= container.clientWidth) return;
      const left =
        container.scrollLeft +
        option.getBoundingClientRect().left -
        container.getBoundingClientRect().left;
      container.scrollTo({
        left: left - (container.clientWidth - option.clientWidth) / 2,
        behavior: reducedMotion() ? 'instant' : 'smooth',
      });
    };
    alignSelection();
    const observer = new ResizeObserver(alignSelection);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selected?.id, visibleKey]);
  function moveSelection(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    const next =
      event.key === 'ArrowDown'
        ? (index + 1) % visible.length
        : event.key === 'ArrowUp'
          ? (index + visible.length - 1) % visible.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? visible.length - 1
              : -1;
    if (next < 0) return;
    event.preventDefault();
    focusSelection.current = true;
    setSelectedId(visible[next].id);
  }
  function reset() {
    setQuery('');
    setKind('all');
    setSelectedId(null);
  }
  return (
    <div className="lobby prompt-library prompt-archive">
      <header className="lobby-header">
        <a
          className="lobby-brand"
          href="#home"
          aria-label={t('回到首页')}
          onClick={(event) => {
            event.preventDefault();
            // 入场是一体斜幕，退出走同款对称
            convoyNavigate('#home', 'PROMPT LIBRARY');
          }}
        >
          <span className="lobby-mark">≡</span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('偏见试验场 / PROMPT LIBRARY')}</small>
          </span>
        </a>
        <a
          className="archive-back"
          href="#home"
          onClick={(event) => {
            event.preventDefault();
            convoyNavigate('#home', 'PROMPT LIBRARY');
          }}
        >
          <ArrowLeft size={15} />
          {t('首页')}
        </a>
        <a
          className="lobby-small-entry"
          href="#random"
          aria-label={t('随机入场')}
        >
          <Shuffle size={15} />
          {t('随机入场')}
        </a>
        <LanguageSwitch />
        <ThemeToggle />
          <AccountButton />
      </header>
      <main className="archive-main">
        <section className="archive-heading" aria-labelledby="archive-heading">
          <div className="archive-heading-copy">
            <p className="archive-eyebrow">{t('THE PROMPT COLLECTION')}</p>
            <h1 id="archive-heading">
              {t('问题相同')}
              <span>{t('。答案不同。')}</span>
            </h1>
            <p>{t('从一个好问题开始，看看 AI 能走多远。')}</p>
          </div>
          <div
            className="archive-summary"
            aria-label={t('{prompts} 道命题，{arenas} 个竞技场可进入', {
              prompts: prompts.length,
              arenas: readyCount,
            })}
          >
            <strong>
              {localize(prompts.length.toString().padStart(2, '0'))}
            </strong>
            <span>
              {t('道命题')}
              <br />
              <b>
                {readyCount} {t('个可进入竞技场')}
              </b>
            </span>
          </div>
        </section>
        {(catalogLoading || catalogUnavailable) && (
          <output className="archive-load-notice">
            <span>{t(catalogLoading
              ? '正在同步展览馆题目与作品…'
              : '展览馆数据未能加载完整，当前显示临时内容。')}</span>
            <button
              type="button"
              disabled={catalogLoading}
              onClick={() => { void loadPrompts(); void loadWorks(); }}
            >
              {t(catalogLoading ? '正在加载…' : '重新加载')}
            </button>
          </output>
        )}
        <div className="archive-toolbar">
          <div className="archive-filters" aria-label={t('按作品类型筛选')}>
            {filters.map(([value, label]) => (
              <button
                key={value}
                aria-pressed={kind === value}
                onClick={() => { setKind(value); setSelectedId(null); }}
              >
                <span>{localize(label)}</span>
                <small>
                  {value === 'all'
                    ? prompts.length
                    : prompts.filter((prompt) => prompt.kind === value).length}
                </small>
              </button>
            ))}
          </div>
          <label className="archive-search">
            <Search size={18} />
            <input
              aria-label={t('搜索提示词')}
              placeholder={t('搜索题目、关键词或编号')}
              value={query}
              onChange={(event) => { setQuery(event.target.value); setSelectedId(null); }}
            />
            {localize(
              query && (
                <button
                  type="button"
                  aria-label={t('清空搜索')}
                  onClick={() => { setQuery(''); setSelectedId(null); }}
                >
                  <X size={16} />
                </button>
              ),
            )}
          </label>
        </div>
        <div className="archive-workspace">
          <aside className="archive-index" aria-label={t('命题目录')}>
            <div className="archive-index-heading">
              <span>{t('选择一道命题')}</span>
              <output aria-live="polite">
                {visible.length} / {prompts.length}
              </output>
            </div>
            <div className="archive-options" id="prompt-directory" ref={list}>
              {pagePrompts.map((prompt, index) => {
                const stats = promptStats(prompt.id);
                return (
                  <div key={prompt.id} data-library-reveal>
                    <button
                      className="archive-option"
                      aria-pressed={selected?.id === prompt.id}
                      aria-controls="prompt-dossier"
                      onClick={() => setSelectedId(prompt.id)}
                      onKeyDown={(event) => moveSelection(event, pageStart + index)}
                    >
                      <span className="archive-option-number" data-long-id={prompt.id.length > 3 || undefined} title={prompt.id}>
                        {localize(prompt.id)}
                      </span>
                      {prompt.id === '001' ? (
                        <span
                          className="archive-thumb archive-thumb-live"
                          aria-hidden="true"
                        >
                          <Bike size={29} strokeWidth={1.5} />
                        </span>
                      ) : (
                        <span
                          className="archive-thumb"
                          style={coverStyle(prompt.id)}
                          aria-hidden="true"
                        />
                      )}
                      <span className="archive-option-copy">
                        <b>{prompt.name}</b>
                        <small>
                          {localize(prompt.category)}
                          <span className={stats.ready ? 'is-ready' : ''}>
                            {localize(
                              stats.ready
                                ? '可比较'
                                : stats.works
                                  ? '待配对'
                                  : '待收录',
                            )}
                          </span>
                        </small>
                      </span>
                      <ArrowUpRight
                        className="archive-option-arrow"
                        size={18}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
            {pageCount > 1 && (
              <nav className="archive-pagination" aria-label={t('命题目录分页')}>
                <button aria-label={t('上一页')} aria-controls="prompt-directory"
                  disabled={page === 0} onClick={() => setSelectedId(visible[pageStart - PAGE_SIZE].id)}>
                  <ChevronLeft size={16} />{t('上一页')}
                </button>
                <output aria-live="polite">{page + 1} / {pageCount}</output>
                <button aria-label={t('下一页')} aria-controls="prompt-directory"
                  disabled={page === pageCount - 1} onClick={() => setSelectedId(visible[pageStart + PAGE_SIZE].id)}>
                  {t('下一页')}<ChevronRight size={16} />
                </button>
              </nav>
            )}
            <div className="archive-index-foot">
              <span>
                {localize(
                  isPlaceholderMode()
                    ? '占位符模式 · 开发者预览'
                    : '同一命题，不同可能。',
                )}
              </span>
              <span className="archive-key-hint">{t('↑ ↓ 切换')}</span>
            </div>
          </aside>
          <div className="archive-stage">
            {selected ? (
              <>
                <div className="archive-stage-navigation">
                  <span>
                    {t('命题档案')}
                    <b>{localize(selected.id)}</b>
                  </span>
                  <div>
                    <button
                      aria-label={t('上一道命题')}
                      disabled={selectedIndex <= 0}
                      onClick={() =>
                        setSelectedId(visible[selectedIndex - 1].id)
                      }
                    >
                      <ChevronLeft size={17} />
                    </button>
                    <button
                      aria-label={t('下一道命题')}
                      disabled={selectedIndex >= visible.length - 1}
                      onClick={() =>
                        setSelectedId(visible[selectedIndex + 1].id)
                      }
                    >
                      <ChevronRight size={17} />
                    </button>
                  </div>
                </div>
                <PromptDossier key={selected.id} prompt={selected} />
              </>
            ) : (
              <div className="archive-empty">
                <Search size={36} strokeWidth={1} />
                <h2>
                  {localize(
                    prompts.length
                      ? '这个问题，还没找到。'
                      : '新的命题，正在准备。',
                  )}
                </h2>
                <p>
                  {localize(
                    prompts.length
                      ? '试试其他关键词，或换一种作品类型。'
                      : '题库暂时没有已发布的提示词。',
                  )}
                </p>
                {prompts.length > 0 && (
                  <button onClick={reset}>
                    {t('查看全部提示词')}
                    <ArrowRight size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <footer className="archive-footer">
        <span>{t('ONE PROMPT. DIFFERENT ANSWERS.')}</span>
        <span>{t('先看作品，再作判断。')}</span>
      </footer>
      <LegalFooter />
    </div>
  );
}
