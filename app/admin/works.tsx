// 作品管理（后台第二期，决策 044）：全量清单（含草稿）、发布开关、标题/模型名
// 编辑、预览。数据来自 GET/PATCH /api/admin/works。
// 约束：不提供删除——投票流水引用作品，只允许下架（关发布开关）；
// model_id 不可改——榜单统计按它归组（票面存 mid），模型名只改显示名。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminPromptOptions } from '@/app/admin/use-admin-prompts';

type AdminWork = {
  id: string;
  promptId: string;
  modelId: string;
  modelName: string;
  title: string;
  isDemo: boolean;
  published: boolean;
  createdAt: number;
  src: string | null;
};

const fmt = (ts: number) => new Date(ts).toLocaleString('zh-CN', { hour12: false });

export function AdminWorks() {
  const promptOptions = useAdminPromptOptions();
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState<'all' | 'published' | 'draft'>('all');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(50);
  const [works, setWorks] = useState<AdminWork[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const request = ++requestId.current;
    const params = new URLSearchParams({ limit: String(limit) });
    if (prompt) params.set('prompt', prompt);
    if (status !== 'all') params.set('status', status);
    if (query) params.set('q', query);
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return fetch(`/api/admin/works?${params}`)
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ total: number; works: AdminWork[] }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (request !== requestId.current) return;
        setWorks(data.works);
        setTotal(data.total);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('作品清单加载失败，稍后重试。');
        setLoading(false);
      });
  }, [prompt, status, query, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  const reload = () => {
    setLoading(true);
    setEditingId(null);
    void load();
  };

  // 发布开关：乐观翻转，失败回滚。切换即时写库，前台拉 /api/works 时生效
  const togglePublish = (work: AdminWork) => {
    if (busyId) return;
    setBusyId(work.id);
    setWorks((rows) =>
      rows.map((row) =>
        row.id === work.id ? { ...row, published: !row.published } : row,
      ),
    );
    fetch(`/api/admin/works/${encodeURIComponent(work.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !work.published }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || '保存失败，稍后再试。');
        }
      })
      .then(() => setError(''))
      .catch((saveError: unknown) => {
        setWorks((rows) =>
          rows.map((row) =>
            row.id === work.id ? { ...row, published: work.published } : row,
          ),
        );
        setError(
          saveError instanceof Error ? saveError.message : '保存失败，稍后再试。',
        );
      })
      .finally(() => setBusyId(null));
  };

  const saveEdit = (work: AdminWork) => {
    if (busyId) return;
    setBusyId(work.id);
    fetch(`/api/admin/works/${encodeURIComponent(work.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: draftTitle, modelName: draftModel }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          work?: AdminWork;
        };
        if (!response.ok || !data.work)
          throw new Error(data.error || '保存失败，稍后再试。');
        return data.work;
      })
      .then((fresh) => {
        setWorks((rows) => rows.map((row) => (row.id === work.id ? fresh : row)));
        setEditingId(null);
        setError('');
      })
      .catch((saveError: unknown) =>
        setError(
          saveError instanceof Error ? saveError.message : '保存失败，稍后再试。',
        ),
      )
      .finally(() => setBusyId(null));
  };

  return (
    <section>
      <h1>作品管理</h1>
      <p className="admin-sub">
        全部作品（含草稿）。发布开关即时写库，前台刷新后生效；预览不经过发布开关，草稿也能打开。
        出于投票流水完整性不提供删除，下架请用发布开关。
      </p>
      <div className="admin-toolbar">
        <select
          value={prompt}
          onChange={(event) => {
            setPrompt(event.target.value);
            setLimit(50);
          }}
          aria-label="按题目筛选"
        >
          <option value="">全部题目</option>
          {promptOptions.map((item) => (
            <option key={item.id} value={item.id}>
              {item.id} {item.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as 'all' | 'published' | 'draft');
            setLimit(50);
          }}
          aria-label="按状态筛选"
        >
          <option value="all">全部状态</option>
          <option value="published">已发布</option>
          <option value="draft">草稿</option>
        </select>
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
            placeholder="搜索标题 / 模型 / 作品 ID"
            aria-label="搜索作品"
          />
        </form>
        <button className="reload" onClick={reload}>
          刷新
        </button>
      </div>
      {error && <div className="admin-error">{error}</div>}
      <table className="admin-table">
        <thead>
          <tr>
            <th>标题</th>
            <th>模型</th>
            <th>题目</th>
            <th>状态</th>
            <th>登记时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {works.map((work) => {
            const editing = editingId === work.id;
            return (
              <tr key={work.id}>
                <td className="wrap" style={{ minWidth: 220 }}>
                  {editing ? (
                    <input
                      value={draftTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      aria-label="编辑标题"
                    />
                  ) : (
                    <>
                      {work.title}
                      {work.isDemo && <i className="admin-badge">演示</i>}
                    </>
                  )}
                </td>
                <td>
                  {editing ? (
                    <input
                      value={draftModel}
                      onChange={(event) => setDraftModel(event.target.value)}
                      aria-label="编辑模型名"
                    />
                  ) : (
                    <>
                      {work.modelName}
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        {work.modelId}
                      </span>
                    </>
                  )}
                </td>
                <td>{work.promptId}</td>
                <td>
                  <span className="admin-toggle">
                    <button
                      className={`admin-switch${work.published ? ' on' : ''}`}
                      disabled={!!busyId}
                      onClick={() => togglePublish(work)}
                      aria-pressed={work.published}
                      aria-label={`${work.published ? '下架' : '发布'}：${work.title}`}
                      title={work.published ? '点击下架' : '点击发布'}
                    />
                    <i className={work.published ? 'on' : ''}>
                      {work.published ? '已发布' : '草稿'}
                    </i>
                  </span>
                </td>
                <td className="muted">{fmt(work.createdAt)}</td>
                <td>
                  <div className="admin-actions">
                    {work.src && (
                      <a
                        className="admin-link"
                        href={work.src}
                        target="_blank"
                        rel="noreferrer"
                      >
                        预览
                      </a>
                    )}
                    {editing ? (
                      <>
                        <button
                          className="admin-mini primary"
                          disabled={!!busyId}
                          onClick={() => saveEdit(work)}
                        >
                          保存
                        </button>
                        <button
                          className="admin-mini"
                          onClick={() => setEditingId(null)}
                        >
                          取消
                        </button>
                      </>
                    ) : (
                      <button
                        className="admin-mini"
                        onClick={() => {
                          setEditingId(work.id);
                          setDraftTitle(work.title);
                          setDraftModel(work.modelName);
                        }}
                      >
                        编辑
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {!loading && works.length === 0 && (
            <tr>
              <td
                colSpan={6}
                className="muted"
                style={{ textAlign: 'center', padding: 32 }}
              >
                没有匹配的作品。
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p style={{ color: '#8a9184', fontSize: 12, marginTop: 10 }}>
        {loading ? '加载中…' : `共 ${total} 件，显示 ${works.length} 件`}
        {works.length < total && (
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
