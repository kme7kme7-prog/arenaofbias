import { useI18n } from '@/lib/locale';
import { AccountProvider, useAccount } from '@/components/account';
import '@/app/account.css';
import { createRoot } from 'react-dom/client';
import Arena from '@/app/page';
import { useEffect, useSyncExternalStore } from 'react';
import PlayMenu from '@/app/play-menu';
import Event from '@/app/event';
import GuessPage from '@/app/guess';
import Home from '@/app/home';
import PromptLibrary from '@/app/prompt-library';
import PromptPreview from '@/app/prompt-preview';
import Ranking from '@/app/ranking';
import LegalPage from '@/app/legal';
import { DevPanel } from '@/components/dev-panel';
import { PageShare } from '@/components/share';
import { parseSharedDuel, resolveSharedDuel } from '@/lib/shared-duel';
import '@/app/share.css';
import { currentPairs, currentRandomArenaHash, isPlaceholderMode } from '@/lib/placeholder';
import { currentResultsForPrompt } from '@/lib/placeholder';
import {
  currentPrompts,
  getPromptsState,
  loadPrompts,
  subscribePrompts,
} from '@/lib/prompts';
import { loadRatings } from '@/lib/ratings';
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

// 与旧版一致：不启用 StrictMode，避免入场动画相关 effect 在开发模式重复执行。
function subscribeRoute(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
// 作品清单（服务端 works 表）就绪后重渲染，让 currentPairs 等
// 数据消费方从内置花名册切到远端清单（决策 040）
function Routes() {
  useEffect(() => settlePortalHome(container!), []);
  const { t } = useI18n();
  const { user, loading: authLoading } = useAccount();
  const route = useSyncExternalStore(
    subscribeRoute,
    () => window.location.hash,
    () => '',
  );
  const worksState = useSyncExternalStore(subscribeWorks, getWorksState);
  // 动态题库（决策 045）：远端题目就绪后重渲染，消费方从内置种子切到服务端题库
  useSyncExternalStore(subscribePrompts, getPromptsState);
  useEffect(() => {
    const arenaPromptId = route.startsWith('#arena/')
      ? route.slice(7)
      : route.startsWith('#formal/')
        ? route.slice(8)
        : '';
    if (!arenaPromptId || currentPairs(arenaPromptId).length === 0)
      window.scrollTo(0, 0);
    if (route === '#arena' || route === '#random') {
      // 等作品清单就绪再随机抽题（2026-09-20 审查修复）：用内置兜底清单抽题
      // 会落到远端实际未就绪的题上（如 002 兜底可配、远端只有 1 件已发布）
      if (worksState.status !== 'ready') return;
      window.location.replace(currentRandomArenaHash());
    }
  }, [route, worksState.status]);
  if (route === '#arena' || route === '#random') return null;
  if (route === '#terms' || route.startsWith('#terms/'))
    return <LegalPage key="terms" kind="terms" section={route.slice(7) || undefined} />;
  if (route === '#privacy' || route.startsWith('#privacy/'))
    return <LegalPage key="privacy" kind="privacy" section={route.slice(9) || undefined} />;
  if (route === '#play') return <PlayMenu />;
  if (route === '#event') return <Event />;
  if (route === '#guess') return <GuessPage />;
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
    if (worksState.status === 'loading')
      return <output className="route-empty">{t('正在接入试验场')}</output>;
    if (prompt && currentPairs(prompt.id).length > 0)
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
      if (prompt && pair && worksState.source === 'remote') return <Arena key={`shared-${prompt.id}`} prompt={prompt} initialPair={pair} />;
      return <div className="route-empty"><h1>{t('这场对决暂时无法打开。')}</h1><p>{t('作品可能已下架，请从题库选择另一场。')}</p><a href="#prompts">{t('前往提示词库 ↗')}</a></div>;
    }
    if (worksState.status === 'loading')
      return <output className="route-empty">{t('正在接入试验场')}</output>;
    if (prompt && currentPairs(prompt.id).length > 0)
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
// 应用启动即拉取服务端作品清单；拉不到时 lib/works.ts 会回退内置花名册。
// 同时上报一次页面浏览（含初始 hash 路由，后台访客统计用）
trackPageView(`/#${(window.location.hash || '#home').slice(1)}`);
loadWorks();
loadPrompts(); // 动态题库（决策 045）
loadRatings(); // 声望分：软性匹配的数据源（决策 046）
loadRatings('formal'); // 正式匹配使用独立快照，不借用娱乐分数或出场数。
reactRoot.render(
  <AccountProvider>
    <Routes />
    <PageShare />
    <DevPanel />
  </AccountProvider>,
);
