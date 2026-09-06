import { createRoot } from 'react-dom/client';
import Arena from '@/app/page';
import '@/app/globals.css';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root mount point');

// 与旧版一致：不启用 StrictMode，避免入场动画相关 effect 在开发模式重复执行。
createRoot(container).render(<Arena />);
