// 管理后台入口（同仓库双应用的第二个入口，决策 040）。
// 布局与主站完全独立：朴素的后台工作台风格，不使用主站的酸黄视觉。
// 会话复用主站登录（arena_session cookie 同域共享），
// 非管理员访问一律呈现 404 视图——不泄露后台存在与否。
import { StrictMode, useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ScrollText,
  Images,
  BookOpen,
  Inbox,
  Gamepad2,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { createRoot } from 'react-dom/client';
import { AdminDashboard } from '@/app/admin/dashboard';
import { AdminGuess } from '@/app/admin/guess';
import { AdminInbox } from '@/app/admin/inbox';
import { AdminLog } from '@/app/admin/log';
import { AdminPlaceholder } from '@/app/admin/placeholder';
import { AdminPrompts } from '@/app/admin/prompts';
import { AdminWorks } from '@/app/admin/works';
import { trackPageView } from '@/lib/track';
import '@/app/admin/admin.css';
import '@/app/admin/workspace.css';

type User = { id: string; username: string; role: string | null };

const SECTIONS = [
  {
    icon: LayoutDashboard,
    group: '总览',
    key: 'dashboard',
    label: '仪表盘',
    ready: true,
  },
  {
    icon: ScrollText,
    group: '总览',
    key: 'log',
    label: '数据流水',
    ready: true,
  },
  {
    icon: Images,
    group: '内容管理',
    key: 'works',
    label: '作品管理',
    ready: true,
  },
  {
    icon: BookOpen,
    group: '内容管理',
    key: 'prompts',
    label: '题目管理',
    ready: true,
  },
  {
    icon: Inbox,
    group: '内容管理',
    key: 'inbox',
    label: '收件箱',
    ready: true,
  },
  { icon: Gamepad2, group: '玩法', key: 'guess', label: '模一把', ready: true },
  {
    icon: CalendarDays,
    group: '玩法',
    key: 'events',
    label: '活动管理',
    ready: false,
  },
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

function AdminShell({
  user,
  section,
  onSection,
}: {
  user: User;
  section: SectionKey;
  onSection: (key: SectionKey) => void;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('aob-admin-collapsed') === '1';
    } catch {
      return false;
    }
  });
  const [compact, setCompact] = useState(() => {
    try {
      return localStorage.getItem('aob-admin-compact') === '1';
    } catch {
      return false;
    }
  });
  const current = SECTIONS.find((item) => item.key === section)!;
  const toggle = (kind: 'collapsed' | 'compact') => {
    const next = kind === 'collapsed' ? !collapsed : !compact;
    if (kind === 'collapsed') setCollapsed(next);
    else setCompact(next);
    try {
      localStorage.setItem('aob-admin-' + kind, next ? '1' : '0');
    } catch {
      /* Preferences are optional. */
    }
  };
  return (
    <div
      className={`admin-shell admin-workspace ${collapsed ? 'is-collapsed' : ''} ${compact ? 'is-compact' : ''}`}
    >
      <a
        className="admin-skip"
        href="#admin-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('admin-content')?.focus();
        }}
      >
        跳到主要内容
      </a>
      <aside className="admin-side">
        <a className="admin-brand" href="#dashboard" aria-label="后台概览">
          <span className="admin-monogram">
            a<span> / </span>b
          </span>
          <div className="admin-brand-copy">
            <b>ARENA OF BIAS</b>
            <span>内容与运营工作台</span>
          </div>
        </a>
        <nav aria-label="后台导航">
          {['总览', '内容管理', '玩法'].map((group) => (
            <div className="admin-nav-group" key={group}>
              <span className="admin-nav-caption">{group}</span>
              {SECTIONS.filter((item) => item.group === group).map((item) => (
                <button
                  key={item.key}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={section === item.key ? 'page' : undefined}
                  className={section === item.key ? 'active' : ''}
                  onClick={() => onSection(item.key)}
                >
                  <item.icon size={18} strokeWidth={1.7} aria-hidden="true" />
                  <span className="admin-nav-label">{item.label}</span>
                  {!item.ready && <i title="未开放">未开放</i>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-side-foot">
          <span className="admin-avatar">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <div className="admin-account">
            <b>{user.username}</b>
            <span>
              <ShieldCheck size={12} /> 管理员
            </span>
          </div>
        </div>
      </aside>
      <div className="admin-workarea">
        <header className="admin-topbar">
          <button
            className="admin-icon-button admin-collapse"
            onClick={() => toggle('collapsed')}
            aria-label={collapsed ? '展开侧栏' : '收起侧栏'}
            title={collapsed ? '展开侧栏' : '收起侧栏'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={19} />
            ) : (
              <PanelLeftClose size={19} />
            )}
          </button>
          <div className="admin-breadcrumb">
            <span>{current.group}</span>
            <ChevronRight size={14} />
            <b>{current.label}</b>
          </div>
          <div className="admin-topbar-actions">
            <button
              className="admin-density"
              aria-pressed={compact}
              onClick={() => toggle('compact')}
            >
              {compact ? '紧凑视图' : '舒适视图'}
            </button>
            <a href="/" target="_blank" rel="noreferrer">
              查看主站 <ExternalLink size={14} />
            </a>
          </div>
        </header>
        <main className="admin-main" id="admin-content" tabIndex={-1}>
          {section === 'dashboard' && <AdminDashboard />}
          {section === 'log' && <AdminLog />}
          {section === 'works' && <AdminWorks />}
          {section === 'inbox' && <AdminInbox />}
          {section === 'prompts' && <AdminPrompts />}
          {section === 'guess' && <AdminGuess />}
          {section === 'events' && (
            <AdminPlaceholder
              title="活动管理"
              note="特别赛轮换与活动配置。等特别赛玩法落地后开放。"
            />
          )}
        </main>
      </div>
    </div>
  );
}

function readSection(): SectionKey {
  const key = window.location.hash.slice(1).split('?')[0];
  return SECTIONS.some((item) => item.key === key)
    ? (key as SectionKey)
    : 'dashboard';
}

function App() {
  const { user, loading } = useSession();
  const [section, setSection] = useState<SectionKey>(readSection);
  useEffect(() => {
    const sync = () => setSection(readSection());
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  // 会话确认前的空白，避免闪现 404
  if (loading) return <div className="admin-loading" />;
  // 未登录或非管理员：与未知路由一致的 404，不泄露后台存在
  if (!user || user.role !== 'admin') return <NotFound />;
  return (
    <StrictMode>
      <AdminShell
        user={user}
        section={section}
        onSection={(key) => {
          window.location.hash = key;
          setSection(key);
        }}
      />
    </StrictMode>
  );
}

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root mount point');
trackPageView('/admin.html');
createRoot(container).render(<App />);
