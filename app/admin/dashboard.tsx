// 仪表盘：今日/昨日浏览与访客、累计数据、近 14 日趋势（纯 SVG 柱状图）、
// 服务器体检卡片。数据来自 GET /api/admin/stats。
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  Inbox,
  Scan,
  BookOpen,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';

type Stats = {
  today: { day: string; views: number; visitors: number };
  yesterday: { day: string; views: number; visitors: number };
  trend: { day: string; views: number; visitors: number }[];
  totals: {
    votes: number;
    comments: number;
    users: number;
    works: number;
    worksPublished: number;
  };
  health: {
    uptime: number;
    memory: number;
    heapTotal: number;
    loadavg: number[] | null;
    platform: string;
    node: string;
  };
};

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
const uptimeText = (seconds: number) => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days} 天 ${hours} 小时` : `${hours} 小时`;
};

function TrendChart({ data }: { data: Stats['trend'] }) {
  if (data.length === 0)
    return (
      <div className="empty">
        还没有访客数据——有人访问主站后这里会出现柱状图。
      </div>
    );
  const W = 720;
  const H = 180;
  const pad = { left: 34, bottom: 22 };
  const max = Math.max(...data.map((d) => d.views), 1);
  const innerW = W - pad.left - 8;
  const innerH = H - pad.bottom - 10;
  const barW = Math.max(6, (innerW / data.length) * 0.55);
  const x = (i: number) =>
    pad.left + (innerW / data.length) * (i + 0.5) - barW / 2;
  const h = (v: number) => (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      {[0, 0.5, 1].map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={W - 8}
            y1={10 + innerH * (1 - t)}
            y2={10 + innerH * (1 - t)}
            stroke="#eef0ea"
          />
          <text
            x={pad.left - 6}
            y={14 + innerH * (1 - t)}
            textAnchor="end"
            fontSize="10"
            fill="#8a9184"
          >
            {Math.round(max * t)}
          </text>
        </g>
      ))}
      {data.map((d, i) => {
        const recent = i >= data.length - 2; // 柱子里标注的日期密度：近期全标
        return (
          <g key={d.day}>
            <rect
              x={x(i)}
              y={10 + innerH - h(d.views)}
              width={barW}
              height={h(d.views)}
              rx="2"
              fill={i === data.length - 1 ? '#3a4032' : '#8b9384'}
            >
              <title>{`${d.day}：${d.views} 次浏览 · ${d.visitors} 位访客`}</title>
            </rect>
            {(recent || i % 3 === 0) && (
              <text
                x={x(i) + barW / 2}
                y={H - 6}
                textAnchor="middle"
                fontSize="10"
                fill="#8a9184"
              >
                {d.day.slice(5)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/admin/stats?days=14', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('统计数据加载失败，请重试。');
        return response.json() as Promise<Stats>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        setStats(data);
        setError('');
        setUpdated(
          new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : '统计数据加载失败');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [revision]);
  const drafts = stats
    ? stats.totals.works - stats.totals.worksPublished
    : null;
  return (
    <section className="admin-overview">
      <div className="admin-page-heading">
        <div>
          <span className="admin-kicker">工作台 / OVERVIEW</span>
          <h1>今天，从这里开始。</h1>
          <p className="admin-sub">
            整理作品、维护题目，看看新的选择如何发生。
          </p>
        </div>
        <div className="admin-refresh-group">
          <output>
            {loading
              ? '正在更新数据…'
              : updated
                ? `更新于 ${updated}`
                : '尚未加载'}
          </output>
          <button
            className="admin-mini"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setRevision((n) => n + 1);
            }}
          >
            <RefreshCw size={15} />
            刷新数据
          </button>
        </div>
      </div>
      {error && (
        <div className="admin-error" role="alert">
          {error}
          {stats && ' 当前显示上次成功获取的数据。'}
        </div>
      )}
      <div className="admin-metrics" aria-busy={loading}>
        <div className="admin-metric">
          <span>今日浏览</span>
          <b>{stats?.today.views.toLocaleString() ?? '—'}</b>
          <small>
            昨日 {stats?.yesterday.views.toLocaleString() ?? '—'} 次
          </small>
        </div>
        <div className="admin-metric">
          <span>今日访客</span>
          <b>{stats?.today.visitors.toLocaleString() ?? '—'}</b>
          <small>
            按日去重 · 昨日 {stats?.yesterday.visitors.toLocaleString() ?? '—'}{' '}
            位
          </small>
        </div>
        <a className="admin-metric" href="#log">
          <span>
            累计投票 <ArrowUpRight size={16} />
          </span>
          <b>{stats?.totals.votes.toLocaleString() ?? '—'}</b>
          <small>查看参与者的选择</small>
        </a>
        <a className="admin-metric" href="#works">
          <span>
            已发布作品 <ArrowUpRight size={16} />
          </span>
          <b>
            {stats?.totals.worksPublished.toLocaleString() ?? '—'}
            <em> / {stats?.totals.works ?? '—'}</em>
          </b>
          <small>
            {drafts === null ? '正在读取作品库' : `${drafts} 份尚未发布`}
          </small>
        </a>
      </div>
      <div className="admin-overview-grid">
        <div className="admin-workflow">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-kicker">内容工作流</span>
              <h2>把好作品带进竞技场</h2>
            </div>
            <span className="admin-panel-tag">三个步骤</span>
          </div>
          {[
            {
              href: '#inbox',
              icon: Inbox,
              title: '登记作品',
              note: '从收件箱选择文件，归入对应题目。',
              step: '01',
            },
            {
              href: '#works?status=draft',
              icon: Scan,
              title: '检查与发布',
              note: '检查原作、校准画布，再发布到前台。',
              step: '02',
            },
            {
              href: '#prompts',
              icon: BookOpen,
              title: '维护题目',
              note: '完善命题与六维权重，管理题目上架。',
              step: '03',
            },
          ].map((item) => (
            <a className="admin-workflow-row" key={item.href} href={item.href}>
              <span className="admin-step">{item.step}</span>
              <item.icon size={21} strokeWidth={1.6} />
              <div>
                <b>{item.title}</b>
                <p>{item.note}</p>
              </div>
              <ArrowRight size={18} />
            </a>
          ))}
        </div>
        <aside className="admin-publish-summary">
          <span className="admin-kicker">作品库</span>
          <h2>待发布作品</h2>
          <strong>
            {drafts ?? '—'}
            <small>份</small>
          </strong>
          <p>
            尚未发布的作品不会出现在竞技场。检查展示效果后，再决定是否发布。
          </p>
          <a href="#works?status=draft">
            查看未发布作品 <ArrowRight size={17} />
          </a>
          <span className="admin-publish-foot">下架保留原作和历史投票</span>
        </aside>
      </div>
      <div className="admin-overview-grid admin-overview-bottom">
        <div className="admin-trend">
          <div className="admin-panel-heading">
            <div>
              <span className="admin-kicker">访问趋势</span>
              <h2>近 14 日页面浏览</h2>
            </div>
            <span className="admin-panel-tag">浏览次数</span>
          </div>
          {stats ? (
            <TrendChart data={stats.trend} />
          ) : (
            <div className="empty">
              {error ? '数据暂不可用，请重试' : '正在读取访问趋势…'}
            </div>
          )}
        </div>
        <div className="admin-system-panel">
          <span className="admin-kicker">站点概况</span>
          <h2>参与与运行</h2>
          <dl>
            <div>
              <dt>注册用户</dt>
              <dd>{stats?.totals.users ?? '—'}</dd>
            </div>
            <div>
              <dt>累计评论</dt>
              <dd>{stats?.totals.comments ?? '—'}</dd>
            </div>
            <div>
              <dt>服务运行时间</dt>
              <dd>{stats ? uptimeText(stats.health.uptime) : '—'}</dd>
            </div>
            <div>
              <dt>进程内存</dt>
              <dd>{stats ? mb(stats.health.memory) : '—'}</dd>
            </div>
          </dl>
          <a href="#log">
            查看数据流水 <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
