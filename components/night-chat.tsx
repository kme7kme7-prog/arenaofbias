import type { CSSProperties } from 'react';
import type { ModelResult, Side } from '@/lib/arena';

export function nightChatQuestion(prompt: string): string | null {
  const quotes = [...prompt.matchAll(/[“「"]([^”」"]+)[”」"]/g)];
  return quotes.reverse().map(match => match[1].trim()).find(text => /[？?]$/.test(text)) ?? null;
}

export function NightChatMasthead() {
  return <div className="night-chat-masthead">
    <h2>这句深夜消息，你想回谁？</h2>
    <time dateTime="02:30">02:30<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19.5 15.9A8.4 8.4 0 0 1 8.1 4.5a8.4 8.4 0 1 0 11.4 11.4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg></time>
  </div>;
}

function ChatAvatar({ self = false }: { self?: boolean }) {
  return <span className={`chat-avatar ${self ? 'chat-avatar-self' : ''}`} aria-hidden="true">
    <svg viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="15" r="7" fill="currentColor" />
      <path d="M7 36C7 27 12 24 20 24C28 24 33 27 33 36" fill="currentColor" />
    </svg>
  </span>;
}

export function NightChatReply({ result, side, question }: { result: ModelResult; side: Side; question: string }) {
  if (result.content.kind !== 'text') return null;
  const { story } = result.content;
  const messages = [...(story.heading ? [story.heading] : []), ...story.paragraphs, ...(story.ending ? [story.ending] : [])];
  // Keep long answers within the same short entrance beat, without timers.
  const messageStep = Math.min(55, 330 / Math.max(1, messages.length - 1));
  return <article className="wechat-thread" data-work-id={result.id} data-tour-scroll tabIndex={0} aria-label={`联系人 ${side.toUpperCase()} 的聊天记录`}>
    <div className="chat-message chat-message-self">
      <p className="chat-bubble chat-question">{question}</p>
      <ChatAvatar self />
    </div>
    <div className="chat-replies" style={{ '--chat-message-step': `${messageStep}ms` } as CSSProperties}>
      {messages.map((text, index) => <div className="chat-message" key={index} style={{ '--chat-message-order': index } as CSSProperties}>
        <ChatAvatar />
        <p className="chat-bubble chat-response">{text}</p>
      </div>)}
    </div>
  </article>;
}
