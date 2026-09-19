'use client';
import { useI18n } from '@/lib/locale';
import { newId } from '@/lib/id';

import { useAccount } from '@/components/account';

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
  const { t, localize, language } = useI18n();
  const {
    user,
    loading: authLoading,
    open: openAccount,
    refresh: refreshAccount,
  } = useAccount();
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
    const kickoff = setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      mounted.current = false;
      clearTimeout(kickoff);
      controller.abort();
    };
  }, [load]);

  const submit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = draft.trim();
    if (!user) {
      openAccount();
      return;
    }
    if (!body || posting.current) return;
    posting.current = true;
    setSending(true);
    setFeedback('');
    if (pending.current?.body !== body)
      pending.current = { body, id: newId() };
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
      if (response.status === 401) {
        await refreshAccount();
        openAccount();
      }
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
    <section className="afterparty" aria-label={t('本题评论区')}>
      <header className="afterparty-heading">
        <div className="afterparty-title">
          <span className="afterparty-symbol">
            <MessageSquare size={21} />
          </span>
          <div>
            <span className="section-code">
              {t('POST-MATCH / OPEN CHANNEL')}
            </span>
            <h2>
              {t('赛后评论')}
              <span>。</span>
            </h2>
          </div>
        </div>
        <span className="channel-status">
          <Radio size={13} />
          {t('赛后频道已开启')}
        </span>
      </header>
      <div className="afterparty-columns">
        <form className="comment-composer" onSubmit={submit}>
          <div className="composer-meta">
            <span className={`team-chip team-${side}`}>
              {t('本提示词讨论')}
            </span>
            <span>{t('有理有据，或者纯凭感觉。')}</span>
            <ArrowUpRight size={15} />
          </div>
          {!user && (
            <button
              className="comment-login"
              type="button"
              onClick={openAccount}
              disabled={authLoading}
            >
              {t('登录后留下你的想法 ↗')}
            </button>
          )}
          <label htmlFor={`comment-${roundId}`} className="sr-only">
            {t('留下你的吐槽')}
          </label>
          <Textarea
            id={`comment-${roundId}`}
            className="comment-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={sending || authLoading || !user}
            maxLength={280}
            placeholder={t('刚才为什么选它？有什么槽点，展开讲讲。')}
          />
          <div className="composer-bottom">
            <span>{t('聊作品，别伤和气。')}</span>
            <span className="comment-count">{draft.length} / 280</span>
            <button
              type="submit"
              className="post-comment"
              disabled={sending || authLoading || !user || !draft.trim()}
            >
              {localize(sending ? '发送中' : '留下这句')}
              <Send size={14} />
            </button>
          </div>
          <output className="comment-feedback" aria-live="polite">
            {localize(feedback)}
          </output>
        </form>
        <div className="comment-channel">
          <div className="channel-heading">
            <span>
              {t('现场声音')}
              {localize(' ')}
              <b>
                {localize(
                  comments.length === 100
                    ? '100+'
                    : String(comments.length).padStart(2, '0'),
                )}
              </b>
            </span>
            <button
              onClick={() => {
                setLoading(true);
                void load();
              }}
              disabled={loading}
              aria-label={t('刷新本题评论')}
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="comment-list" aria-live="polite">
            {loading && comments.length === 0 ? (
              <p className="channel-empty">{t('正在接入频道…')}</p>
            ) : loadError ? (
              <button
                className="channel-retry"
                onClick={() => {
                  setLoading(true);
                  void load();
                }}
              >
                {localize(loadError)}
                <RefreshCw size={14} />
              </button>
            ) : comments.length === 0 ? (
              <div className="channel-empty">
                <span className="empty-quote">“</span>
                <strong>{t('你已经做出了选择。')}</strong>
                <span>{t('现在，说说让你站队的那个细节。')}</span>
              </div>
            ) : (
              comments.map((comment) => (
                <article key={comment.id} className="comment-entry">
                  <div className="comment-avatar">{t('评')}</div>
                  <div>
                    <header>
                      <span>
                        {comment.username ||
                          t('匿名观测员 #{id}', {
                            id: comment.id.slice(0, 4).toUpperCase(),
                          })}
                      </span>
                      <time
                        dateTime={new Date(comment.createdAt).toISOString()}
                      >
                        {localize(
                          new Date(comment.createdAt).toLocaleString(
                            language === 'en' ? 'en-GB' : 'zh-CN',
                            {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: false,
                            },
                          ),
                        )}
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
