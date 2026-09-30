import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { LegalFooter } from '@/components/legal-footer';
import { useI18n } from '@/lib/locale';
import { LEGAL_PAGES, LEGAL_UPDATED, SITE_NAME, type LegalKind } from '@/lib/legal';

const num = (index: number) => String(index + 1).padStart(2, '0');

// 使用条款与隐私政策（#terms、#privacy；#terms/cite 直达某一节）。正文只有中文，
// 英文界面给出说明；条款 HTML 是本仓常量，不含外部输入。
export default function LegalPage({ kind, section }: { kind: LegalKind; section?: string }) {
  const { t, language } = useI18n();
  const doc = LEGAL_PAGES[kind];
  const [current, setCurrent] = useState(section);
  const [copied, setCopied] = useState('');
  const cite = `来源：${SITE_NAME}（${window.location.origin}）`;
  const other = kind === 'terms' ? (['privacy', '隐私政策'] as const) : (['terms', '使用条款与免责声明'] as const);

  const jump = (id: string) => {
    document.getElementById(`${kind}-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrent(id);
  };
  // 路由切换会先滚回顶部，直达的小节等一帧再定位
  useEffect(() => {
    if (!section) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById(`${kind}-${section}`)?.scrollIntoView({ block: 'start' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [kind, section]);

  const copyCite = async () => {
    try {
      await navigator.clipboard.writeText(cite);
      setCopied('已复制');
    } catch {
      setCopied('复制失败，请手动选择文字复制');
    }
  };

  return (
    <div className="lobby legal-page">
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label={t('回到首页')}>
          <span className="lobby-mark" aria-hidden="true">≡</span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t(doc.title)}</small>
          </span>
        </a>
        <LanguageSwitch />
        <ThemeToggle />
        <AccountButton />
      </header>
      <main className="legal-main">
        <aside className="legal-aside">
          <h1>{doc.title}</h1>
          <p>{doc.description}</p>
          <nav className="legal-toc" aria-label={`${doc.title}目录`}>
            {doc.sections.map((item, index) => (
              <a
                key={item.id}
                href={`#${kind}/${item.id}`}
                aria-current={current === item.id ? 'location' : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  history.replaceState(null, '', `#${kind}/${item.id}`);
                  jump(item.id);
                }}
              >
                <span>{num(index)}</span>
                {item.title}
              </a>
            ))}
          </nav>
        </aside>
        <article className="legal-article" lang="zh-CN">
          <div className="legal-heading">
            <h2>{doc.heading}</h2>
            <span>最近更新 {LEGAL_UPDATED}</span>
          </div>
          {language === 'en' && (
            <p className="legal-language-note" lang="en">
              This page is currently available in Chinese only.
            </p>
          )}
          {doc.sections.map((item, index) => (
            <section key={item.id} id={`${kind}-${item.id}`} aria-labelledby={`${kind}-${item.id}-title`}>
              <h3 id={`${kind}-${item.id}-title`}>
                <span>{num(index)}</span>
                {item.title}
              </h3>
              <div dangerouslySetInnerHTML={{ __html: item.html }} />
              {item.id === 'cite' && (
                <div className="legal-cite">
                  <span>引用格式</span>
                  <code>{cite}</code>
                  <button type="button" onClick={copyCite}>
                    <Copy size={14} />
                    {copied || '复制'}
                  </button>
                </div>
              )}
            </section>
          ))}
          <p className="legal-related">
            另请参阅：<a href={`#${other[0]}`}>{other[1]}</a>
          </p>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
