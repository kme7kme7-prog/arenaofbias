'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SubmitEvent,
} from 'react';
import {
  ArrowUpRight,
  MessageSquare,
  RefreshCw,
  Radio,
  Send,
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { ArenaComment } from '@/lib/comments';

export function Afterparty({
  roundId,
  side,
}: {
  roundId: string;
  side: 'a' | 'b';
}) {
  const [comments, setComments] = useState<ArenaComment[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const pending = useRef<{ body: string; id: string } | null>(null);
  const posting = useRef(false);
  const mounted = useRef(true);
  const revision = useRef(0);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const currentRevision = revision.current;
      try {
        const response = await fetch(`/api/comments?round=${roundId}`, {
          signal,
        });
        if (!response.ok) throw new Error('load failed');
        const data = (await response.json()) as { comments: ArenaComment[] };
        if (
          mounted.current &&
          !signal?.aborted &&
          currentRevision === revision.current
        ) {
          setComments(data.comments);
          setLoadError('');
        }
      } catch {
        if (mounted.current && !signal?.aborted)
          setLoadError('频道暂时未连接，点一下重新接入。');
      } finally {
        if (mounted.current && !signal?.aborted) setLoading(false);
      }
    },
    [roundId],
  );

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const kickoff = setTimeout(() => { void load(controller.signal); }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(kickoff);
      controller.abort();
    };
  }, [load]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!body || posting.current) return;
    posting.current = true;
    setSending(true);
    setFeedback('');
    if (pending.current?.body !== body)
      pending.current = { body, id: crypto.randomUUID() };
    try {
      const response = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: pending.current.id, roundId, side, body }),
      });
      const data = (await response.json()) as {
        comment?: ArenaComment;
        error?: string;
      };
      if (!response.ok || !data.comment)
        throw new Error(data.error || '发送失败');
      const saved = data.comment;
      if (!mounted.current) return;
      revision.current++;
      setComments((previous) => [
        saved,
        ...previous.filter((item) => item.id !== saved.id),
      ]);
      setDraft('');
      pending.current = null;
      setFeedback('收到。你的吐槽已留在本场。');
      void load();
    } catch (error) {
      if (mounted.current)
        setFeedback(
          error instanceof Error && error.message !== 'Failed to fetch'
            ? error.message
            : '暂时没发出去，你的文字还在。再试一次？',
        );
    } finally {
      posting.current = false;
      if (mounted.current) setSending(false);
    }
  };

  return (
    <section className="afterparty" aria-label="本题评论区">
      <header className="afterparty-heading">
        <div className="afterparty-title">
          <span className="afterparty-symbol">
            <MessageSquare size={21} />
          </span>
          <div>
            <span className="section-code">POST-MATCH / OPEN CHANNEL</span>
            <h2>
              票投完了，聊两句<span>。</span>
            </h2>
          </div>
        </div>
        <span className="channel-status">
          <Radio size={13} />
          赛后频道已开启
        </span>
      </header>
      <div className="afterparty-columns">
        <form className="comment-composer" onSubmit={submit}>
          <div className="composer-meta">
            <span className={`team-chip team-${side}`}>
              已站 {side.toUpperCase()} 方
            </span>
            <span>有理有据，或者纯凭感觉。</span>
            <ArrowUpRight size={15} />
          </div>
          <label htmlFor={`comment-${roundId}`} className="sr-only">
            留下你的吐槽
          </label>
          <Textarea
            id={`comment-${roundId}`}
            className="comment-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={sending}
            maxLength={280}
            placeholder="刚才为什么选它？有什么槽点，展开讲讲。"
          />
          <div className="composer-bottom">
            <span>聊作品，别伤和气。</span>
            <span className="comment-count">{draft.length} / 280</span>
            <button
              type="submit"
              className="post-comment"
              disabled={sending || !draft.trim()}
            >
              {sending ? '发送中' : '留下这句'}
              <Send size={14} />
            </button>
          </div>
          <output className="comment-feedback" aria-live="polite">
            {feedback}
          </output>
        </form>
        <div className="comment-channel">
          <div className="channel-heading">
            <span>
              现场声音{' '}
              <b>
                {comments.length === 100
                  ? '100+'
                  : String(comments.length).padStart(2, '0')}
              </b>
            </span>
            <button
              onClick={() => {
                setLoading(true);
                void load();
              }}
              disabled={loading}
              aria-label="刷新本题评论"
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="comment-list" aria-live="polite">
            {loading && comments.length === 0 ? (
              <p className="channel-empty">正在接入频道…</p>
            ) : loadError ? (
              <button
                className="channel-retry"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                {loadError}
                <RefreshCw size={14} />
              </button>
            ) : comments.length === 0 ? (
              <div className="channel-empty">
                <span className="empty-quote">“</span>
                <strong>还没有人开麦。</strong>
                <span>好看在哪里，离谱在哪里？</span>
              </div>
            ) : (
              comments.map((comment) => (
                <article key={comment.id} className="comment-entry">
                  <div className={`comment-avatar team-${comment.side}`}>
                    {comment.side.toUpperCase()}
                  </div>
                  <div>
                    <header>
                      <span>
                        观测员 <b>#{comment.id.slice(0, 4).toUpperCase()}</b>
                      </span>
                      <time
                        dateTime={new Date(comment.createdAt).toISOString()}
                      >
                        {new Date(comment.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </time>
                    </header>
                    <p>{comment.body}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
