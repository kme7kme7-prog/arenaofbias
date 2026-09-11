// 收件箱（后台第二期，决策 044）：宝塔/本机把待登记文件放进服务器收件箱目录
// （默认 data/inbox），这里逐个登记——选题目、确认标题与模型名，登记即把文件
// 搬进 data/works/<题号>/ 并入库。默认草稿，去「作品管理」检查后发布；
// 每件也可勾选「登记后立即发布」。解析规则与 scripts/register-works.mjs 同源
//（server/works-register.js）。
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminPromptOptions } from '@/app/admin/use-admin-prompts';

type InboxEntry = {
  name: string;
  type: 'file' | 'dir';
  size: number | null;
  registerable: boolean;
  reason: string | null;
  suggest: { title: string; model: string } | null;
};

type InboxForm = {
  title: string;
  model: string;
  promptId: string;
  publish: boolean;
};

export function AdminInbox() {
  const promptOptions = useAdminPromptOptions();
  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<InboxEntry[]>([]);
  const [forms, setForms] = useState<Record<string, InboxForm>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyName, setBusyName] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const request = ++requestId.current;
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return fetch('/api/admin/inbox')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ dir: string; entries: InboxEntry[] }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (request !== requestId.current) return;
        setDir(data.dir);
        setEntries(data.entries);
        // 新条目带出默认表单；同名条目保留已编辑的现场
        setForms((prev) => {
          const next: Record<string, InboxForm> = {};
          for (const entry of data.entries) {
            next[entry.name] =
              prev[entry.name] ?? {
                title: entry.suggest?.title ?? '',
                model: entry.suggest?.model ?? '',
                promptId: '',
                publish: false,
              };
          }
          return next;
        });
        setError('');
        setLoading(false);
      })
      .catch(() => {
        if (request !== requestId.current) return;
        setError('收件箱读取失败，稍后重试。');
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateForm = (name: string, patch: Partial<InboxForm>) =>
    setForms((prev) => ({
      ...prev,
      [name]: { ...prev[name], ...patch },
    }));

  const register = (entry: InboxEntry) => {
    const form = forms[entry.name];
    if (!form?.promptId) {
      setError(`${entry.name}：先选好题目再登记。`);
      return;
    }
    if (!form.model.trim()) {
      setError(`${entry.name}：先填模型名。`);
      return;
    }
    if (busyName) return;
    setBusyName(entry.name);
    fetch('/api/admin/inbox/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: entry.name,
        promptId: form.promptId,
        modelName: form.model.trim(),
        title: form.title.trim(),
        publish: form.publish,
      }),
    })
      .then(async (response) => {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
          work?: { id: string };
        };
        if (!response.ok || !data.work)
          throw new Error(data.error || '登记失败，稍后再试。');
        return data.work;
      })
      .then((work) => {
        setEntries((rows) => rows.filter((row) => row.name !== entry.name));
        setMessage(
          `${entry.name} 已登记为 ${work.id}` +
            (form.publish
              ? '（已发布，前台刷新即见）'
              : '（草稿——去「作品管理」检查后发布）'),
        );
        setError('');
      })
      .catch((registerError: unknown) =>
        setError(
          registerError instanceof Error
            ? registerError.message
            : '登记失败，稍后再试。',
        ),
      )
      .finally(() => setBusyName(null));
  };

  const dismiss = (entry: InboxEntry) => {
    if (busyName) return;
    if (!window.confirm(`从收件箱删除「${entry.name}」？（不会进作品库）`)) return;
    setBusyName(entry.name);
    fetch(`/api/admin/inbox?name=${encodeURIComponent(entry.name)}`, {
      method: 'DELETE',
    })
      .then(async (response) => {
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || '删除失败，稍后再试。');
        }
      })
      .then(() => {
        setEntries((rows) => rows.filter((row) => row.name !== entry.name));
        setError('');
        setMessage(`已删除 ${entry.name}。`);
      })
      .catch((deleteError: unknown) =>
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : '删除失败，稍后再试。',
        ),
      )
      .finally(() => setBusyName(null));
  };

  return (
    <section>
      <h1>收件箱</h1>
      <p className="admin-sub">
        把待登记的作品放进服务器目录{' '}
        <code>{dir || 'data/inbox'}</code>（宝塔上传或本机复制），点「刷新」后逐个登记。
        单文件命名「标题，模型名.html」会自动带出标题与模型名；多文件作品整个文件夹放进来
        （根目录须有 index.html）。登记 = 文件搬进作品库 + 入库，收件箱只留待处理件。
      </p>
      {error && <div className="admin-error">{error}</div>}
      {message && <div className="admin-ok">{message}</div>}
      <div className="admin-toolbar">
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
      {!loading && entries.length === 0 && (
        <div className="admin-placeholder">
          <b>收件箱是空的</b>
          <p style={{ margin: 0 }}>
            往上面的目录放进 .html 文件或作品文件夹，然后点「刷新」。
          </p>
        </div>
      )}
      <div className="admin-inbox">
        {entries.map((entry) => {
          const form = forms[entry.name];
          return (
            <div className="admin-inbox-item" key={entry.name}>
              <div className="admin-inbox-name">
                <i className="admin-badge">
                  {entry.type === 'dir' ? '文件夹' : '单文件'}
                </i>
                <b>{entry.name}</b>
                {entry.size != null && (
                  <span className="size">
                    {Math.max(1, Math.round(entry.size / 1024))} KB
                  </span>
                )}
              </div>
              {entry.registerable && form ? (
                <div className="admin-inbox-form">
                  <label>
                    标题
                    <input
                      type="text"
                      value={form.title}
                      onChange={(event) =>
                        updateForm(entry.name, { title: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    模型名
                    <input
                      type="text"
                      value={form.model}
                      onChange={(event) =>
                        updateForm(entry.name, { model: event.target.value })
                      }
                      placeholder={entry.type === 'dir' ? '必填' : ''}
                    />
                  </label>
                  <label>
                    题目
                    <select
                      value={form.promptId}
                      onChange={(event) =>
                        updateForm(entry.name, { promptId: event.target.value })
                      }
                    >
                      <option value="">选择题…</option>
                      {promptOptions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="chk">
                    <input
                      type="checkbox"
                      checked={form.publish}
                      onChange={(event) =>
                        updateForm(entry.name, { publish: event.target.checked })
                      }
                    />
                    登记后立即发布
                  </label>
                  <button
                    className="admin-mini primary"
                    disabled={!!busyName}
                    onClick={() => register(entry)}
                  >
                    登记入库
                  </button>
                </div>
              ) : (
                <div className="admin-inbox-form">
                  <span className="reason">{entry.reason}</span>
                  <button
                    className="admin-mini danger"
                    disabled={!!busyName}
                    onClick={() => dismiss(entry)}
                  >
                    从收件箱删除
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
