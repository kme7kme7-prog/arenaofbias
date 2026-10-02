// 题目管理（后台第三步，决策 045）：全量题目（含下架）、每题作品/票数统计、
// 新增（编号自动）/编辑（文案自由改——不影响已有投票，用户拍板）、上下架滑块
//（下架 = 前台完全隐藏：题库页不显示、竞技场进不去、不进随机池；历史票保留）。
// 约束：不提供删除——作品与投票流水引用题目。
// 六维权重（决策 093）也在此调整：权重是重放参数，保存后该题历史票
// 即时按新口径重算六维画像，票面不动。
// 数据来自 GET/POST/PATCH /api/admin/prompts。
import { apiFetch } from '@/lib/api';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RADAR_DIMENSIONS } from '@/lib/leaderboard';

type AdminPrompt = {
  id: string;
  kind: 'image' | 'text' | 'web';
  category: string;
  code: string;
  name: string;
  prompt: string;
  commentary: string;
  detail: string;
  /** 六维权重（0–1、合计 1）；缺省 = 未配置 → 前台六维均分兜底 */
  weights?: number[];
  published: boolean;
  createdAt: number;
  worksCount: number;
  voteCount: number;
};

type FormState = {
  kind: 'image' | 'text' | 'web';
  name: string;
  prompt: string;
  category: string;
  code: string;
  commentary: string;
  detail: string;
  /** 六维权重（0–1，保存时要求合计 1） */
  weights: number[];
  publish: boolean;
};

const KIND_LABEL: Record<string, string> = {
  image: '图像',
  text: '文字',
  web: '网页',
};

const EVEN_WEIGHTS = RADAR_DIMENSIONS.map(() => 1 / 6);

const emptyForm: FormState = {
  kind: 'web',
  name: '',
  prompt: '',
  category: '',
  code: '',
  commentary: '',
  detail: '',
  weights: EVEN_WEIGHTS,
  publish: false,
};

/** 权重摘要：只列非零维，如「视觉 60 · 动态 30」；未配置显示均分兜底 */
function weightsSummary(weights?: number[]): string {
  if (!weights) return '六维均分（未配置）';
  return RADAR_DIMENSIONS.map((label, i) => ({ label, w: weights[i] ?? 0 }))
    .filter((item) => item.w > 0)
    .map((item) => `${item.label} ${Math.round(item.w * 100)}`)
    .join(' · ');
}

export function AdminPrompts() {
  const [prompts, setPrompts] = useState<AdminPrompt[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  // null = 列表态；'new' = 新增；其余为编辑中的题目 id
  const [editing, setEditing] = useState<string | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const request = ++requestId.current;
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return apiFetch('/api/admin/prompts')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ prompts: AdminPrompt[] }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (request !== requestId.current) return;
        setPrompts(data.prompts);
        setError('');
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('题目清单加载失败，稍后重试。');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (patch: Partial<FormState>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const startNew = () => {
    setIsNew(true);
    setEditing('new');
    setForm(emptyForm);
    setMessage('');
    setError('');
  };

  const startEdit = (prompt: AdminPrompt) => {
    setIsNew(false);
    setEditing(prompt.id);
    setForm({
      kind: prompt.kind,
      name: prompt.name,
      prompt: prompt.prompt,
      category: prompt.category,
      code: prompt.code,
      commentary: prompt.commentary,
      detail: prompt.detail,
      weights: prompt.weights ? [...prompt.weights] : [...EVEN_WEIGHTS],
      publish: prompt.published,
    });
    setMessage('');
    setError('');
  };

  const closeForm = () => {
    setEditing(null);
    setIsNew(false);
  };

  // 上下架：乐观翻转，失败回滚（与作品管理同一交互）。下架 = 前台完全隐藏
  const togglePublish = (prompt: AdminPrompt) => {
    if (busy) return;
    setBusy(true);
    setPrompts((rows) =>
      rows.map((row) =>
        row.id === prompt.id ? { ...row, published: !row.published } : row,
      ),
    );
    apiFetch(`/api/admin/prompts/${encodeURIComponent(prompt.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !prompt.published }),
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || '保存失败，稍后再试。');
        }
      })
      .then(() => {
        setError('');
        setMessage(
          `${prompt.id} 已${prompt.published ? '下架（前台完全隐藏）' : '上架（前台刷新即见）'}`,
        );
      })
      .catch((saveError: unknown) => {
        setPrompts((rows) =>
          rows.map((row) =>
            row.id === prompt.id ? { ...row, published: prompt.published } : row,
          ),
        );
        setError(
          saveError instanceof Error ? saveError.message : '保存失败，稍后再试。',
        );
      })
      .finally(() => setBusy(false));
  };

  const save = () => {
    if (busy) return;
    if (!form.name.trim()) {
      setError('先填题目名称。');
      return;
    }
    if (!form.prompt.trim()) {
      setError('先填提示词全文。');
      return;
    }
    const weightsSum = form.weights.reduce((total, w) => total + w, 0);
    if (Math.abs(weightsSum - 1) > 0.005) {
      setError(
        `六维权重合计须为 100%（当前 ${(weightsSum * 100).toFixed(1)}%）。`,
      );
      return;
    }
    setBusy(true);
    const body = {
      kind: form.kind,
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      category: form.category.trim(),
      code: form.code.trim(),
      commentary: form.commentary.trim(),
      detail: form.detail.trim(),
      // 归一化后提交，舍入误差不带进库
      weights: form.weights.map((w) => w / weightsSum),
    };
    const request = isNew
      ? apiFetch('/api/admin/prompts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, published: form.publish }),
        })
      : apiFetch(`/api/admin/prompts/${encodeURIComponent(editing ?? '')}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
    request
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          prompt?: AdminPrompt;
        };
        if (!response.ok || !data.prompt)
          throw new Error(data.error || '保存失败，稍后再试。');
        return data.prompt;
      })
      .then((saved) => {
        setMessage(
          isNew
            ? `已新增 ${saved.id} ${saved.name}${saved.published ? '（已上架）' : '（草稿——去收件箱登记作品，检查后上架）'}`
            : `已保存 ${saved.id} 的修改（不影响已有投票）`,
        );
        setError('');
        closeForm();
        void load();
      })
      .catch((saveError: unknown) =>
        setError(
          saveError instanceof Error ? saveError.message : '保存失败，稍后再试。',
        ),
      )
      .finally(() => setBusy(false));
  };

  return (
    <section>
      <h1>题目管理</h1>
      <p className="admin-sub">
        全部题目（含下架）。下架 = 前台完全隐藏（题库页不显示、竞技场进不去、不进随机池），
        历史票保留在榜单；修改文案不影响已有投票。出流水完整性不提供删除。
      </p>
      {error && <div className="admin-error">{error}</div>}
      {message && <div className="admin-ok">{message}</div>}
      {editing === null ? (
        <>
          <div className="admin-toolbar">
            <button className="admin-mini primary" disabled={busy} onClick={startNew}>
              新增题目
            </button>
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
          <table className="admin-table">
            <thead>
              <tr>
                <th>编号</th>
                <th>名称</th>
                <th>类型</th>
                <th>作品</th>
                <th>票数</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map((prompt) => (
                <tr key={prompt.id}>
                  <td>{prompt.id}</td>
                  <td className="wrap" style={{ minWidth: 180 }}>
                    {prompt.name}
                    {prompt.category && (
                      <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                        {prompt.category}
                      </span>
                    )}
                    <span
                      className="muted"
                      style={{ display: 'block', fontSize: 11, marginTop: 3 }}
                    >
                      {weightsSummary(prompt.weights)}
                    </span>
                  </td>
                  <td>{KIND_LABEL[prompt.kind] ?? prompt.kind}</td>
                  <td>{prompt.worksCount}</td>
                  <td>{prompt.voteCount}</td>
                  <td>
                    <span className="admin-toggle">
                      <button
                        className={`admin-switch${prompt.published ? ' on' : ''}`}
                        disabled={busy}
                        onClick={() => togglePublish(prompt)}
                        aria-pressed={prompt.published}
                        aria-label={`${prompt.published ? '下架' : '上架'}：${prompt.name}`}
                        title={prompt.published ? '点击下架（前台完全隐藏）' : '点击上架'}
                      />
                      <i className={prompt.published ? 'on' : ''}>
                        {prompt.published ? '已上架' : '已下架'}
                      </i>
                    </span>
                  </td>
                  <td>
                    <div className="admin-actions">
                      <button
                        className="admin-mini"
                        disabled={busy}
                        onClick={() => startEdit(prompt)}
                        aria-label={`编辑题目 ${prompt.id} ${prompt.name}`}
                      >
                        编辑
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && prompts.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="muted"
                    style={{ textAlign: 'center', padding: 32 }}
                  >
                    还没有题目。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p style={{ color: '#8a9184', fontSize: 12, marginTop: 10 }}>
            {loading ? '加载中…' : `共 ${prompts.length} 题`}
          </p>
        </>
      ) : (
        <div className="admin-form">
          <h2>{isNew ? '新增题目' : `编辑 ${editing}`}</h2>
          {!isNew && form.publish && (
            <p className="admin-note">
              该题目已上架：修改文案随时可存，不影响已有投票。
            </p>
          )}
          <div className="admin-form-grid">
            <label>
              类型（决定榜单赛道：文字→写作榜，网页→网页榜）
              <select
                value={form.kind}
                onChange={(event) =>
                  update({ kind: event.target.value as FormState['kind'] })
                }
              >
                <option value="web">网页</option>
                <option value="text">文字</option>
                <option value="image">图像</option>
              </select>
            </label>
            <label>
              名称 *
              <input
                type="text"
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
                placeholder="如：环游轨道"
              />
            </label>
            <label>
              分类
              <input
                type="text"
                value={form.category}
                onChange={(event) => update({ category: event.target.value })}
                placeholder="如：网页设计 / 3D 场景"
              />
            </label>
            <label>
              代号
              <input
                type="text"
                value={form.code}
                onChange={(event) => update({ code: event.target.value })}
                placeholder="如：WEB / VOXEL"
              />
            </label>
            <label>
              一句话点评
              <input
                type="text"
                value={form.commentary}
                onChange={(event) => update({ commentary: event.target.value })}
                placeholder="题库页的一句风味文案"
              />
            </label>
            <label>
              题库页副标
              <input
                type="text"
                value={form.detail}
                onChange={(event) => update({ detail: event.target.value })}
                placeholder="如：同一需求 · 两种表达"
              />
            </label>
          </div>
          <label>
            提示词全文 *
            <textarea
              value={form.prompt}
              onChange={(event) => update({ prompt: event.target.value })}
              rows={10}
              placeholder="发给模型的完整提示词"
            />
          </label>
          <div>
            <p className="admin-note" style={{ margin: '0 0 6px' }}>
              六维权重（%）——决定这题的票往哪些维度记账；保存后历史票即时按新口径重放。
            </p>
            <div className="admin-form-grid">
              {RADAR_DIMENSIONS.map((label, index) => (
                <label key={label}>
                  {label}
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={Math.round((form.weights[index] ?? 0) * 1000) / 10}
                    onChange={(event) => {
                      const percent = Number(event.target.value);
                      const next = [...form.weights];
                      next[index] = Number.isFinite(percent)
                        ? Math.min(100, Math.max(0, percent)) / 100
                        : 0;
                      update({ weights: next });
                    }}
                  />
                </label>
              ))}
            </div>
            <p
              className="admin-note"
              style={{
                margin: '6px 0 0',
                color:
                  Math.abs(
                    form.weights.reduce((total, w) => total + w, 0) - 1,
                  ) <= 0.005
                    ? undefined
                    : '#c0492f',
              }}
            >
              合计{' '}
              {(form.weights.reduce((total, w) => total + w, 0) * 100).toFixed(
                1,
              )}
              %{/* 均分快捷操作：六格各 1/6，仍是「已配置」的显式权重 */}
              <button
                type="button"
                className="admin-mini"
                style={{ marginLeft: 12 }}
                onClick={() => update({ weights: [...EVEN_WEIGHTS] })}
              >
                六维均分
              </button>
            </p>
          </div>
          {isNew && (
            <label className="chk">
              <input
                type="checkbox"
                checked={form.publish}
                onChange={(event) => update({ publish: event.target.checked })}
              />
              保存后立即上架（默认存为草稿；新题通常要先去收件箱登记作品）
            </label>
          )}
          <div className="admin-actions" style={{ marginTop: 4 }}>
            <button className="admin-mini primary" disabled={busy} onClick={save}>
              保存
            </button>
            <button className="admin-mini" onClick={closeForm}>
              取消
            </button>
            {isNew && (
              <span className="admin-note" style={{ margin: 0 }}>
                编号按当前最大题号自动分配
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
