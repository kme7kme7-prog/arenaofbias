import { AccountProvider } from '@/components/account';
import '@/app/account.css';
import { createRoot } from 'react-dom/client';
import Arena from '@/app/page';
import { useEffect, useSyncExternalStore } from 'react';
import Home from '@/app/home';
import PromptLibrary from '@/app/prompt-library';
import PromptPreview from '@/app/prompt-preview';
import { prompts, eligiblePairs, randomArenaHash } from '@/lib/arena';
import '@/app/globals.css';
import '@/app/home.css';
import '@/app/library.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root mount point');

// 与旧版一致：不启用 StrictMode，避免入场动画相关 effect 在开发模式重复执行。
function subscribeRoute(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}
function App() {
  const route = useSyncExternalStore(
    subscribeRoute,
    () => window.location.hash,
    () => '',
  );
  useEffect(() => {
    window.scrollTo(0, 0);
    if (route === '#arena' || route === '#random') {
      window.location.replace(randomArenaHash());
    }
  }, [route]);
  if (route === '#arena' || route === '#random') return null;
  if (route === '#prompts') return <PromptLibrary />;
  if (route.startsWith('#arena/')) {
    const prompt = prompts.find((item) => item.id === route.slice(7));
    if (prompt && eligiblePairs(prompt.id).length > 0)
      return <Arena key={prompt.id} prompt={prompt} />;
    if (prompt) return <PromptPreview key={prompt.id} prompt={prompt} />;
    return (
      <div className="route-empty">
        <h1>这个竞技场还未就绪。</h1>
        <p>请从提示词库选择一个可比较的提示词。</p>
        <a href="#prompts">前往提示词库 ↗</a>
      </div>
    );
  }
  return <Home />;
}
createRoot(container).render(
  <AccountProvider>
    <App />
  </AccountProvider>,
);
