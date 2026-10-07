import { useState } from 'react';
import type { ModelResult, Side } from '@/lib/arena';
import presentation from '@/lib/forum-presentation.json';

export const FORUM_PROMPT_ID = presentation.promptId;
export const FORUM_PROMPT_NAME = presentation.title;
const brands: Record<string, { name: string; logo: string }> = presentation.models;

export function ForumAvatar({ side, modelId, revealed = false }: { side?: Side; modelId?: string; revealed?: boolean }) {
  const brand = modelId ? brands[modelId] : undefined;
  const [loadedLogo, setLoadedLogo] = useState<string | null>(null);
  const showBrand = revealed && brand && loadedLogo === brand.logo;
  return <span className={`forum-avatar ${side ? `forum-avatar-${side}` : 'forum-avatar-op'}${showBrand ? ' is-revealed' : ''}`} aria-hidden="true">
    <span className="forum-avatar-anonymous">
      <svg viewBox="0 0 80 80" fill="none">
        <circle cx="40" cy="29" r="15" fill="currentColor" />
        <path d="M10 80V72C10 54 23 46 40 46S70 54 70 72V80Z" fill="currentColor" />
      </svg>
      {side && <span className="forum-avatar-letter">{side.toUpperCase()}</span>}
    </span>
    {brand && <span className="forum-avatar-brand">
      <img src={brand.logo} alt="" decoding="async" onLoad={() => setLoadedLogo(brand.logo)} onError={() => setLoadedLogo(null)} />
    </span>}
  </span>;
}

export function ForumPost({ question }: { question: string }) {
  return <>
    <div className="forum-board">
      <div className="forum-masthead">
        <div className="forum-brand">
          <span className="forum-board-icon" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none"><path d="M12 15H52V43H29L18 51V43H12Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" /><path d="M23 25H41M23 33H35" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
          <strong>弱智吧</strong>
        </div>
        <a className="forum-back" href="#prompts">返回题库 <span aria-hidden="true">›</span></a>
      </div>
      <div className="forum-thread-bar"><span className="forum-active-tab">看帖</span><span className="forum-reply-count">2 条回复</span></div>
    </div>
    <article className="forum-op">
      <div className="forum-op-profile"><ForumAvatar /><span className="forum-op-name">楼主</span></div>
      <div className="forum-op-body"><h2 className="forum-post-question">{question}</h2><span className="forum-op-floor">1 楼 · 楼主</span></div>
    </article>
  </>;
}

export function ForumReply({ result, side }: { result: ModelResult; side: Side }) {
  if (result.content.kind !== 'text') return null;
  const { story } = result.content;
  return <article className="forum-reply" data-work-id={result.id} data-side={side}>
    <div className="forum-reply-content">
      {story.heading !== undefined && <p className="forum-original">{story.heading}</p>}
      {story.paragraphs.map((paragraph, index) => <p className="forum-original" key={index}>{paragraph}</p>)}
      {story.ending !== undefined && <p className="forum-original">{story.ending}</p>}
    </div>
  </article>;
}
