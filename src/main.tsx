import { useI18n } from '@/lib/locale';
import { AccountProvider } from '@/components/account';
import '@/app/account.css';
import { createRoot } from 'react-dom/client';
import Arena from '@/app/page';
import { useEffect, useSyncExternalStore } from 'react';
import PlayMenu from '@/app/play-menu';
import Event from '@/app/event';
import Home from '@/app/home';
import PromptLibrary from '@/app/prompt-library';
import PromptPreview from '@/app/prompt-preview';
import Ranking from '@/app/ranking';
import { DevPanel } from '@/components/dev-panel';
import { currentPairs, currentRandomArenaHash } from '@/lib/placeholder';
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
import { getLocale, translate } from '@/lib/locale';
import { setTransitionTranslator } from '@/lib/game-transitions';
import { setWipeTranslator } from '@/lib/ui-transitions';
setWipeTranslator((text) => translate(text, getLocale()));
setTransitionTranslator((text) => translate(text, getLocale()));

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root mount point');

// 与旧版一致：不启用 StrictMode，避免入场动画相关 effect 在开发模式重复执行。
function subscribeRoute(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
// 作品清单（服务端 works 表）就绪后重渲染，让 currentPairs 等
// 数据消费方从内置花名册切到远端清单（决策 040）
function Routes() {
  const { t } = useI18n();
  const route = useSyncExternalStore(
    subscribeRoute,
    () => window.location.hash,
    () => '',
  );
  useSyncExternalStore(subscribeWorks, getWorksState);
  // 动态题库（决策 045）：远端题目就绪后重渲染，消费方从内置种子切到服务端题库
  useSyncExternalStore(subscribePrompts, getPromptsState);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (route === '#arena' || route === '#random') {
      window.location.replace(currentRandomArenaHash());
    }
  }, [route]);
  if (route === '#arena' || route === '#random') return null;
  if (route === '#play') return <PlayMenu />;
  if (route === '#event') return <Event />;
  if (route === '#prompts') return <PromptLibrary />;
  if (route === '#rank') return <Ranking />;
  if (route.startsWith('#formal/')) {
    const prompt = currentPrompts().find((item) => item.id === route.slice(8));
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
reactRoot.render(
  <AccountProvider>
    <Routes />
    <DevPanel />
  </AccountProvider>,
);
