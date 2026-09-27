import { useEffect, useState } from 'react';
import {
  submissionRequest,
  submissionStatus,
  type Submission,
} from '@/lib/submissions';

export function AdminSubmissions() {
  const [status, setStatus] = useState('pending');
  const [items, setItems] = useState<Submission[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [run, setRun] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void submissionRequest<{ submissions: Submission[] }>(
      `/api/admin/submissions?status=${status}`,
      { signal: controller.signal },
    )
      .then((data) => {
        setItems(data.submissions);
        setError('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(error.message);
      });
    return () => controller.abort();
  }, [status, run]);
  async function review(item: Submission, action: 'approve' | 'reject') {
    if (busy) return;
    const note = notes[item.id] ?? '';
    if (action === 'reject' && !note.trim()) {
      setError('退回投稿前请填写原因。');
      return;
    }
    if (
      action === 'approve' &&
      !window.confirm(
        `确认已检查“${item.title}”的文件内容？\n通过后会转入收件箱供登记，仍不会自动发布。`,
      )
    )
      return;
    setBusy(item.id);
    setError('');
    try {
      await submissionRequest(`/api/admin/submissions/${item.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note }),
      });
      setRun((value) => value + 1);
    } catch (error) {
      setError(error instanceof Error ? error.message : '审核失败');
    } finally {
      setBusy('');
    }
  }
  return (
    <section className="admin-submissions">
      <div className="admin-page-head">
        <h1>用户投稿</h1>
        <p>
          先下载检查原件；通过后转入收件箱，再登记、校准和发布。最近 100 份。
        </p>
      </div>
      <div className="admin-toolbar">
        <label>
          审核状态{' '}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {Object.entries(submissionStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => setRun((value) => value + 1)}>刷新</button>
        <a href="#inbox">打开收件箱 ↗</a>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="admin-submission-grid">
        {items.map((item) => (
          <article key={item.id} className="admin-submission-card">
            <span>
              {item.promptId} · {item.modelName}
            </span>
            <h2>{item.title}</h2>
            <p>
              {item.username} · {new Date(item.createdAt).toLocaleString()}
            </p>
            <p className="admin-submission-notes">{item.notes}</p>
            <small>
              {item.filename} · {(item.size / 1024).toFixed(1)} KB
            </small>
            <a href={`/api/submissions/${item.id}/file`} download>
              下载原件检查 ↓
            </a>
            {item.status === 'pending' ? (
              <>
                <label>
                  审核说明
                  <textarea
                    rows={3}
                    maxLength={800}
                    value={notes[item.id] ?? ''}
                    onChange={(event) =>
                      setNotes((value) => ({
                        ...value,
                        [item.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="admin-submission-actions">
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void review(item, 'approve')}
                  >
                    通过并转入收件箱
                  </button>
                  <button
                    disabled={Boolean(busy)}
                    onClick={() => void review(item, 'reject')}
                  >
                    退回
                  </button>
                </div>
              </>
            ) : (
              <p>
                {submissionStatus[item.status]}
                {item.reviewNote && ` · ${item.reviewNote}`}
              </p>
            )}
          </article>
        ))}
      </div>
      {!items.length && <p className="admin-empty">当前没有这类投稿。</p>}
    </section>
  );
}
