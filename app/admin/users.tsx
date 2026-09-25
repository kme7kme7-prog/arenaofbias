// 用户管理（2026-09-25）：清单（用户名/邮箱/身份/注册时间/票数评论数）+
// 四个账号级操作：授权/撤权管理员、重置密码（一次性展示）、强制下线、删除账号。
// 服务端硬性禁止对自己操作（防自锁）；删除账号后票/评论保留、作者变匿名。
import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, ShieldCheck } from 'lucide-react';

type AdminUser = {
  id: string;
  username: string;
  role: string | null;
  email: string | null;
  emailVerified: boolean;
  createdAt: number;
  votes: number;
  comments: number;
};

type ActivityVote = {
  id: string;
  promptId: string;
  winnerMid: string;
  loserMid: string;
  mode: string;
  outcome?: string;
  ts: number;
};
type ActivityComment = {
  id: string;
  roundId: string;
  side: string;
  body: string;
  ts: number;
};
type ActivityGuessRow = {
  id: string;
  day: string;
  difficulty: number;
  answerId: string;
  answerName: string;
  won: number;
  attempts: number;
  ts: number;
};
type Activity = {
  user: AdminUser;
  votes: ActivityVote[];
  comments: ActivityComment[];
  guess: {
    played: number;
    won: number;
    avgSteps: number | null;
    rows: ActivityGuessRow[];
  };
};

const PAGE_SIZE = 50;
const fmt = (ts: number) =>
  new Date(ts).toLocaleString('zh-CN', { hour12: false });
const winRate = (won: number, played: number) =>
  played > 0 ? `${Math.round((won / played) * 100)}%` : '—';
const steps = (v: number | null) => (v === null ? '—' : v.toFixed(1));

export function AdminUsers() {
  const [me, setMe] = useState<{ id: string } | null>(null);
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  // 一次性密码弹窗：明文只在这里出现，关闭即不再可见
  const [freshPassword, setFreshPassword] = useState<{ username: string; password: string } | null>(null);
  const passwordBox = useRef<HTMLDialogElement>(null);
  // 用户详情弹窗：账号信息 + 近期投票/评论/模一把成绩
  const [detail, setDetail] = useState<Activity | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const activityBox = useRef<HTMLDialogElement>(null);
  const [openUser, setOpenUser] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ user: { id: string } | null }>)
          : Promise.reject(new Error()),
      )
      .then((data) => setMe(data.user))
      .catch(() => setMe(null));
  }, []);

  const load = useCallback(() => {
    const request = ++requestId.current;
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (query) params.set('q', query);
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return fetch(`/api/admin/users?${params}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ total: number; users: AdminUser[] }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (request !== requestId.current) return;
        setRows(data.users);
        setTotal(data.total);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('用户清单加载失败，稍后重试。');
        setLoading(false);
      });
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const submitSearch = () => {
    const next = q.trim();
    if (next === query && page === 0) return;
    setLoading(true);
    setQuery(next);
    setPage(0);
  };

  const act = (user: AdminUser, run: () => Promise<unknown>, message: string) => {
    if (busyId) return;
    setBusyId(user.id);
    setError('');
    setNotice('');
    run()
      .then(() => {
        setNotice(message);
        return load();
      })
      .catch((actionError: unknown) =>
        setError(
          actionError instanceof Error
            ? actionError.message
            : '操作失败，稍后再试。',
        ),
      )
      .finally(() => setBusyId(null));
  };

  const toggleRole = (user: AdminUser) => {
    const promoting = user.role !== 'admin';
    if (
      !window.confirm(
        promoting
          ? `把「${user.username}」设为管理员？（可访问全部后台与管理操作）`
          : `撤销「${user.username}」的管理员身份？`,
      )
    )
      return;
    act(
      user,
      () =>
        fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: promoting ? 'admin' : null }),
        }).then(async (response) => {
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error || '保存失败，稍后再试。');
          }
        }),
      promoting ? `${user.username} 已设为管理员。` : `${user.username} 已撤销管理员。`,
    );
  };

  const resetPassword = (user: AdminUser) => {
    if (
      !window.confirm(
        `重置「${user.username}」的密码？新密码只显示一次，该账号所有登录会被踢下线。`,
      )
    )
      return;
    act(
      user,
      () =>
        fetch(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).then(async (response) => {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
            password?: string;
          };
          if (!response.ok || !data.password)
            throw new Error(data.error || '重置失败，稍后再试。');
          setFreshPassword({ username: user.username, password: data.password });
          passwordBox.current?.showModal();
        }),
      '',
    );
  };

  const forceOffline = (user: AdminUser) => {
    if (!window.confirm(`把「${user.username}」强制下线？（清掉全部登录会话）`)) return;
    act(
      user,
      () =>
        fetch(`/api/admin/users/${encodeURIComponent(user.id)}/force-offline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }).then(async (response) => {
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error || '操作失败，稍后再试。');
          }
        }),
      `${user.username} 已下线，下次操作需重新登录。`,
    );
  };

  const removeUser = (user: AdminUser) => {
    if (
      !window.confirm(
        `删除账号「${user.username}」？此操作不可恢复。该账号的投票与评论会保留，作者显示为匿名。`,
      )
    )
      return;
    act(
      user,
      () =>
        fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
          method: 'DELETE',
        }).then(async (response) => {
          if (!response.ok) {
            const data = (await response.json().catch(() => ({}))) as { error?: string };
            throw new Error(data.error || '删除失败，稍后再试。');
          }
        }),
      `账号 ${user.username} 已删除（投票与评论保留，作者变匿名）。`,
    );
  };

  const copyPassword = () => {
    if (!freshPassword) return;
    navigator.clipboard
      .writeText(freshPassword.password)
      .then(() => setNotice('新密码已复制到剪贴板。'))
      .catch(() => setError('复制失败，请手动选中复制。'));
  };

  const isSelf = (user: AdminUser) => me?.id === user.id;

  const openDetail = (user: AdminUser) => {
    if (detailLoading) return;
    setOpenUser(user.username);
    setDetailLoading(true);
    setDetailError('');
    setDetail(null);
    fetch(`/api/admin/users/${encodeURIComponent(user.id)}/activity`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<Activity>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        setDetail(data);
        setDetailLoading(false);
        activityBox.current?.showModal();
      })
      .catch(() => {
        setDetailLoading(false);
        setDetailError('用户动态加载失败，稍后重试。');
      });
  };

  const closeDetail = () => {
    activityBox.current?.close();
    setDetail(null);
    setOpenUser(null);
  };

  return (
    <section>
      <h1>用户管理</h1>
      <p className="admin-sub">
        已注册账号的清单与账号级操作。删除账号不删投票与评论（作者变匿名）；
        当前登录账号不能在列表里操作自己。
      </p>
      <div className="admin-toolbar">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSearch();
          }}
        >
          <input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitSearch();
              }
            }}
            placeholder="搜索用户名或邮箱"
            aria-label="搜索用户"
          />
          <button className="admin-mini primary" type="submit">
            搜索
          </button>
        </form>
        <button
          className="reload"
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          刷新
        </button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      {notice && <div className="admin-ok">{notice}</div>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>用户名</th>
            <th>邮箱</th>
            <th>身份</th>
            <th>注册时间</th>
            <th>票数</th>
            <th>评论</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((user) => (
            <tr key={user.id}>
              <td>
                <button
                  type="button"
                  className="admin-user-link"
                  onClick={() => openDetail(user)}
                  title="查看动态详情"
                >
                  {user.username}
                </button>
                {isSelf(user) && (
                  <i className="admin-badge" style={{ marginLeft: 6 }}>
                    当前登录
                  </i>
                )}
              </td>
              <td className="wrap">
                {user.email ? (
                  <>
                    {user.email}
                    {!user.emailVerified && (
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        未验证
                      </span>
                    )}
                  </>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                {user.role === 'admin' ? (
                  <span className="admin-badge">
                    <ShieldCheck size={12} /> 管理员
                  </span>
                ) : (
                  <span className="muted">普通用户</span>
                )}
              </td>
              <td className="muted">{fmt(user.createdAt)}</td>
              <td>{user.votes}</td>
              <td>{user.comments}</td>
              <td>
                {isSelf(user) ? (
                  <span className="muted" style={{ fontSize: 12 }}>
                    自己的账号去右上角头像处管理
                  </span>
                ) : (
                  <div className="admin-actions">
                    <button
                      className="admin-mini"
                      disabled={busyId === user.id}
                      onClick={() => toggleRole(user)}
                      aria-label={
                        user.role === 'admin'
                          ? `撤销管理员：${user.username}`
                          : `设为管理员：${user.username}`
                      }
                    >
                      {user.role === 'admin' ? '撤权' : '设为管理员'}
                    </button>
                    <button
                      className="admin-mini"
                      disabled={busyId === user.id}
                      onClick={() => resetPassword(user)}
                      aria-label={`重置密码：${user.username}`}
                    >
                      重置密码
                    </button>
                    <button
                      className="admin-mini"
                      disabled={busyId === user.id}
                      onClick={() => forceOffline(user)}
                      aria-label={`强制下线：${user.username}`}
                    >
                      强制下线
                    </button>
                    <button
                      className="admin-mini danger"
                      disabled={busyId === user.id}
                      onClick={() => removeUser(user)}
                      aria-label={`删除账号：${user.username}`}
                    >
                      删除
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 32 }}>
                没有匹配的用户。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ color: '#8a9184', fontSize: 12, marginTop: 10 }}>
        {loading
          ? '加载中…'
          : `第 ${page + 1} / ${Math.max(1, Math.ceil(total / PAGE_SIZE))} 页 · 共 ${total} 位用户`}
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

      <dialog
        className="admin-password-dialog"
        ref={passwordBox}
        aria-labelledby="admin-password-title"
        onCancel={(event) => event.preventDefault()}
      >
        <h2 id="admin-password-title">新密码已生成</h2>
        <p>
          {freshPassword?.username} 的新密码——<b>只显示这一次</b>，关掉就再也看不到：
        </p>
        <code className="admin-password-value">{freshPassword?.password}</code>
        <div className="admin-actions">
          <button className="admin-mini primary" onClick={copyPassword}>
            <Copy size={13} /> 复制
          </button>
          <button
            className="admin-mini"
            onClick={() => {
              passwordBox.current?.close();
              setFreshPassword(null);
            }}
          >
            我已保存，关闭
          </button>
        </div>
        <small>该账号的原密码已失效，所有登录会话已被清空。</small>
      </dialog>
      <dialog
        className="admin-user-dialog"
        ref={activityBox}
        aria-labelledby="admin-user-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          closeDetail();
        }}
      >
        <header className="admin-user-dialog-head">
          <div>
            <h2 id="admin-user-dialog-title">
              {openUser ?? '…'}
              {detail?.user.role === 'admin' && (
                <span className="admin-badge" style={{ marginLeft: 8 }}>
                  <ShieldCheck size={12} /> 管理员
                </span>
              )}
            </h2>
            {detail && (
              <p className="muted">
                {detail.user.email ?? '未绑定邮箱'} · 注册于 {fmt(detail.user.createdAt)} ·{' '}
                {detail.user.votes} 票 {detail.user.comments} 评论
              </p>
            )}
          </div>
          <button className="admin-mini" onClick={closeDetail} aria-label="关闭详情">
            ✕
          </button>
        </header>
        {detailLoading && !detail && <p className="muted">读取动态中…</p>}
        {detailError && <div className="admin-error">{detailError}</div>}
        {detail && (
          <div className="admin-user-dialog-body">
            <section>
              <h3>模一把战绩</h3>
              <div className="admin-cards">
                <div className="admin-card">
                  <b>{detail.guess.played}</b>
                  <span>完成局数</span>
                </div>
                <div className="admin-card">
                  <b>{winRate(detail.guess.won, detail.guess.played)}</b>
                  <span>胜率</span>
                </div>
                <div className="admin-card">
                  <b>{steps(detail.guess.avgSteps)}</b>
                  <span>胜局平均步数</span>
                </div>
              </div>
              {detail.guess.played === 0 && (
                <small className="muted">
                  没有记名成绩——模一把自 2026-09-25 起才记录登录用户，此前与游客对局均为匿名。
                </small>
              )}
              {detail.guess.rows.length > 0 && (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>日期</th>
                      <th>答案模型</th>
                      <th>步数</th>
                      <th>结果</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.guess.rows.map((row) => (
                      <tr key={row.id}>
                        <td className="muted">{fmt(row.ts)}</td>
                        <td className="muted">{row.day}</td>
                        <td>{row.answerName}</td>
                        <td>{row.attempts}</td>
                        <td>{row.won ? '猜中' : '未中'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <h3>最近投票（{detail.votes.length}）</h3>
              {detail.votes.length === 0 ? (
                <p className="muted">还没有投票。</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>题目</th>
                      <th>胜方</th>
                      <th>负方</th>
                      <th>模式</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.votes.map((row) => (
                      <tr key={row.id}>
                        <td className="muted">{fmt(row.ts)}</td>
                        <td>{row.promptId}</td>
                        <td>{row.outcome === 'draw' ? '平局' : row.winnerMid}</td>
                        <td className="muted">{row.loserMid}</td>
                        <td>{row.mode}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
            <section>
              <h3>最近评论（{detail.comments.length}）</h3>
              {detail.comments.length === 0 ? (
                <p className="muted">还没有评论。</p>
              ) : (
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>题目</th>
                      <th>立场</th>
                      <th>内容</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.comments.map((row) => (
                      <tr key={row.id}>
                        <td className="muted">{fmt(row.ts)}</td>
                        <td>{row.roundId}</td>
                        <td>{row.side === 'a' ? 'A' : 'B'}</td>
                        <td className="wrap">{row.body}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </dialog>
    </section>
  );
}
