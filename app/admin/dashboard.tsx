// 仪表盘：今日/昨日浏览与访客、累计数据、近 14 日趋势（纯 SVG 柱状图）、
// 服务器体检卡片。数据来自 GET /api/admin/stats。
import { useEffect, useState } from 'react';

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
    return <div className="empty">还没有访客数据——有人访问主站后这里会出现柱状图。</div>;
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
  // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
  useEffect(() => {
    fetch('/api/admin/stats?days=14')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<Stats>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        setStats(data);
        setError('');
      })
      .catch(() => setError('统计数据加载失败，稍后重试。'));
  }, []);
  return (
    <section>
      <h1>仪表盘</h1>
      <p className="admin-sub">站点今日动态与服务器体检。数据每次进入时刷新。</p>
      {error && <div className="admin-error">{error}</div>}
      {stats && (
        <>
          <div className="admin-cards">
            <div className="admin-card">
              <b>{stats.today.views}</b>
              <span>今日浏览</span>
              <small>昨日 {stats.yesterday.views}</small>
            </div>
            <div className="admin-card">
              <b>{stats.today.visitors}</b>
              <span>今日访客（按日去重）</span>
              <small>昨日 {stats.yesterday.visitors}</small>
            </div>
            <div className="admin-card">
              <b>{stats.totals.votes}</b>
              <span>累计投票</span>
              <small>注册用户 {stats.totals.users} · 评论 {stats.totals.comments}</small>
            </div>
            <div className="admin-card">
              <b>
                {stats.totals.worksPublished}
                <i style={{ fontWeight: 400, fontSize: 16, fontStyle: 'normal' }}>
                  {' '}/ {stats.totals.works}
                </i>
              </b>
              <span>已发布 / 总作品</span>
              <small>未发布作品对访客不可见</small>
            </div>
            <div className="admin-card">
              <b>{mb(stats.health.memory)}</b>
              <span>Node 进程内存</span>
              <small>
                运行 {uptimeText(stats.health.uptime)} · {stats.health.node}
              </small>
            </div>
          </div>
          <div className="admin-trend">
            <h2>近 14 日页面浏览</h2>
            <TrendChart data={stats.trend} />
          </div>
        </>
      )}
    </section>
  );
}
