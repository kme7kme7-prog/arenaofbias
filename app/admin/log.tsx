// 数据流水：投票 / 评论 / 注册 / 模一把四类记录，关键字搜索 + 倒序 + 每页 50 条翻页。
// 数据来自 GET /api/admin/log（limit/offset/total）。
import { useCallback, useEffect, useRef, useState } from 'react';

type Kind = 'votes' | 'comments' | 'users' | 'guess';

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
type GuessRow = {
  id: string;
  day: string;
  difficulty: number;
  answerId: string;
  won: number;
  attempts: number;
  ts: number;
  username: string | null;
};

const fmt = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false });

const TABS: { key: Kind; label: string }[] = [
  { key: 'votes', label: '投票' },
  { key: 'comments', label: '评论' },
  { key: 'users', label: '注册' },
  { key: 'guess', label: '模一把' },
];

const PAGE_SIZE = 50;

export function AdminLog() {
  const [kind, setKind] = useState<Kind>('votes');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<(VoteRow | CommentRow | UserRow | GuessRow)[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const request = ++requestId.current;
    const params = new URLSearchParams({
      kind,
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (query) params.set('q', query);
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return fetch(`/api/admin/log?${params}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ rows: typeof rows; total: number }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (request !== requestId.current) return;
        setRows(data.rows);
        setTotal(data.total);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('流水加载失败，稍后重试。');
        setLoading(false);
      });
  }, [kind, query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    setLoading(true);
    void load();
  };

  // 换标签/换搜索词时清空旧行并进加载态（2026-09-20 审查修复）：否则响应回来前
  // 旧一类的行会按新表头渲染（「注册」表里列评论行）。页内翻页保留旧行不闪。
  const switchKind = (next: Kind) => {
    if (next === kind) return;
    setRows([]);
    setLoading(true);
    setKind(next);
    setPage(0);
  };
  const submitSearch = () => {
    const next = q.trim();
    if (next === query && page === 0) return;
    setRows([]);
    setLoading(true);
    setQuery(next);
    setPage(0);
  };

  return (
    <section>
      <h1>数据流水</h1>
      <p className="admin-sub">
        投票、评论、注册与模一把的原始记录（倒序）。模一把按人统计自 2026-09-25 起（登录用户记名，此前与游客显示「游客」）。
      </p>
      <div className="admin-toolbar">
        <div className="tabs">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              className={kind === tab.key ? 'active' : ''}
              onClick={() => switchKind(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            // 无 submit 按钮的单输入表单，Enter 隐式提交在部分浏览器不可靠，显式处理
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitSearch();
              }
            }}
            placeholder={kind === 'votes' ? '搜索用户 / 题号 / 模型' : kind === 'comments' ? '搜索用户 / 题号 / 内容' : kind === 'guess' ? '搜索用户 / 答案模型' : '搜索用户名'}
            aria-label="搜索流水"
          />
          <button className="admin-mini primary" type="submit">搜索</button>
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
          {kind === 'guess' && (
            <tr>
              <th>时间</th>
              <th>玩家</th>
              <th>日期</th>
              <th>难度</th>
              <th>答案模型</th>
              <th>步数</th>
              <th>结果</th>
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
          {kind === 'guess' &&
            (rows as GuessRow[]).map((row) => (
              <tr key={row.id}>
                <td className="muted">{fmt(row.ts)}</td>
                <td>{row.username ?? <span className="muted">游客</span>}</td>
                <td className="muted">{row.day}</td>
                <td>{row.difficulty === 0 ? '每日一题' : `旧档 ${row.difficulty}`}</td>
                <td>{row.answerId}</td>
                <td>{row.attempts}</td>
                <td>{row.won ? '猜中' : '未中'}</td>
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
        {loading
          ? '加载中…'
          : `第 ${page + 1} / ${Math.max(1, Math.ceil(total / PAGE_SIZE))} 页 · 共 ${total} 条`}
        {!loading && total > PAGE_SIZE && (
          <>
            <button
              className="reload"
              style={{ marginLeft: 10 }}
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              上一页
            </button>
            <button
              className="reload"
              style={{ marginLeft: 6 }}
              disabled={(page + 1) * PAGE_SIZE >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </>
        )}
      </p>
    </section>
  );
}
