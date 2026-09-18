// Work IDs and source files stay unchanged; calibration is display metadata.
import { useEffect, useState } from 'react';
import { useAdminPromptOptions } from './use-admin-prompts';
import { WorkCalibration } from './work-calibration';
import { patchWork, type AdminWork } from './work-types';
import './works.css';

export function AdminWorks() {
  const prompts = useAdminPromptOptions();
  const [prompt, setPrompt] = useState('');
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<{ works: AdminWork[]; total: number }>({
    works: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [model, setModel] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [calibrating, setCalibrating] = useState<AdminWork | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          limit: '30',
          offset: String(page * 30),
          status,
          q: q.trim(),
        });
        if (prompt) params.set('prompt', prompt);
        const response = await fetch(`/api/admin/works?${params}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('作品加载失败，请重试');
        const next = await response.json();
        if (controller.signal.aborted) return;
        if (page > 0 && !next.works.length)
          setPage(Math.max(0, Math.ceil(next.total / 30) - 1));
        else setData(next);
        setError('');
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [prompt, status, q, page, revision]);
  const filters = (change: () => void) => {
    change();
    setPage(0);
    setEditing(null);
    setNotice('');
    setLoading(true);
  };
  const save = async (work: AdminWork, values: object, message: string) => {
    setBusy(work.id);
    setFieldError('');
    setError('');
    try {
      const fresh = await patchWork(work.id, values);
      setData((d) => ({
        ...d,
        works: d.works.map((w) => (w.id === fresh.id ? fresh : w)),
      }));
      setEditing(null);
      setNotice(message);
      setRevision((n) => n + 1);
    } catch (e) {
      const message = e instanceof Error ? e.message : '保存失败';
      if (editing === work.id) setFieldError(message);
      else setError(message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="works-manager">
      <header className="works-header">
        <div>
          <span className="works-eyebrow">内容工作台</span>
          <h1>作品管理</h1>
          <p>查找作品、调整展示，再决定是否发布。</p>
        </div>
        <a className="works-secondary" href="/admin.html#inbox">
          登记新作品 ↗
        </a>
      </header>
      <div className="works-filterbar">
        <label className="works-search">
          <span>搜索作品</span>
          <input
            aria-label="搜索作品"
            placeholder="标题、模型名称或作品 ID…"
            value={q}
            disabled={!!busy || !!editing}
            onChange={(e) => filters(() => setQ(e.target.value))}
          />
        </label>
        <label>
          <span>所属题目</span>
          <select
            aria-label="按题目筛选"
            value={prompt}
            disabled={!!busy || !!editing}
            onChange={(e) => filters(() => setPrompt(e.target.value))}
          >
            <option value="">全部题目</option>
            {prompts.map((p) => (
              <option value={p.id} key={p.id}>
                {p.id} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="works-segments">
          {[
            ['all', '全部'],
            ['published', '已发布'],
            ['draft', '草稿'],
          ].map(([value, label]) => (
            <button
              key={value}
              disabled={!!busy || !!editing}
              aria-pressed={status === value}
              onClick={() => {
                // 重复点击当前筛选不能走 filters()：状态全无变化时依赖不变、
                // effect 不重跑，无条件置位的 loading 会把页面永久卡死。
                // 仅在第 2 页起回第一页（状态变了 effect 自然重跑）
                if (value === status) {
                  if (page > 0) setPage(0);
                  return;
                }
                filters(() => setStatus(value));
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          disabled={!!busy || !!editing}
          onClick={() => {
            setLoading(true);
            setRevision((n) => n + 1);
          }}
        >
          刷新
        </button>
      </div>
      <div className="works-list-meta">
        <span>{loading ? '正在加载…' : `找到 ${data.total} 份作品`}</span>
        {(q || prompt || status !== 'all') && (
          <button
            disabled={!!busy || !!editing}
            onClick={() =>
              filters(() => {
                setQ('');
                setPrompt('');
                setStatus('all');
              })
            }
          >
            清除筛选
          </button>
        )}
        <span className="works-notice" aria-live="polite">
          {notice}
        </span>
      </div>
      {error && (
        <div className="admin-error" role="alert">
          {error}
        </div>
      )}
      <div className="works-list" aria-busy={loading}>
        {data.works.map((work) => (
          <article key={work.id} className="works-row">
            <div className="works-type" aria-hidden="true">
              {work.content?.kind === 'html'
                ? '</>'
                : work.content?.kind === 'text'
                  ? 'Aa'
                  : '▧'}
            </div>
            <div className="works-info">
              <div className="works-row-tags">
                <span>
                  {work.promptId} ·{' '}
                  {prompts.find((p) => p.id === work.promptId)?.name || '题目'}
                </span>
                {work.isDemo && <span>演示作品</span>}
                {work.content?.kind === 'html' && (
                  <span className={work.content.framing ? 'calibrated' : ''}>
                    {work.content.framing ? '已校准' : '默认画布'}
                  </span>
                )}
              </div>
              {editing === work.id ? (
                <form
                  className="works-edit"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!title.trim() || !model.trim()) {
                      setFieldError('标题和模型名称不能为空');
                      return;
                    }
                    void save(
                      work,
                      { title, modelName: model },
                      '作品信息已保存',
                    );
                  }}
                >
                  <label>
                    作品标题
                    <input
                      aria-label="编辑标题"
                      value={title}
                      maxLength={120}
                      onChange={(e) => setTitle(e.target.value)}
                      disabled={!!busy}
                    />
                  </label>
                  <label>
                    模型显示名
                    <input
                      aria-label="编辑模型名"
                      value={model}
                      maxLength={64}
                      onChange={(e) => setModel(e.target.value)}
                      disabled={!!busy}
                    />
                  </label>
                  <div>
                    <button className="works-primary" disabled={!!busy}>
                      保存信息
                    </button>
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => setEditing(null)}
                    >
                      取消
                    </button>
                    <span className="works-error" role="alert">
                      {fieldError}
                    </span>
                  </div>
                </form>
              ) : (
                <>
                  <h2>{work.title}</h2>
                  <p className="works-model">{work.modelName}</p>
                </>
              )}
              <details className="works-details">
                <summary>作品信息</summary>
                <span>作品 ID：{work.id}</span>
                <span>模型 ID：{work.modelId}</span>
                <span>
                  登记：{new Date(work.createdAt).toLocaleString('zh-CN')}
                </span>
              </details>
            </div>
            <div className="works-operations">
              <span
                className={`works-status ${work.published ? 'published' : ''}`}
              >
                {work.published ? '● 已发布' : '○ 草稿'}
              </span>
              <div>
                {work.content?.kind === 'html' && (
                  <button
                    className="works-primary"
                    disabled={!!busy || loading || !!editing}
                    onClick={() => {
                      setEditing(null);
                      setCalibrating(work);
                    }}
                  >
                    画布校准
                  </button>
                )}
                {work.src && (
                  <a
                    className="works-secondary"
                    href={work.src}
                    target="_blank"
                    rel="noreferrer"
                  >
                    原作 ↗
                  </a>
                )}
                <button
                  disabled={!!busy || loading || !!editing}
                  onClick={() => {
                    setEditing(work.id);
                    setTitle(work.title);
                    setModel(work.modelName);
                    setFieldError('');
                  }}
                >
                  编辑信息
                </button>
                <button
                  disabled={!!busy || loading || !!editing}
                  onClick={() =>
                    void save(
                      work,
                      { published: !work.published },
                      work.published
                        ? '作品已下架，历史投票保留'
                        : '作品已发布',
                    )
                  }
                >
                  {busy === work.id
                    ? '保存中…'
                    : work.published
                      ? '下架'
                      : '发布'}
                </button>
              </div>
            </div>
          </article>
        ))}
        {!loading && !data.works.length && (
          <div className="works-empty">
            <h2>没有匹配的作品</h2>
            <p>试试其他关键词，或清除筛选条件。</p>
          </div>
        )}
      </div>
      <footer className="works-pagination">
        <small>下架不会删除作品，也不会影响历史投票。</small>
        <button
          disabled={loading || !!busy || !!editing || page === 0}
          onClick={() => {
            setPage((p) => p - 1);
            setEditing(null);
            setLoading(true);
          }}
        >
          上一页
        </button>
        <span>
          {page + 1} / {Math.max(1, Math.ceil(data.total / 30))}
        </span>
        <button
          disabled={
            loading || !!busy || !!editing || (page + 1) * 30 >= data.total
          }
          onClick={() => {
            setPage((p) => p + 1);
            setEditing(null);
            setLoading(true);
          }}
        >
          下一页
        </button>
      </footer>
      {calibrating && (
        <WorkCalibration
          key={calibrating.id}
          work={calibrating}
          onClose={() => setCalibrating(null)}
          onSaved={(fresh) => {
            setData((d) => ({
              ...d,
              works: d.works.map((w) => (w.id === fresh.id ? fresh : w)),
            }));
            setCalibrating(null);
            setNotice('画布校准已保存，前台刷新后生效');
          }}
        />
      )}
    </section>
  );
}
