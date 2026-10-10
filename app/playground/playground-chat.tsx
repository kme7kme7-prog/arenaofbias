import type { ModelResult, Side } from '@/lib/arena';
import './playground-chat.css';

export function PlaygroundChatMasthead({ question }: { question: string }) {
  return <div className="night-chat-masthead pg-chat-intro">
    <div className="pg-chat-hour"><span>凌晨</span><time dateTime="02:30">02:30</time>
      <svg viewBox="0 0 34 34" fill="none" aria-hidden="true"><path d="M25 23A12 12 0 0 1 11 7a12 12 0 1 0 14 16Z" stroke="currentColor" strokeWidth="1.2" /><path d="M26 6v6m-3-3h6" stroke="currentColor" strokeWidth="1.2" /></svg>
    </div>
    <div className="pg-chat-sent"><span>聊到这里</span><p>{question}</p></div>
    <h2>你想和谁<br />继续聊？</h2>
  </div>;
}

export function PlaygroundChatReply({ result, side, question }: { result: ModelResult; side: Side; question: string }) {
  if (result.content.kind !== 'text') return null;
  const { story } = result.content;
  const messages = [...(story.heading ? [story.heading] : []), ...story.paragraphs, ...(story.ending ? [story.ending] : [])];
  // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- The independently scrolling transcript needs keyboard focus.
  return <article className="wechat-thread pg-chat-thread" data-work-id={result.id} data-tour-scroll tabIndex={0} aria-label={`联系人 ${side.toUpperCase()} 的聊天记录`}>
    <div className="chat-message chat-message-self">
      <p className="chat-bubble chat-question">{question}</p>
    </div>
    <div className="chat-replies">
      {messages.map((text, index) => <div className="chat-message" key={index}>
        <p className="chat-bubble chat-response">{text}</p>
      </div>)}
    </div>
  </article>;
}
