import { ThemeToggle } from '@/components/theme-toggle';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { ArrowUpRight } from 'lucide-react';
import { entertainmentWorkCount, ENTERTAINMENT_MIN_WORKS } from '@/lib/arena';
import type { ModelResult, Prompt } from '@/lib/arena';
import { currentResultsForPrompt } from '@/lib/placeholder';
import { useState } from 'react';
import { PromptVariantSwitch } from '@/components/prompt-variant-switch';

export default function PromptPreview({ prompt }: { prompt: Prompt }) {
  const { t, localize } = useI18n();
  const [variant, setVariant] = useState(prompt.promptVariants?.[0]?.id ?? '');
  const promptText = prompt.promptVariants?.find((item) => item.id === variant)?.prompt ?? prompt.prompt;
  const workCount = entertainmentWorkCount(prompt.id, currentResultsForPrompt(prompt.id));
  const collecting = workCount > 0 && workCount < ENTERTAINMENT_MIN_WORKS;
  const example = currentResultsForPrompt(prompt.id).find(
    (
      result,
    ): result is ModelResult & { content: { kind: 'html'; src: string } } =>
      result.isDemo === true &&
      result.content.kind === 'html' &&
      'src' in result.content,
  );
  return (
    <div className="lobby prompt-library">
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label={t('回到首页')}>
          <span className="lobby-mark">≡</span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('ONE PROMPT / ONE ARENA')}</small>
          </span>
        </a>
        <a className="lobby-small-entry" href="#prompts">
          {t('提示词库')}
          <ArrowUpRight size={16} />
        </a>
        <LanguageSwitch />
        <ThemeToggle />
          <AccountButton />
      </header>
      <main className="library-main sample-main">
        <div className="lobby-eyebrow">
          <span /> {localize(prompt.code)} / {localize(prompt.id)}
        </div>
        <h1>{prompt.name}</h1>
        <PromptVariantSwitch prompt={prompt} selected={variant} onChange={setVariant} />
        <p className="sample-prompt">{promptText}</p>
        <div className="sample-status">
          <b>{collecting ? t('作品收集中（{count}/{minimum}）', { count: workCount, minimum: ENTERTAINMENT_MIN_WORKS }) : localize(example ? '演示样例' : '结果待接入')}</b>
          <span>
            {localize(
              collecting
                ? '暂未开放娱乐盲测，至少需要 10 件作品。'
                : workCount >= ENTERTAINMENT_MIN_WORKS
                  ? '需要至少两个不同模型的作品才能进行比较。'
                  : example
                ? '真实模型结果待接入，暂未开放投票。'
                : '还没有可展示的样例或模型结果，暂未开放投票。',
            )}
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
              <span>
                {example.title} {t('· HTML / SVG 2D 动画')}
              </span>
              <a href={example.content.src} target="_blank" rel="noreferrer">
                {t('独立打开')}
                <ArrowUpRight size={16} />
              </a>
              <a href={example.content.src} download>
                {t('下载 HTML ↓')}
              </a>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
