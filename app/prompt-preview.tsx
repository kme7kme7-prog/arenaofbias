import { AccountButton } from '@/components/account';
import { ArrowUpRight } from 'lucide-react';
import { type Prompt, resultsForPrompt } from '@/lib/arena';

export default function PromptPreview({ prompt }: { prompt: Prompt }) {
  const example = resultsForPrompt(prompt.id).find(
    (result) => result.isDemo && result.content.kind === 'html',
  );
  return (
    <div className="lobby prompt-library">
      <header className="lobby-header">
        <a className="lobby-brand" href="#home">
          <span className="lobby-mark">≡</span>
          <span>
            BIAS <b>ARENA</b>
            <small>ONE PROMPT / ONE ARENA</small>
          </span>
        </a>
        <a className="lobby-small-entry" href="#prompts">
          提示词库 <ArrowUpRight size={16} />
        </a>
        <AccountButton />
      </header>
      <main className="library-main sample-main">
        <div className="lobby-eyebrow">
          <span /> {prompt.code} / {prompt.id}
        </div>
        <h1>{prompt.name}</h1>
        <p className="sample-prompt">{prompt.prompt}</p>
        <div className="sample-status">
          <b>{example ? '演示样例' : '结果待接入'}</b>
          <span>
            {example
              ? '真实模型结果待接入，暂未开放投票。'
              : '还没有可展示的样例或模型结果，暂未开放投票。'}
          </span>
        </div>
        {example?.content.kind === 'html' && (
          <>
            <iframe
              className="sample-frame"
              title={`${prompt.name}：${example.title}`}
              src={example.content.src}
              sandbox="allow-scripts"
            />
            <div className="sample-links">
              <span>{example.title} · HTML / SVG 2D 动画</span>
              <a href={example.content.src} target="_blank" rel="noreferrer">
                独立打开 <ArrowUpRight size={16} />
              </a>
              <a href={example.content.src} download>
                下载 HTML ↓
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
