import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowUpRight, Check, Copy, Download, Share2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useI18n } from '@/lib/locale';
import type { Matchup, Prompt, Side } from '@/lib/arena';
import type { GuessSession } from '@/lib/guess';
import { ATTRIBUTE_KEYS } from '@/lib/guess-logic';

type ShareMeta = {
  url: string;
  image: string;
  title: string;
  description: string;
};
export function duelShareQuery(
  prompt: Prompt,
  pair: Matchup,
  pick: Side | 'draw',
) {
  return new URLSearchParams({
    type: 'duel',
    prompt: prompt.id,
    a: pair[0].id,
    b: pair[1].id,
    pick,
  }).toString();
}
export function guessShareQuery(
  session: GuessSession,
  day: string,
  won: boolean,
) {
  const states = { hit: 'h', near: 'n', miss: 'm', unknown: 'u' };
  const grid = session.guesses
    .map((row) =>
      ATTRIBUTE_KEYS.map((key) => states[row.attributes[key].state]).join(''),
    )
    .join('.');
  return new URLSearchParams({
    type: 'guess',
    day,
    won: won ? '1' : '0',
    grid,
  }).toString();
}

function ShareSheet({ query }: { query: string }) {
  const { t } = useI18n();
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [manual, setManual] = useState(false);
  const [run, setRun] = useState(0);
  const [imageUrl, setImageUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    let disposed = false;
    const timer = setTimeout(() => controller.abort(), 20000);
    void (async () => {
      try {
        const response = await fetch(`/api/share?${query}`, {
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error('这场对决暂时无法分享，作品可能已下架。');
        const result = (await response.json()) as ShareMeta;
        if (controller.signal.aborted) return;
        setMeta(result);
        // Fetch same-origin even when APP_ORIGIN points to the deployed public domain.
        const image = await fetch(`/share/card.png?${query}`, {
          signal: controller.signal,
        });
        if (
          !image.ok ||
          !image.headers.get('content-type')?.includes('image/png')
        )
          throw new Error('图片生成失败，请重试。');
        const blob = await image.blob();
        if (controller.signal.aborted) return;
        const png = new File([blob], 'arena-of-bias.png', {
          type: 'image/png',
        });
        objectUrl = URL.createObjectURL(blob);
        setFile(png);
        setImageUrl(objectUrl);
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error ? err.message : '图片生成失败，请重试。',
          );
        else if (!disposed) setError('图片生成超时，请重试。');
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [query, run]);
  async function copy() {
    if (!meta) return;
    try {
      await navigator.clipboard.writeText(meta.url);
      setStatus(t('链接已复制，发给朋友看看。'));
    } catch {
      setManual(true);
      setStatus(t('请手动复制下面的链接。'));
    }
  }
  async function nativeShare() {
    if (!meta) return;
    try {
      if (file && navigator.canShare?.({ files: [file] }))
        await navigator.share({ files: [file], title: meta.title });
      else await navigator.share({ title: meta.title, url: meta.url });
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AbortError'))
        setStatus(t('系统分享暂不可用，请保存图片或复制链接。'));
    }
  }
  return (
    <>
      <div className="share-sheet-heading">
        <span className="share-eyebrow">TAKE YOUR PICK / KEEP YOUR MOMENT</span>
        <DialogTitle>{t('把这一刻，带走。')}</DialogTitle>
        <DialogDescription>{t('一张卡片，一份自己的答案。')}</DialogDescription>
      </div>
      <div className="share-sheet-body">
        <div className="share-preview">
          {imageUrl ? (
            <img
              src={imageUrl}
              width={1080}
              height={1350}
              alt={meta?.title ?? t('分享卡预览')}
            />
          ) : (
            <output className="share-loading">
              <span className="share-loading-mark">↗</span>
              <strong>{t(error || '正在装裱你的答案…')}</strong>
              {error && (
                <button
                  onClick={() => {
                    setError('');
                    setRun((n) => n + 1);
                  }}
                >
                  {t('重新生成')}
                </button>
              )}
            </output>
          )}
        </div>
        <div className="share-controls">
          <span className="share-edition">01 — PERSONAL EDITION</span>
          <h3>{t('你的判断，值得留一份。')}</h3>
          <p>
            {t(
              query.includes('type=guess')
                ? '只分享推理轨迹，不剧透模型答案。朋友扫码后也能来猜一把。'
                : '把这场对决发给朋友，看看你们的直觉是否一致。',
            )}
          </p>
          <a
            className={`share-save ${file ? '' : 'is-disabled'}`}
            href={imageUrl || undefined}
            download="arena-of-bias.png"
            aria-disabled={!file}
            onClick={(event) => {
              if (!file) event.preventDefault();
              else setStatus(t('已发起下载；手机也可长按卡片保存。'));
            }}
          >
            <Download size={18} />
            {t('保存高清图片')}
            <ArrowUpRight size={18} />
          </a>
          <button
            className="share-copy"
            onClick={() => void copy()}
            disabled={!meta}
          >
            {status.includes('已复制') ? (
              <Check size={17} />
            ) : (
              <Copy size={17} />
            )}
            {t('复制分享链接')}
          </button>
          {typeof navigator.share === 'function' && (
            <button
              className="share-native"
              disabled={!meta || !file}
              onClick={() => void nativeShare()}
            >
              <Share2 size={16} />
              {t('系统分享 / 存到手机')}
            </button>
          )}
          <p className="share-help">{t('手机可长按左侧或上方卡片保存。')}</p>
          {meta && (
            <a
              className="share-open"
              href={meta.url}
              target="_blank"
              rel="noreferrer"
            >
              {t('打开分享页')} ↗
            </a>
          )}
          {manual && (
            <label className="share-manual">
              {t('分享链接')}
              <input
                readOnly
                value={meta?.url ?? ''}
                onFocus={(event) => event.target.select()}
              />
            </label>
          )}
          <output className="share-status" aria-live="polite">
            {status}
          </output>
        </div>
      </div>
      <div className="share-sheet-foot">
        <span>ARENA OF BIAS</span>
        <span>{t('AI 负责想象。你负责喜欢。')}</span>
      </div>
    </>
  );
}
export function ShareButton({
  query,
  label = '分享这一局',
  className = '',
}: {
  query: string;
  label?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className={`share-trigger ${className}`}>
        <Share2 size={16} />
        {t(label)}
      </DialogTrigger>
      <DialogContent className="share-sheet" overlayClassName="share-backdrop">
        {open && <ShareSheet key={query} query={query} />}
      </DialogContent>
    </Dialog>
  );
}
const subscribe = (callback: () => void) => {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
};
// 竞技场当前对局由 page.tsx 同步进来：题目分享卡要嵌「正在对比的两件作品」
// 的缩略图（决策 107），链接也固定回同一对，扫码看到的和卡片一致。
let arenaPair: readonly [string, string] | null = null;
const pairListeners = new Set<() => void>();
export function setSharePair(pair: readonly [string, string] | null) {
  const same =
    (arenaPair === null) === (pair === null) &&
    (!pair || !arenaPair || (arenaPair[0] === pair[0] && arenaPair[1] === pair[1]));
  if (same) return;
  arenaPair = pair ? [pair[0], pair[1]] : null;
  pairListeners.forEach((listener) => listener());
}
const subscribePair = (callback: () => void) => {
  pairListeners.add(callback);
  return () => {
    pairListeners.delete(callback);
  };
};
export function PageShare() {
  const { t } = useI18n();
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  const pairKey = useSyncExternalStore(
    subscribePair,
    () => (arenaPair ? `${arenaPair[0]}|${arenaPair[1]}` : ''),
    () => '',
  );
  if (hash.startsWith('#formal')) return null;
  const match = /^#arena\/(\d{3})$/.exec(hash);
  const [a, b] = pairKey ? pairKey.split('|') : [];
  const query = new URLSearchParams(
    match
      ? { type: 'prompt', prompt: match[1], ...(a ? { a, b } : {}) }
      : { type: 'site', page: hash.slice(1) || 'home' },
  ).toString();
  return (
    <aside className="site-share-footer">
      <span>{t('好题，值得一起玩。')}</span>
      <ShareButton
        key={hash}
        query={query}
        label={match ? '分享这道题' : '分享这个页面'}
      />
    </aside>
  );
}
