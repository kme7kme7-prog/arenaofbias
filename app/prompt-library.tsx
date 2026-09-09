import { AccountButton } from '@/components/account';
import { useState, type ReactNode } from 'react';
import { ArrowUpRight, ArrowRight, Search, Shuffle } from 'lucide-react';
import { prompts, resultsForPrompt, eligiblePairs } from '@/lib/arena';

const cardArt: Record<string, ReactNode> = {
  '001': (
    <span>
      鹈鹕
      <br />
      <i>骑行中 ↗</i>
    </span>
  ),
  '004': (
    <span>
      飞檐
      <br />
      <i>斗拱 ↗</i>
    </span>
  ),
  '005': (
    <span>
      飞瀑
      <br />
      <i>穿云 ↗</i>
    </span>
  ),
  '006': (
    <span>
      整装
      <br />
      <i>出发 ↗</i>
    </span>
  ),
  '007': (
    <span>
      事件
      <br />
      <i>视界 ↗</i>
    </span>
  ),
};

const fallbackArt = (kind: string) =>
  kind === 'image' ? (
    <img src="/art/signal-a.webp" alt="" />
  ) : kind === 'text' ? (
    <span>
      致，
      <br />
      另一种答案。
    </span>
  ) : (
    <span>
      HELLO
      <br />
      <i>WORLD_</i>
    </span>
  );

export default function PromptLibrary() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const visible = prompts.filter(
    (prompt) =>
      (kind === 'all' || prompt.kind === kind) &&
      `${prompt.name} ${prompt.prompt}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  return (
    <div className="lobby prompt-library">
      <div className="lobby-grid" aria-hidden="true" />
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label="回到首页">
          <span className="lobby-mark">≡</span>
          <span>
            ARENA OF <b className="brand-tag">BIAS</b>
            <small>偏见试验场 / PROMPT LIBRARY</small>
          </span>
        </a>
        <a className="lobby-small-entry" href="#random">
          <Shuffle size={16} /> 随机入场
        </a>
        <AccountButton />
      </header>
      <main className="library-main">
        <div className="library-heading">
          <div>
            <div className="lobby-eyebrow">
              <span /> CHOOSE YOUR QUESTION
            </div>
            <h1>
              先选问题。
              <br />
              <span>再看答案。</span>
            </h1>
          </div>
          <p>
            一个提示词，一个竞技场。
            <br />
            看看不同模型，如何回答同一个问题。
          </p>
        </div>
        <div className="library-toolbar">
          <div className="library-filters" aria-label="按作品类型筛选">
            {(
              [
                ['all', '全部'],
                ['image', '图像'],
                ['text', '文字'],
                ['web', '网页'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="library-search">
            <Search size={17} />
            <input
              aria-label="搜索提示词"
              placeholder="搜索你感兴趣的问题"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
        </div>
        <output className="library-count">
          {visible.length} 个提示词 <span>当前内容为演示样例</span>
        </output>
        <div className="prompt-grid">
          {visible.map((prompt) => {
            const results = resultsForPrompt(prompt.id);
            const ready = eligiblePairs(prompt.id).length > 0;
            const hasSample = results.some((result) => result.isDemo);
            return (
              <article
                className={`prompt-card prompt-${prompt.kind}`}
                key={prompt.id}
              >
                <div className="prompt-card-top">
                  <span>
                    {prompt.code} / {prompt.category}
                  </span>
                  <b>{prompt.id}</b>
                </div>
                <div className="prompt-card-art" aria-hidden="true">
                  {cardArt[prompt.id] ?? fallbackArt(prompt.kind)}
                </div>
                <h2>{prompt.name}</h2>
                <p className="prompt-full-text">{prompt.prompt}</p>
                <div className="prompt-card-meta">
                  <span>
                    {
                      new Set(
                        results
                          .filter((result) => !result.isDemo)
                          .map((result) => result.modelId),
                      ).size
                    }{' '}
                    个模型
                  </span>
                  <span>
                    {results.filter((result) => !result.isDemo).length} 份结果
                    {results.some((result) => result.isDemo)
                      ? ' · 1 份样例'
                      : ''}
                  </span>
                </div>
                {ready ? (
                  <a className="prompt-card-entry" href={`#arena/${prompt.id}`}>
                    进入这个竞技场 <ArrowUpRight size={21} />
                  </a>
                ) : (
                  <a className="prompt-card-entry" href={`#arena/${prompt.id}`}>
                    {hasSample ? '查看提示词与样例' : '查看提示词'}{' '}
                    <ArrowUpRight size={21} />
                  </a>
                )}
              </article>
            );
          })}
        </div>
        {visible.length === 0 && (
          <div className="library-empty">
            <h2>还没有找到这个问题。</h2>
            <p>换个关键词，或看看其他类型。</p>
            <button
              onClick={() => {
                setQuery('');
                setKind('all');
              }}
            >
              查看全部提示词 <ArrowRight size={16} />
            </button>
          </div>
        )}
      </main>
      <footer className="lobby-footer">
        <span>ONE PROMPT. DIFFERENT ANSWERS.</span>
        <a href="#home">返回首页 ↗</a>
      </footer>
    </div>
  );
}
