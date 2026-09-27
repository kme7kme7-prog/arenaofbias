import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type SubmitEvent,
} from 'react';
import { ArrowLeft, ArrowUpRight, Upload } from 'lucide-react';
import { AccountButton, useAccount } from '@/components/account';
import { LanguageSwitch } from '@/components/language-switch';
import { useI18n } from '@/lib/locale';
import {
  currentPrompts,
  getPromptsState,
  subscribePrompts,
} from '@/lib/prompts';
import {
  submissionRequest,
  submissionStatus,
  type Submission,
} from '@/lib/submissions';
import '@/app/submit.css';

export default function SubmitPage() {
  const { t } = useI18n();
  const { user, open: openAccount } = useAccount();
  useSyncExternalStore(subscribePrompts, getPromptsState);
  const [items, setItems] = useState<Submission[]>([]);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [reload, setReload] = useState(0);
  const activeUser = useRef(user?.id);
  const userId = user?.id;
  useEffect(() => {
    activeUser.current = userId;
    return () => {
      activeUser.current = undefined;
    };
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    void submissionRequest<{ submissions: Submission[] }>('/api/submissions', {
      signal: controller.signal,
    })
      .then((data) => setItems(data.submissions))
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(error.message);
      });
    return () => controller.abort();
  }, [userId, reload]);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !user) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get('file');
    if (
      !(file instanceof File) ||
      !file.size ||
      file.size > 20 * 1024 * 1024 ||
      !/\.(html|txt|md|zip)$/i.test(file.name)
    ) {
      setMessage(t('请选择不超过 20 MB 的 HTML、TXT、MD 或 ZIP 文件。'));
      return;
    }
    const owner = user.id;
    setPending(true);
    setMessage('');
    let id = '';
    try {
      const result = await submissionRequest<{ id: string }>(
        '/api/submissions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            promptId: values.get('promptId'),
            title: values.get('title'),
            modelName: values.get('modelName'),
            notes: values.get('notes'),
            filename: file.name,
          }),
        },
      );
      id = result.id;
      if (activeUser.current !== owner)
        throw new Error(t('账号已变化，请重新投稿。'));
      await submissionRequest(`/api/submissions/${id}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      if (activeUser.current === owner) {
        setMessage(t('投稿已收到，审核结果会显示在这里。'));
        form.reset();
        setReload((value) => value + 1);
      }
    } catch (error) {
      if (id)
        await fetch(`/api/submissions/${id}`, { method: 'DELETE' }).catch(
          () => {},
        );
      if (activeUser.current === owner) {
        setMessage(
          error instanceof Error ? t(error.message) : t('上传失败，请重试。'),
        );
        setReload((value) => value + 1); // 原件已收但响应丢失时，仍显示真实待审记录。
      }
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="submission-page">
      <header className="submission-header">
        <a href="#home" className="submission-brand">
          ARENA OF <b>BIAS</b>
        </a>
        <div>
          <LanguageSwitch />
          <AccountButton />
        </div>
      </header>
      <main className="submission-main">
        <a href="#prompts" className="submission-back">
          <ArrowLeft size={16} />
          {t('提示词库')}
        </a>
        <div className="submission-title">
          <span>CONTRIBUTE / 01</span>
          <h1>{t('把你的测试，带进来。')}</h1>
          <p>{t('提交模型的原始回答，审核后加入同题比较。')}</p>
        </div>
        {!user ? (
          <section className="submission-login">
            <p>{t('登录后可投稿并查看审核结果。')}</p>
            <button onClick={openAccount}>
              {t('登录 / 注册')}
              <ArrowUpRight size={18} />
            </button>
          </section>
        ) : (
          <div className="submission-columns">
            <form onSubmit={(event) => void submit(event)}>
              <fieldset disabled={pending}>
                <label>
                  {t('题目')}
                  <select
                    name="promptId"
                    aria-label={t('题目')}
                    required
                    defaultValue=""
                  >
                    <option value="" disabled>
                      {t('选择题目')}
                    </option>
                    {currentPrompts().map((prompt) => (
                      <option key={prompt.id} value={prompt.id}>
                        {prompt.id} · {prompt.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('具体模型')}
                  <input
                    name="modelName"
                    required
                    maxLength={64}
                    placeholder={t('模型名称、版本与 effort')}
                  />
                </label>
                <label>
                  {t('作品标题')}
                  <input name="title" required maxLength={120} />
                </label>
                <label>
                  {t('测试说明')}
                  <textarea
                    name="notes"
                    required
                    maxLength={800}
                    rows={4}
                    placeholder={t(
                      '测试工具、参数、是否修改过结果，以及需要说明的情况。',
                    )}
                  />
                </label>
                <label className="submission-file">
                  <Upload size={22} />
                  <strong>{t('选择作品文件')}</strong>
                  <span>{t('HTML / TXT / MD / ZIP · 最大 20 MB')}</span>
                  <input
                    name="file"
                    type="file"
                    accept=".html,.txt,.md,.zip"
                    required
                  />
                </label>
                <p className="submission-help">
                  {t(
                    '文字一文件一作品；ZIP 请包含 index.html 和网页资源。请勿包含账号密钥或私人资料。',
                  )}
                </p>
                <button className="submission-send" type="submit">
                  {t(pending ? '正在提交…' : '提交审核')}
                  <ArrowUpRight size={18} />
                </button>
              </fieldset>
            </form>
            <aside className="submission-history">
              <div className="submission-history-head">
                <h2>{t('我的投稿')}</h2>
                <button
                  type="button"
                  onClick={() => setReload((value) => value + 1)}
                >
                  {t('刷新')}
                </button>
              </div>
              <p>{t('审核通过后由管理员登记和发布，可在这里查看进度。')}</p>
              {items.length ? (
                items.map((item) => (
                  <article key={item.id}>
                    <span className={`submission-status is-${item.status}`}>
                      {t(submissionStatus[item.status])}
                    </span>
                    <h3>{item.title}</h3>
                    <p>
                      {item.promptId} / {item.modelName}
                    </p>
                    <small>{item.filename}</small>
                    {item.reviewNote && (
                      <p className="submission-note">{item.reviewNote}</p>
                    )}
                  </article>
                ))
              ) : (
                <p>{t('还没有投稿。')}</p>
              )}
            </aside>
          </div>
        )}
        <output className="submission-message" aria-live="polite">
          {message}
        </output>
      </main>
    </div>
  );
}
