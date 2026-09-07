import { createRoot } from 'react-dom/client';
import Arena from '@/app/page';
import { useSyncExternalStore } from 'react';
import Home from '@/app/home';
import '@/app/globals.css';
import '@/app/home.css';

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
  return route === '#arena' ? <Arena /> : <Home />;
}
createRoot(container).render(<App />);
