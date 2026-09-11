// 管理后台入口（同仓库双应用的第二个入口，决策 040）。
// 布局与主站完全独立：朴素的后台工作台风格，不使用主站的酸黄视觉。
// 会话复用主站登录（arena_session cookie 同域共享），
// 非管理员访问一律呈现 404 视图——不泄露后台存在与否。
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminDashboard } from '@/app/admin/dashboard';
import { AdminLog } from '@/app/admin/log';
import { AdminPlaceholder } from '@/app/admin/placeholder';
import { trackPageView } from '@/lib/track';
import '@/app/admin/admin.css';

type User = { id: string; username: string; role: string | null };

const SECTIONS = [
  { key: 'dashboard', label: '仪表盘', ready: true },
  { key: 'log', label: '数据流水', ready: true },
  { key: 'works', label: '作品管理', ready: false },
  { key: 'prompts', label: '题目管理', ready: false },
  { key: 'inbox', label: '收件箱', ready: false },
  { key: 'events', label: '活动管理', ready: false },
] as const;

type SectionKey = (typeof SECTIONS)[number]['key'];

function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    fetch('/api/auth/me')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ user: User | null }>)
          : Promise.reject(new Error()),
      )
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  return { user, loading };
}

function NotFound() {
  return (
    <div className="admin-404">
      <h1>404</h1>
      <p>页面不存在。</p>
      <a href="/">返回主站</a>
    </div>
  );
}

function AdminShell({ user, section, onSection }: {
  user: User;
  section: SectionKey;
  onSection: (key: SectionKey) => void;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div className="admin-brand">
          <b>ARENA OF BIAS</b>
          <span>管理后台 / ADMIN</span>
        </div>
        <nav>
          {SECTIONS.map((item) => (
            <button
              key={item.key}
              className={section === item.key ? 'active' : ''}
              onClick={() => onSection(item.key)}
            >
              {item.label}
              {!item.ready && <i title="未开放">未开放</i>}
            </button>
          ))}
        </nav>
        <div className="admin-side-foot">
          <span>当前身份：{user.username}</span>
          <a href="/" target="_blank" rel="noreferrer">
            打开主站 ↗
          </a>
        </div>
      </aside>
      <main className="admin-main">
        {section === 'dashboard' && <AdminDashboard />}
        {section === 'log' && <AdminLog />}
        {section === 'works' && (
          <AdminPlaceholder
            title="作品管理"
            note="作品登记、发布开关与下架。当前阶段请直接编辑 lib/works-roster.json 并提交；此页将在后台第二期实现。"
          />
        )}
        {section === 'prompts' && (
          <AdminPlaceholder
            title="题目管理"
            note="新增/编辑提示词。当前阶段请直接编辑 lib/arena.ts 的 prompts 数组；此页将与题目的数据库化同期实现。"
          />
        )}
        {section === 'inbox' && (
          <AdminPlaceholder
            title="收件箱"
            note="浏览服务器收件箱文件夹并登记作品。文件请先通过宝塔上传到收件箱目录；此页将在后台第二期实现。"
          />
        )}
        {section === 'events' && (
          <AdminPlaceholder
            title="活动管理"
            note="特别赛轮换与活动配置。等特别赛玩法落地后开放。"
          />
        )}
      </main>
    </div>
  );
}

function App() {
  const { user, loading } = useSession();
  const [section, setSection] = useState<SectionKey>('dashboard');
  // 会话确认前的空白，避免闪现 404
  if (loading) return <div className="admin-loading" />;
  // 未登录或非管理员：与未知路由一致的 404，不泄露后台存在
  if (!user || user.role !== 'admin') return <NotFound />;
  return (
    <StrictMode>
      <AdminShell user={user} section={section} onSection={setSection} />
    </StrictMode>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root mount point');
trackPageView('/admin.html');
createRoot(container).render(<App />);
