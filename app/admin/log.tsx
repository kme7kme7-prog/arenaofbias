// 数据流水：投票 / 评论 / 注册三类记录，关键字搜索 + 倒序 + 分页查看更多。
// 数据来自 GET /api/admin/log。
import { useCallback, useEffect, useRef, useState } from 'react';

type Kind = 'votes' | 'comments' | 'users';

type VoteRow = {
  id: string;
  promptId: string;
  winnerMid: string;
  loserMid: string;
  mode: string;
  ts: number;
  username: string | null;
  /** 决策 048：draw = 平局票（winnerMid 列改显示「平局」） */
  outcome?: 'win' | 'draw';
};
type CommentRow = {
  id: string;
  roundId: string;
  side: string;
  body: string;
  ts: number;
  username: string | null;
};
type UserRow = {
  id: string;
  username: string;
  role: string | null;
  ts: number;
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false });

const TABS: { key: Kind; label: string }[] = [
  { key: 'votes', label: '投票' },
  { key: 'comments', label: '评论' },
  { key: 'users', label: '注册' },
];

export function AdminLog() {
  const [kind, setKind] = useState<Kind>('votes');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const [rows, setRows] = useState<(VoteRow | CommentRow | UserRow)[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const request = ++requestId.current;
    const params = new URLSearchParams({ kind, limit: String(limit) });
    if (query) params.set('q', query);
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return fetch(`/api/admin/log?${params}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ rows: typeof rows }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (request !== requestId.current) return;
        setRows(data.rows);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('流水加载失败，稍后重试。');
        setLoading(false);
      });
  }, [kind, query, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    setLoading(true);
    void load();
  };

  return (
    <section>
      <h1>数据流水</h1>
      <p className="admin-sub">
        投票、评论与注册的原始记录（倒序）。搜索框支持用户名、题号、内容关键字。
      </p>
      <div className="admin-toolbar">
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={kind === tab.key ? 'active' : ''}
              onClick={() => {
                setKind(tab.key);
                setLimit(50);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(q.trim());
            setLimit(50);
          }}
        >
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            // 无 submit 按钮的单输入表单，Enter 隐式提交在部分浏览器不可靠，显式处理
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                setQuery(q.trim());
                setLimit(50);
              }
            }}
            placeholder={kind === 'votes' ? '搜索用户 / 题号 / 模型' : kind === 'comments' ? '搜索用户 / 题号 / 内容' : '搜索用户名'}
            aria-label="搜索流水"
          />
        </form>
        <button className="reload" onClick={reload}>
          刷新
        </button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <table className="admin-table">
        <thead>
          {kind === 'votes' && (
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>题目</th>
              <th>胜方</th>
              <th>负方</th>
              <th>模式</th>
            </tr>
          )}
          {kind === 'comments' && (
            <tr>
              <th>时间</th>
              <th>用户</th>
              <th>题目</th>
              <th>立场</th>
              <th>内容</th>
            </tr>
          )}
          {kind === 'users' && (
            <tr>
              <th>注册时间</th>
              <th>用户名</th>
              <th>身份</th>
            </tr>
          )}
        </thead>
        <tbody>
          {kind === 'votes' &&
            (rows as VoteRow[]).map((row) => (
              <tr key={row.id}>
                <td className="muted">{fmt(row.ts)}</td>
                <td>{row.username ?? '—'}</td>
                <td>{row.promptId}</td>
                <td>{row.outcome === 'draw' ? '平局' : row.winnerMid}</td>
                <td className="muted">{row.loserMid}</td>
                <td>{row.mode}</td>
              </tr>
            ))}
          {kind === 'comments' &&
            (rows as CommentRow[]).map((row) => (
              <tr key={row.id}>
                <td className="muted">{fmt(row.ts)}</td>
                <td>{row.username ?? '—'}</td>
                <td>{row.roundId}</td>
                <td>{row.side === 'a' ? 'A' : 'B'}</td>
                <td className="wrap">{row.body}</td>
              </tr>
            ))}
          {kind === 'users' &&
            (rows as UserRow[]).map((row) => (
              <tr key={row.id}>
                <td className="muted">{fmt(row.ts)}</td>
                <td>{row.username}</td>
                <td>{row.role === 'admin' ? '管理员' : '普通用户'}</td>
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 32 }}>
                没有匹配的记录。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ color: '#8a9184', fontSize: 12, marginTop: 10 }}>
        {loading ? '加载中…' : `显示 ${rows.length} 条${rows.length === limit ? '（可能有更多）' : ''}`}
        {rows.length === limit && (
          <button
            className="reload"
            style={{ marginLeft: 10 }}
            onClick={() => setLimit((n) => n + 100)}
          >
            加载更多
          </button>
        )}
      </p>
    </section>
  );
}
