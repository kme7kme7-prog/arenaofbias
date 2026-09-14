// 模一把（后台）：游玩数据统计 + 手动追加模型。
// 统计来自 POST /api/guess/result 的匿名上报（一局结束一条，2026-09-14 起），
// 只含「打完的局」：猜中、8 次用尽或手动看答案（计负场）都算结束；中途
// 关页的局不报。练习模式不限次不上报（决策 064）。guess_results.difficulty：
// 0 = 每日一题（064 起口径），1-3 = 三档难度时期（060）的历史记录。
// 追加模型写 data/guess-models-extra.json 并即时生效：只能追加不能改，
// 与数据集契约一致（改已有条目的难度/顺序会重排历史答案，不走这里）。
import { useCallback, useEffect, useRef, useState } from 'react';

type Stats = {
  day: string;
  totals: { played: number; won: number; avgSteps: number | null };
  today: { played: number; won: number };
  byDifficulty: {
    difficulty: number;
    played: number;
    won: number;
    avgSteps: number | null;
  }[];
  byDay: { day: string; played: number; won: number }[];
  byModel: {
    id: string;
    name: string;
    times: number;
    won: number;
    avgSteps: number | null;
  }[];
};

type ModelRow = {
  id: string;
  name: string;
  vendor: string;
  released: string;
  difficulty: number;
  extra: boolean;
};

type ModelsResponse = {
  total: number;
  extraCount: number;
  vendors: { org: string; region: string }[];
  models: ModelRow[];
};

// difficulty=0 是 064 起的每日一题；1-3 是 060 三档时期的历史记录
const DIFFICULTY_LABEL: Record<number, string> = {
  0: '每日一题',
  1: '简单（旧）',
  2: '标准（旧）',
  3: '困难（旧）',
};
// 数据集清单用现行难度名——「（旧）」是 guess_results 历史流水的口径，
// 现行数据集的 1/2/3 就是现行三档，别混用
const POOL_LABEL: Record<number, string> = {
  1: '简单',
  2: '标准',
  3: '困难',
};

const pct = (won: number, played: number) =>
  played > 0 ? `${Math.round((won / played) * 100)}%` : '—';
const steps = (v: number | null) => (v === null ? '—' : v.toFixed(1));

const MODALITIES = ['image', 'audio', 'video'] as const;

type FormState = {
  name: string;
  id: string;
  org: string;
  region: string;
  year: string;
  month: string;
  difficulty: string;
  popularity: string;
  contextK: string;
  priceOut: string;
  openWeights: boolean;
  reasoning: boolean;
  modalities: string[];
};

const EMPTY_FORM: FormState = {
  name: '',
  id: '',
  org: '',
  region: '',
  year: '',
  month: '',
  difficulty: '2',
  popularity: '20',
  contextK: '',
  priceOut: '',
  openWeights: false,
  reasoning: false,
  modalities: [],
};

export function AdminGuess() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [models, setModels] = useState<ModelsResponse | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [modelQuery, setModelQuery] = useState('');
  const requestId = useRef(0);

  const load = useCallback(() => {
    const request = ++requestId.current;
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return Promise.all([
      fetch('/api/admin/guess/stats').then((r) =>
        r.ok ? (r.json() as Promise<Stats>) : Promise.reject(new Error()),
      ),
      fetch('/api/admin/guess/models').then((r) =>
        r.ok ? (r.json() as Promise<ModelsResponse>) : Promise.reject(new Error()),
      ),
    ])
      .then(([s, m]) => {
        if (request !== requestId.current) return;
        setStats(s);
        setModels(m);
        setError('');
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('数据加载失败，稍后重试。');
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (patch: Partial<FormState>) =>
    setForm((f) => ({ ...f, ...patch }));

  const orgKnown =
    models?.vendors.some((v) => v.org === form.org.trim()) ?? false;

  const save = () => {
    if (busy) return;
    setBusy(true);
    setNotice('');
    fetch('/api/admin/guess/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        id: form.id || undefined,
        org: form.org,
        region: form.region || undefined,
        year: Number(form.year),
        month: Number(form.month),
        difficulty: Number(form.difficulty),
        popularity: Number(form.popularity),
        contextK: form.contextK === '' ? null : Number(form.contextK),
        priceOut: form.priceOut === '' ? null : Number(form.priceOut),
        openWeights: form.openWeights,
        reasoning: form.reasoning,
        modalities: ['text', ...form.modalities],
      }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          model?: { name: string };
        };
        if (!response.ok) throw new Error(data.error || '保存失败，稍后再试。');
        return data;
      })
      .then((data) => {
        setNotice(`已追加「${data.model?.name ?? form.name}」，即时生效。`);
        setForm(EMPTY_FORM);
        setShowForm(false);
        setError('');
        void load();
      })
      .catch((saveError: unknown) =>
        setError(
          saveError instanceof Error ? saveError.message : '保存失败，稍后再试。',
        ),
      )
      .finally(() => setBusy(false));
  };

  const extras = models?.models.filter((m) => m.extra) ?? [];
  const q = modelQuery.trim().toLowerCase();
  const filteredModels = q
    ? (models?.models ?? []).filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.id.includes(q) ||
          m.vendor.toLowerCase().includes(q),
      )
    : (models?.models ?? []);

  return (
    <section>
      <h1>模一把</h1>
      <p className="admin-sub">
        游玩数据来自对局结束时的匿名上报（只统计打完的局，2026-09-14 起有数据）。
        模型可手动追加，即时生效；已有条目不可在此修改（会重排历史答案）。
      </p>
      {error && <div className="admin-error">{error}</div>}
      {notice && <p className="admin-note">{notice}</p>}

      {stats && (
        <>
          <div className="admin-cards">
            <div className="admin-card">
              <b>{stats.totals.played}</b>
              <span>累计完成局数</span>
              <small>今日 {stats.today.played} 局</small>
            </div>
            <div className="admin-card">
              <b>{pct(stats.totals.won, stats.totals.played)}</b>
              <span>总猜中率</span>
              <small>今日 {pct(stats.today.won, stats.today.played)}</small>
            </div>
            <div className="admin-card">
              <b>{steps(stats.totals.avgSteps)}</b>
              <span>胜局平均步数</span>
              <small>只计猜中的局（满 8 步未中不计）</small>
            </div>
            <div className="admin-card">
              <b>{models?.total ?? '—'}</b>
              <span>可猜模型总数</span>
              <small>后台追加 {models?.extraCount ?? 0} 个</small>
            </div>
          </div>

          <div className="admin-trend">
            <h2>按模式（每日一题 / 旧难度档）</h2>
            {stats.byDifficulty.length === 0 ? (
              <div className="empty">还没有游玩数据。</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>模式</th>
                    <th>完成局数</th>
                    <th>猜中率</th>
                    <th>胜局平均步数</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byDifficulty.map((row) => (
                    <tr key={row.difficulty}>
                      <td>
                        {DIFFICULTY_LABEL[row.difficulty] ?? row.difficulty}
                      </td>
                      <td>{row.played}</td>
                      <td>{pct(row.won, row.played)}</td>
                      <td>{steps(row.avgSteps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="admin-trend">
            <h2>按答案模型（平均猜出步数）</h2>
            {stats.byModel.length === 0 ? (
              <div className="empty">还没有游玩数据。</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>答案模型</th>
                    <th>出场次数</th>
                    <th>猜中率</th>
                    <th>胜局平均步数</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byModel.slice(0, 40).map((row) => (
                    <tr key={row.id}>
                      <td>
                        {row.name}
                        <span
                          className="muted"
                          style={{ marginLeft: 6, fontSize: 12 }}
                        >
                          {row.id}
                        </span>
                      </td>
                      <td>{row.times}</td>
                      <td>{pct(row.won, row.times)}</td>
                      <td>{steps(row.avgSteps)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {stats.byModel.length > 40 && (
              <p style={{ color: '#8a9184', fontSize: 12, marginTop: 10 }}>
                共 {stats.byModel.length} 个模型，按出场次数显示前 40
              </p>
            )}
          </div>

          <div className="admin-trend">
            <h2>近 14 日完成局数</h2>
            {stats.byDay.length === 0 ? (
              <div className="empty">还没有游玩数据。</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th>完成局数</th>
                    <th>猜中率</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byDay.map((row) => (
                    <tr key={row.day}>
                      <td>{row.day}</td>
                      <td>{row.played}</td>
                      <td>{pct(row.won, row.played)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="admin-trend">
        <h2>模型数据集</h2>
        <div className="admin-toolbar">
          <input
            value={modelQuery}
            onChange={(event) => setModelQuery(event.target.value)}
            placeholder="搜索名称 / id / 厂商"
            aria-label="搜索模型"
          />
          <button className="reload" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '收起表单' : '追加模型'}
          </button>
        </div>

        {showForm && (
          <div className="admin-form">
            <h2>追加新模型</h2>
            <p className="admin-note">
              只能追加到数据集末尾。保存后立即生效：马上可被猜、进练习池；每日题从
              明天起才可能抽到它（当天与历史答案不变）。已有条目不可在此修改
              （会重排历史答案）。字段口径与 lib/guess-models.json 一致；未公开的数值留空即「?」。
            </p>
            <div className="admin-form-grid">
              <label>
                显示名 *
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => update({ name: event.target.value })}
                  placeholder="如：GPT-6 Astra"
                />
              </label>
              <label>
                id（留空按名称生成 kebab）
                <input
                  type="text"
                  value={form.id}
                  onChange={(event) => update({ id: event.target.value })}
                  placeholder="如：gpt-6-astra"
                />
              </label>
              <label>
                厂商 *（新厂商须填地区码）
                <input
                  type="text"
                  list="guess-vendors"
                  value={form.org}
                  onChange={(event) => update({ org: event.target.value })}
                  placeholder="如：OpenAI"
                />
                <datalist id="guess-vendors">
                  {(models?.vendors ?? []).map((v) => (
                    <option key={v.org} value={v.org}>
                      {v.region}
                    </option>
                  ))}
                </datalist>
              </label>
              <label>
                厂商地区码{orgKnown ? '（已登记，可留空）' : ' *'}
                <input
                  type="text"
                  value={form.region}
                  onChange={(event) => update({ region: event.target.value })}
                  placeholder="如：CN / US / JP"
                  maxLength={2}
                />
              </label>
              <label>
                发布年 *
                <input
                  type="number"
                  value={form.year}
                  onChange={(event) => update({ year: event.target.value })}
                  placeholder="2026"
                />
              </label>
              <label>
                发布月 *
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={form.month}
                  onChange={(event) => update({ month: event.target.value })}
                  placeholder="9"
                />
              </label>
              <label>
                难度 *（练习分池；每日池=简单+标准）
                <select
                  value={form.difficulty}
                  onChange={(event) =>
                    update({ difficulty: event.target.value })
                  }
                >
                  <option value="1">简单</option>
                  <option value="2">标准</option>
                  <option value="3">困难</option>
                </select>
              </label>
              <label>
                知名度（0-100，影响空搜索候选排序）
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={form.popularity}
                  onChange={(event) =>
                    update({ popularity: event.target.value })
                  }
                />
              </label>
              <label>
                上下文窗口（K token，未公开留空）
                <input
                  type="number"
                  value={form.contextK}
                  onChange={(event) => update({ contextK: event.target.value })}
                  placeholder="如：128"
                />
              </label>
              <label>
                输出单价 $/M（无一手价留空）
                <input
                  type="number"
                  step="0.01"
                  value={form.priceOut}
                  onChange={(event) => update({ priceOut: event.target.value })}
                  placeholder="如：4.4"
                />
              </label>
            </div>
            <label className="chk">
              <input
                type="checkbox"
                checked={form.openWeights}
                onChange={(event) =>
                  update({ openWeights: event.target.checked })
                }
              />
              开放权重
            </label>
            <label className="chk">
              <input
                type="checkbox"
                checked={form.reasoning}
                onChange={(event) => update({ reasoning: event.target.checked })}
              />
              推理模型
            </label>
            <div className="chk" style={{ display: 'flex', gap: 14 }}>
              <span>模态（text 恒在）：</span>
              {MODALITIES.map((mod) => (
                <label key={mod} className="chk" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={form.modalities.includes(mod)}
                    onChange={(event) =>
                      update({
                        modalities: event.target.checked
                          ? [...form.modalities, mod]
                          : form.modalities.filter((m) => m !== mod),
                      })
                    }
                  />
                  {mod}
                </label>
              ))}
            </div>
            <div className="admin-actions" style={{ marginTop: 4 }}>
              <button className="admin-mini primary" disabled={busy} onClick={save}>
                追加
              </button>
              <button className="admin-mini" onClick={() => setShowForm(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        <table className="admin-table">
          <thead>
            <tr>
              <th>名称</th>
              <th>厂商</th>
              <th>发布</th>
              <th>难度</th>
              <th>来源</th>
            </tr>
          </thead>
          <tbody>
            {filteredModels.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.name}
                  <span className="muted" style={{ marginLeft: 6, fontSize: 12 }}>
                    {m.id}
                  </span>
                </td>
                <td>{m.vendor}</td>
                <td className="muted">{m.released}</td>
                <td>{POOL_LABEL[m.difficulty] ?? m.difficulty}</td>
                <td>{m.extra ? <i className="admin-badge">后台追加</i> : '数据集'}</td>
              </tr>
            ))}
            {filteredModels.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="muted"
                  style={{ textAlign: 'center', padding: 32 }}
                >
                  没有匹配的模型。
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <p style={{ color: '#8a9184', fontSize: 12, marginTop: 10 }}>
          {models
            ? `共 ${models.total} 个可猜模型（含组内版本），后台追加 ${extras.length} 个`
            : '加载中…'}
        </p>
      </div>
    </section>
  );
}
