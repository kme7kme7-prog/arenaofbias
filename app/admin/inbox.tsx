// 收件箱（2026-09-25 改版）：卡片式布局 + 页面直传 + 文字作品登记 + 模型名自动补全。
// - 直传：拖拽/选择 .html/.txt/.md，File.arrayBuffer() → octet-stream 原始字节上传，
//   重名 409 时询问覆盖；多文件作品（文件夹）仍手动放进服务器收件箱目录。
// - 文字作品：一文件一作品（用户拍板），空行分段，登记后源文件删除，纯库内存储。
// - 模型名：输入即过滤现有模型（GET /api/admin/models）；选中 = 复用该 modelId 与
//   规范显示名；无匹配 = 登记时创建新模型（下拉第一行明示）。
// - 题目选择记住上一次（aob-admin-inbox-prompt），连续登记同一题不用反复选。
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useAdminPromptOptions } from '@/app/admin/use-admin-prompts';
import { FixedHtmlWork } from '@/components/fixed-html-work';

type InboxEntry = {
  name: string;
  type: 'file' | 'dir';
  kind: 'html' | 'text';
  size: number | null;
  registerable: boolean;
  reason: string | null;
  suggest: { title: string; model: string } | null;
  /** 文字文件附带：段数与开头摘录 */
  paragraphs?: number;
  excerpt?: string;
};

type ModelOption = {
  modelId: string;
  modelName: string;
  works: number;
  /** 合并标记（2026-09-25）：该条目由哪些旧代号/旧版本合并而来，登记时提示归属 */
  note?: string | null;
};

type InboxForm = {
  title: string;
  model: string;
  /** 从补全里选中的现有模型 id；null = 按输入的模型名新建 */
  modelId: string | null;
  promptId: string;
  publish: boolean;
};

const ACCEPT_FILE = /\.(html|txt|md)$/i;
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const LAST_PROMPT_KEY = 'aob-admin-inbox-prompt';
// 文本摘录/全文走 file 路由；网页预览走 serve 虚拟静态——文件夹作品的
// 相对子资源（./main.js、材质）要能跟着加载，否则多文件作品渲染不出画面。
// 文件夹必须落到 <name>/index.html：文档住在无斜杠的 <name> 上时，
// ./assets/... 会把 <name> 段顶掉（2026-09-25 实测）
const previewUrl = (name: string) =>
  `/api/admin/inbox/file?name=${encodeURIComponent(name)}`;
const serveUrl = (name: string) =>
  `/api/admin/inbox/serve/${encodeURIComponent(name)}`;
const workPreviewSrc = (entry: InboxEntry) =>
  entry.type === 'dir'
    ? `${serveUrl(entry.name)}/index.html`
    : serveUrl(entry.name);

const readSavedPrompt = () => {
  try {
    return localStorage.getItem(LAST_PROMPT_KEY) ?? '';
  } catch {
    return '';
  }
};

/** 模型名组合框：过滤现有模型；输入无匹配时第一行明示「创建新模型」 */
function ModelCombobox({
  value,
  modelId,
  models,
  disabled,
  onText,
  onPick,
}: {
  value: string;
  modelId: string | null;
  models: ModelOption[];
  disabled: boolean;
  onText: (text: string) => void;
  onPick: (model: ModelOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const q = value.trim().toLowerCase();
  const matches = (q
    ? models.filter(
        (m) =>
          m.modelName.toLowerCase().includes(q) || m.modelId.includes(q),
      )
    : models
  ).slice(0, 8);
  const isKnown =
    modelId !== null &&
    models.some((m) => m.modelId === modelId && m.modelName === value);
  const pickedNote = isKnown
    ? (models.find((m) => m.modelId === modelId)?.note ?? null)
    : null;
  const showCreate = q.length > 0 && !isKnown;
  return (
    <div className="model-combo">
      <input
        type="text"
        role="combobox"
        value={value}
        disabled={disabled}
        placeholder="输入模型名，从现有模型里选或新建"
        aria-label="模型名"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
        onChange={(event) => {
          onText(event.target.value);
          setOpen(true);
        }}
      />
      {value.trim() && (
        <i className={`model-combo-tag ${isKnown ? 'known' : 'new'}`}>
          {isKnown ? '已有模型' : '新模型'}
        </i>
      )}
      {isKnown && pickedNote && (
        <em className="model-combo-note">{pickedNote}</em>
      )}
      {open && (matches.length > 0 || showCreate) && (
        <div className="model-combo-list" id={listId}>
          {showCreate && (
            <div className="model-combo-create" aria-hidden="true">
              创建新模型「{value.trim()}」——登记时自动加入作品体系
            </div>
          )}
          {matches.map((m) => (
            <button
              type="button"
              key={m.modelId}
              className={m.modelId === modelId ? 'selected' : ''}
              // mousedown 抢在 input blur 之前完成选择
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(m);
                setOpen(false);
              }}
            >
              <b>{m.modelName}</b>
              <span>
                {m.modelId} · 已有 {m.works} 件
              </span>
              {m.note && <em className="model-combo-note">{m.note}</em>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** 文字作品预览：开头摘录 + 按需加载全文（预览路由吐 text/plain） */
function TextPreview({ entry }: { entry: InboxEntry }) {
  const [full, setFull] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && full === null) {
      fetch(previewUrl(entry.name))
        .then((response) =>
          response.ok ? response.text() : Promise.reject(new Error()),
        )
        .then((text) => setFull(text))
        .catch(() => setFull('（读取失败）'));
    }
  };
  return (
    <div className="inbox-text-preview">
      <p>
        {entry.excerpt || '（空文件）'}
        {(entry.excerpt?.length ?? 0) >= 300 ? '…' : ''}
      </p>
      <button type="button" className="admin-mini" onClick={toggle}>
        {open ? '收起全文' : '阅读全文'}
      </button>
      {open && <pre>{full ?? '读取中…'}</pre>}
    </div>
  );
}

export function AdminInbox() {
  const promptOptions = useAdminPromptOptions();
  const [dir, setDir] = useState('');
  const [entries, setEntries] = useState<InboxEntry[]>([]);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [forms, setForms] = useState<Record<string, InboxForm>>({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyName, setBusyName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [savedPrompt, setSavedPrompt] = useState(readSavedPrompt);
  const requestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  // 上次登记的题目：只在它仍是有效题目时做默认值
  const defaultPrompt = promptOptions.some((p) => p.id === savedPrompt)
    ? savedPrompt
    : '';

  const load = useCallback(() => {
    const request = ++requestId.current;
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    return Promise.all([
      fetch('/api/admin/inbox').then((r) =>
        r.ok
          ? (r.json() as Promise<{ dir: string; entries: InboxEntry[] }>)
          : Promise.reject(new Error()),
      ),
      fetch('/api/admin/models').then((r) =>
        r.ok
          ? (r.json() as Promise<{ models: ModelOption[] }>)
          : Promise.reject(new Error()),
      ),
    ])
      .then(([inboxData, modelData]) => {
        if (request !== requestId.current) return;
        setDir(inboxData.dir);
        setEntries(inboxData.entries);
        setModels(modelData.models);
        // 新条目带出默认表单；同名条目保留已编辑的现场
        setForms((prev) => {
          const next: Record<string, InboxForm> = {};
          for (const entry of inboxData.entries) {
            next[entry.name] =
              prev[entry.name] ?? {
                title: entry.suggest?.title ?? '',
                model: entry.suggest?.model ?? '',
                modelId: null,
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

  const uploadFiles = async (files: File[]) => {
    setError('');
    setMessage('');
    for (const file of files) {
      if (!ACCEPT_FILE.test(file.name)) {
        setError(`${file.name}：只支持 .html / .txt / .md 文件。`);
        continue;
      }
      if (file.size === 0) {
        setError(`${file.name}：空文件不上传。`);
        continue;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        setError(`${file.name}：超过 8MB，请手动放进收件箱目录。`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const body = await file.arrayBuffer();
        const attempt = (overwrite: boolean) =>
          fetch(
            `/api/admin/inbox/upload?name=${encodeURIComponent(file.name)}${overwrite ? '&overwrite=1' : ''}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/octet-stream' },
              body,
            },
          );
        let response = await attempt(false);
        if (response.status === 409) {
          if (!window.confirm(`收件箱已有同名「${file.name}」，覆盖它？`))
            continue;
          response = await attempt(true);
        }
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(data.error || '上传失败，稍后再试。');
        }
        setMessage(`${file.name} 已放入收件箱。`);
      } catch (uploadError) {
        setError(
          `${file.name}：${uploadError instanceof Error ? uploadError.message : '上传失败，稍后再试。'}`,
        );
      } finally {
        setUploading((n) => n - 1);
      }
    }
    setLoading(true);
    void load();
  };

  const register = (entry: InboxEntry) => {
    const form = forms[entry.name];
    const promptId = form?.promptId || defaultPrompt;
    if (!form?.model.trim()) {
      setError(`${entry.name}：先填模型名。`);
      return;
    }
    if (!promptId) {
      setError(`${entry.name}：先选好题目再登记。`);
      return;
    }
    if (busyName) return;
    setBusyName(entry.name);
    fetch('/api/admin/inbox/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: entry.name,
        promptId,
        modelName: form.model.trim(),
        title: form.title.trim(),
        publish: form.publish,
        ...(form.modelId ? { modelId: form.modelId } : {}),
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
        try {
          localStorage.setItem(LAST_PROMPT_KEY, promptId);
        } catch {
          /* 偏好记不住不影响登记 */
        }
        setSavedPrompt(promptId);
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
        直接把作品文件拖进来，确认标题、模型和题目后登记入库。
      </p>
      <details className="admin-intake-help">
        <summary>支持哪些文件？查看规则</summary>
        <p>
          直接拖拽或点选 <code>.html</code>（网页作品）与{' '}
          <code>.txt / .md</code>
          （文字作品：一文件一作品，空行分段）即可上传，单文件最大 8MB。
          文件名写成「标题，模型名.后缀」会自动带出标题与模型名。
          多文件作品（含素材的文件夹）请整个文件夹放进服务器目录{' '}
          <code>{dir || 'data/inbox'}</code>（根目录须有 index.html），点「刷新」后登记。
          登记 = 入库 + 文件离开收件箱；默认草稿，去「作品管理」检查后发布。
        </p>
      </details>
      {error && <div className="admin-error">{error}</div>}
      {message && <div className="admin-ok">{message}</div>}

      <div
        className={`admin-inbox-upload${dragging ? ' dragging' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void uploadFiles(Array.from(event.dataTransfer.files));
        }}
      >
        <b>{uploading > 0 ? `正在上传 ${uploading} 个文件…` : '把作品文件拖到这里'}</b>
        <span>.html 网页作品 · .txt/.md 文字作品 · 可多选</span>
        <button
          type="button"
          className="admin-mini"
          disabled={uploading > 0}
          onClick={() => fileInput.current?.click()}
        >
          选择文件
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".html,.txt,.md"
          multiple
          hidden
          onChange={(event) => {
            void uploadFiles(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
        />
      </div>

      <div className="admin-toolbar">
        <span className="admin-inbox-count">
          {loading ? '正在读取收件箱…' : `${entries.length} 件待处理`}
        </span>
        <button
          className="reload"
          onClick={() => {
            setLoading(true);
            void load();
          }}
        >
          刷新
        </button>
        <a className="admin-intake-next" href="#works">
          前往作品管理 ↗
        </a>
      </div>
      {!loading && entries.length === 0 && (
        <div className="admin-placeholder">
          <b>收件箱是空的</b>
          <p style={{ margin: 0 }}>
            拖文件到上方上传区，或展开操作指引查看多文件作品的放法。
          </p>
        </div>
      )}
      <div className="admin-inbox">
        {entries.map((entry) => {
          const form = forms[entry.name];
          return (
            <div className="inbox-card" key={entry.name}>
              <div className="inbox-card-head">
                <i className="admin-badge">
                  {entry.type === 'dir'
                    ? '文件夹'
                    : entry.kind === 'text'
                      ? '文字'
                      : '单文件'}
                </i>
                <b>{entry.name}</b>
                {entry.size != null && (
                  <span className="size">
                    {Math.max(1, Math.round(entry.size / 1024))} KB
                  </span>
                )}
                {entry.kind === 'text' && entry.paragraphs != null && (
                  <span className="size">{entry.paragraphs} 段</span>
                )}
              </div>
              {entry.registerable && form ? (
                <div className="inbox-card-body">
                  <div
                    className={`inbox-card-preview${entry.kind === 'html' ? ' html' : ''}`}
                  >
                    {entry.kind === 'text' ? (
                      <TextPreview entry={entry} />
                    ) : (
                      // 与竞技场同一份渲染（默认 1280×720 画布）——预览比例即上场比例；
                      // 文件夹作品的相对子资源经 serve 虚拟静态解析
                      <FixedHtmlWork
                        content={{ kind: 'html', src: workPreviewSrc(entry) }}
                        canvas={{
                          width: 1280,
                          height: 720,
                          zoom: 1,
                          offsetX: 0,
                          offsetY: 0,
                        }}
                        title={`${entry.name} 预览`}
                        interactive={false}
                      />
                    )}
                  </div>
                  <div className="inbox-card-form">
                    <label>
                      标题
                      <input
                        type="text"
                        value={form.title}
                        disabled={busyName === entry.name}
                        onChange={(event) =>
                          updateForm(entry.name, { title: event.target.value })
                        }
                      />
                    </label>
                    <div className="inbox-field">
                      <span>模型名</span>
                      <ModelCombobox
                        value={form.model}
                        modelId={form.modelId}
                        models={models}
                        disabled={busyName === entry.name}
                        onText={(text) =>
                          updateForm(entry.name, { model: text, modelId: null })
                        }
                        onPick={(m) =>
                          updateForm(entry.name, {
                            model: m.modelName,
                            modelId: m.modelId,
                          })
                        }
                      />
                    </div>
                    <label>
                      题目
                      <select
                        value={form.promptId || defaultPrompt}
                        disabled={busyName === entry.name}
                        onChange={(event) =>
                          updateForm(entry.name, {
                            promptId: event.target.value,
                          })
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
                        disabled={busyName === entry.name}
                        onChange={(event) =>
                          updateForm(entry.name, {
                            publish: event.target.checked,
                          })
                        }
                      />
                      登记后立即发布
                    </label>
                    <div className="inbox-card-actions">
                      <button
                        className="admin-mini primary"
                        disabled={!!busyName}
                        onClick={() => register(entry)}
                      >
                        {busyName === entry.name ? '登记中…' : '登记入库'}
                      </button>
                      <button
                        className="admin-mini danger"
                        disabled={!!busyName}
                        onClick={() => dismiss(entry)}
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="inbox-card-body">
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
