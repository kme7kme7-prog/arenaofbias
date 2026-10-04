import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Scale, X } from 'lucide-react';
import { useI18n } from '@/lib/locale';
import { fetchVotes } from '@/lib/votes';
import { summarizePairVotes, type VoteSplit } from '@/lib/vote-split';

type Props = {
  promptId: string;
  leftRid: string;
  rightRid: string;
  choice: 'a' | 'b' | 'draw';
  settled: boolean;
  placeholder: boolean;
};

/** Mounted once per run, only after a choice. Late requests cannot enter a new run. */
export function AudienceVerdict({
  promptId,
  leftRid,
  rightRid,
  choice,
  settled,
  placeholder,
}: Props) {
  const { t } = useI18n();
  const [counts, setCounts] = useState<VoteSplit | null>(null);
  const [failed, setFailed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const complete = !!counts || failed || placeholder;

  useEffect(() => {
    if (!settled || placeholder) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      setFailed(true);
    }, 8000);
    void fetchVotes(controller.signal).then((votes) => {
      if (controller.signal.aborted) return;
      clearTimeout(timeout);
      if (votes === null) setFailed(true);
      else setCounts(summarizePairVotes(votes, promptId, leftRid, rightRid));
    });
    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [settled, placeholder, promptId, leftRid, rightRid]);

  useEffect(() => {
    if (!complete) return;
    const leaveTimer = setTimeout(() => setLeaving(true), 2600);
    const dismissTimer = setTimeout(() => setDismissed(true), 2900);
    return () => {
      clearTimeout(leaveTimer);
      clearTimeout(dismissTimer);
    };
  }, [complete]);

  if (dismissed) return null;
  const total = counts ? counts.left + counts.right : 0;
  const leftPercent = total ? Math.round((counts!.left / total) * 100) : 0;
  return createPortal(
    <aside
      className={`audience-verdict pick-${choice} ${complete ? 'is-ready' : 'is-pending'} ${leaving ? 'is-leaving' : ''}`}
      aria-label={t('本场选择分布')}
      aria-live="polite"
      aria-atomic="true"
      aria-busy={!complete}
    >
      <header className="verdict-heading">
        <span className="verdict-lock">
          <Check size={14} />
          {t(choice === 'draw' ? '平局已锁定' : '直觉已锁定')}
        </span>
        <strong className="verdict-title">{t('大家怎么选')}</strong>
        <button
          onClick={() => setDismissed(true)}
          aria-label={t('关闭选择分布')}
        >
          <X size={15} />
        </button>
      </header>
      {counts ? (
        <>
          <div className="verdict-scoreline">
            <div
              className={`verdict-count verdict-count-left ${choice === 'a' ? 'is-picked' : ''}`}
            >
              <span>
                A · {t('左侧')}
                {choice === 'a' && <Check size={11} />}
              </span>
              <strong>
                {counts.left.toLocaleString()}
                <small>{t('人')}</small>
              </strong>
            </div>
            <div className="verdict-meter">
              <div
                className={`verdict-bar ${total ? '' : 'is-empty'}`}
                aria-hidden="true"
              >
                <i style={{ width: `${leftPercent}%` }} />
                <i style={{ width: `${total ? 100 - leftPercent : 0}%` }} />
              </div>
              <div className="verdict-percent" aria-hidden="true">
                <span>{total ? `${leftPercent}%` : '—'}</span>
                <span>{total ? `${100 - leftPercent}%` : '—'}</span>
              </div>
            </div>
            <div
              className={`verdict-count verdict-count-right ${choice === 'b' ? 'is-picked' : ''}`}
            >
              <span>
                {choice === 'b' && <Check size={11} />}B · {t('右侧')}
              </span>
              <strong>
                {counts.right.toLocaleString()}
                <small>{t('人')}</small>
              </strong>
            </div>
          </div>
          <footer>
            <span className="verdict-scope">{t('本题 · 当前两份作品')}</span>
            <span className="verdict-draw">
              <Scale size={12} />
              {t('平局 {count} 人', { count: counts.draw })}
            </span>
            <span>{t(total ? '红蓝比例不含平局' : '暂无左右选择')}</span>
          </footer>
        </>
      ) : (
        <div className="verdict-awaiting">
          <span className="verdict-loader" aria-hidden="true">
            <i />
            <i />
          </span>
          <p>
            {t(
              placeholder
                ? '演示模式不显示真实人数'
                : failed
                  ? '人数暂时无法加载'
                  : '正在读取大家的选择…',
            )}
          </p>
        </div>
      )}
    </aside>,
    document.body,
  );
}
