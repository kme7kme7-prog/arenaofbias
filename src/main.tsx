import { useI18n } from '@/lib/locale';
import { AccountProvider, useAccount } from '@/components/account';
import '@/app/account.css';
import { createRoot } from 'react-dom/client';
import { Component, Suspense, lazy, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import Home from '@/app/home';
import { DevPanel } from '@/components/dev-panel';
import { PageShare } from '@/components/share';
import { parseSharedDuel, resolveSharedDuel } from '@/lib/shared-duel';
import '@/app/share.css';
import { currentPairCount, currentRandomArenaHash, isPlaceholderMode } from '@/lib/placeholder';
import { currentResultsForPrompt } from '@/lib/placeholder';
import {
  currentPrompts,
  getPromptsState,
  loadPrompts,
  subscribePrompts,
} from '@/lib/prompts';
import { trackPageView } from '@/lib/track';
import { getWorksState, loadWorks, subscribeWorks } from '@/lib/works';
// observatory.css 保留：Event 页与其中的品牌排版（MiSans 字标）仍在使用，
// 其 @import 的 spatial-fonts.css 同时为经典版移植的品牌字体供字体
import '@/app/observatory.css';
import '@/app/globals.css';
import '@/app/game-transitions.css';
import '@/app/home.css';
import '@/app/library.css';
import '@/app/dev.css';
import '@/app/ranking.css';
import '@/app/arena-refinement.css';
// 模一把（决策 057）：独立玩法页样式，在全局样式后加载
import '@/app/guess.css';
import { getLocale, translate } from '@/lib/locale';
import { setTransitionTranslator } from '@/lib/game-transitions';
import { setWipeTranslator } from '@/lib/ui-transitions';
import { initTheme } from '@/lib/theme';
import { settlePortalHome } from '@/lib/portal-entry';
import '@/app/theme.css';
import '@/app/site-scale.css';
const disposeTheme = initTheme();
if (import.meta.hot) import.meta.hot.dispose(disposeTheme);
setWipeTranslator((text) => translate(text, getLocale()));
setTransitionTranslator((text) => translate(text, getLocale()));

const container = document.getElementById('root');
const sharedDuel = parseSharedDuel(window.location.search);
if (!container) throw new Error('Missing #root mount point');

// The landing page stays immediate. Games and secondary pages
// load on demand, with an explicit recovery path if a chunk cannot be fetched.
const PlayMenu = lazy(() => import('@/app/play-menu'));
const Arena = lazy(() => import('@/app/page'));
const Event = lazy(() => import('@/app/event'));
const GuessPage = lazy(() => import('@/app/guess'));
const GuessFriendsPage = lazy(() => import('@/app/guess-friends'));
const PromptLibrary = lazy(() => import('@/app/prompt-library'));
const PromptPreview = lazy(() => import('@/app/prompt-preview'));
const Ranking = lazy(() => import('@/app/ranking'));
const LegalPage = lazy(() => import('@/app/legal'));

function RouteLoading() {
  const { t } = useI18n();
  return <output className="route-empty" aria-live="polite">{t('正在接入试验场')}</output>;
}
function RouteFailure() {
  const { language, t } = useI18n();
  return <div className="route-empty library-empty" role="alert">
    <h1>{language === 'en' ? 'This page could not be loaded.' : '页面暂时无法加载。'}</h1>
    <button type="button" onClick={() => window.location.reload()}>{t('重试')}</button>
  </div>;
}
class RouteBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <RouteFailure /> : this.props.children; }
}

// 与旧版一致：不启用 StrictMode，避免入场动画相关 effect 在开发模式重复执行。
function subscribeRoute(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
// 作品清单（服务端 works 表）就绪后重渲染，让 currentPairs 等
// 数据消费方从内置花名册切到远端清单（决策 040）
// Arena routes need the live catalog; after the retries a clear failure replaces any built-in stand-in.
function CatalogFailure() {
  const { t } = useI18n();
  return (
    <div className="route-empty library-empty" role="alert">
      <h1>{t('题库暂时连不上')}</h1>
      <p>{t('题库连接失败，请检查网络后重试。')}</p>
      <button type="button" onClick={() => { void loadPrompts(); void loadWorks(); }}>{t('重试')}</button>
    </div>
  );
}
function Routes() {
  const { t } = useI18n();
  const { user, loading: authLoading } = useAccount();
  const route = useSyncExternalStore(
    subscribeRoute,
    () => window.location.hash,
    () => '',
  );
  const worksState = useSyncExternalStore(subscribeWorks, getWorksState);
  // 动态题库（决策 045）：远端题目就绪后重渲染，消费方从内置种子切到服务端题库
  const promptsState = useSyncExternalStore(subscribePrompts, getPromptsState);
  const catalogRequired = route === '#prompts' || route === '#arena' || route === '#random'
    || route.startsWith('#arena/') || (route.startsWith('#formal/') && user?.role === 'admin')
    || ((route === '#rank' || route === '#rank/formal') && isPlaceholderMode());
  useEffect(() => {
    if (!catalogRequired) return;
    const recoverCatalogs = () => { void loadPrompts(); void loadWorks(); };
    recoverCatalogs();
    window.addEventListener('online', recoverCatalogs);
    return () => window.removeEventListener('online', recoverCatalogs);
    // Requests belong to the shared stores. Leaving a route removes this
    // listener, but cannot cancel a read another consumer is waiting for.
  }, [catalogRequired, route]);
  useEffect(() => settlePortalHome(container!, catalogRequired), [route, catalogRequired, worksState.status, promptsState.status]);
  useEffect(() => {
    const arenaPromptId = route.startsWith('#arena/')
      ? route.slice(7)
      : route.startsWith('#formal/')
        ? route.slice(8)
        : '';
    if (!arenaPromptId || currentPairCount(arenaPromptId, route.startsWith('#formal/') ? 'formal' : 'entertainment') === 0)
      window.scrollTo(0, 0);
    if (route === '#arena' || route === '#random') {
      // 等题目和作品清单都就绪再随机抽题：用内置兜底清单抽题
      // 会落到远端实际未就绪的题上（如 002 兜底可配、远端只有 1 件已发布）
      if (worksState.status !== 'ready' || promptsState.status !== 'ready') return;
      window.location.replace(currentRandomArenaHash());
    }
  }, [route, worksState.status, promptsState.status]);
  const catalogFailed = worksState.status === 'error' || promptsState.status === 'error';
  if (catalogFailed && (route === '#arena' || route === '#random' || route.startsWith('#arena/') || route.startsWith('#formal/')))
    return <CatalogFailure />;
  if (route === '#arena' || route === '#random') return null;
  if (route === '#terms' || route.startsWith('#terms/'))
    return <LegalPage key="terms" kind="terms" section={route.slice(7) || undefined} />;
  if (route === '#privacy' || route.startsWith('#privacy/'))
    return <LegalPage key="privacy" kind="privacy" section={route.slice(9) || undefined} />;
  if (route === '#play') return <PlayMenu />;
  if (route === '#event') return <Event />;
  if (route === '#guess') return <GuessPage />;
  if (route === '#guess-friends') return <GuessFriendsPage />;
  if (route === '#prompts') return <PromptLibrary />;
  if (route === '#rank') return <Ranking />;
  if (route === '#rank/formal') return <Ranking key="formal" initialScope="formal" />;
  if (route.startsWith('#formal/')) {
    if (authLoading) return <output className="route-empty">{t('正在接入试验场')}</output>;
    if (user?.role !== 'admin') return <PlayMenu />;
    if (isPlaceholderMode()) return <div className="route-empty"><p>{t('正式测评使用真实作品，请先关闭占位模式。')}</p><a href="#play">{t('正式测评')}</a></div>;
    const prompt = currentPrompts().find((item) => item.id === route.slice(8));
    // 清单加载中先不判型（2026-09-20 审查修复）：用内置兜底挂载竞技场后，
    // 远端清单到达可能把页面换成预览页，入场序列被中途卸载
    if (worksState.status === 'loading' || promptsState.status === 'loading')
      return <output className="route-empty">{t('正在接入试验场')}</output>;
    if (prompt && currentPairCount(prompt.id, 'formal') > 0)
      return <Arena key={`formal-${prompt.id}`} prompt={prompt} formal />;
    if (prompt)
      return <PromptPreview key={`formal-${prompt.id}`} prompt={prompt} />;
    return (
      <div className="route-empty">
        <h1>{t('这个竞技场还未就绪。')}</h1>
        <p>{t('请从提示词库选择一个可比较的提示词。')}</p>
        <a href="#prompts">{t('前往提示词库 ↗')}</a>
      </div>
    );
  }
  if (route.startsWith('#arena/')) {
    const prompt = currentPrompts().find((item) => item.id === route.slice(7));
    if (sharedDuel && sharedDuel[0] === route.slice(7)) {
      if (worksState.status === 'loading' || getPromptsState().status === 'loading') return <output className="route-empty">{t('正在打开分享的对决…')}</output>;
      const pair = resolveSharedDuel(sharedDuel, currentResultsForPrompt(sharedDuel[0]));
      if (prompt && pair && !pair.some(work => work.isDemo) && worksState.status === 'ready' && worksState.source === 'remote' && currentPairCount(prompt.id) > 0) return <Arena key={`shared-${prompt.id}`} prompt={prompt} initialPair={pair} />;
      if (prompt && currentPairCount(prompt.id) === 0) return <PromptPreview key={prompt.id} prompt={prompt} />;
      return <div className="route-empty"><h1>{t('这场对决暂时无法打开。')}</h1><p>{t('作品可能已下架，请从题库选择另一场。')}</p><a href="#prompts">{t('前往提示词库 ↗')}</a></div>;
    }
    if (worksState.status === 'loading' || promptsState.status === 'loading')
      return <output className="route-empty">{t('正在接入试验场')}</output>;
    if (prompt && currentPairCount(prompt.id) > 0)
      return <Arena key={prompt.id} prompt={prompt} />;
    if (prompt) return <PromptPreview key={prompt.id} prompt={prompt} />;
    return (
      <div className="route-empty">
        <h1>{t('这个竞技场还未就绪。')}</h1>
        <p>{t('请从提示词库选择一个可比较的提示词。')}</p>
        <a href="#prompts">{t('前往提示词库 ↗')}</a>
      </div>
    );
  }
  return <Home />;
}
const reactRoot = createRoot(container);
if (import.meta.hot) import.meta.hot.dispose(() => reactRoot.unmount());
// Full catalogs start only on routes that consume them. Track this visit once.
trackPageView(`/#${(window.location.hash || '#home').slice(1)}`);
reactRoot.render(
  <AccountProvider>
    <RouteBoundary><Suspense fallback={<RouteLoading />}><Routes /></Suspense></RouteBoundary>
    <PageShare />
    <DevPanel />
  </AccountProvider>,
);
