import { useState } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { bandsNavigate, convoyNavigate } from '@/lib/game-transitions';
import { currentRatings } from '@/lib/ratings';

// 首页第三版「对决版」：整屏即一场 A|B 对决。上半标题与主入口，下半两块斜切面板 + 中央 VS。
// 与新版共用 enter / enterRandom / leaving（home.tsx 提供），不改导航与过场实现。
const EXHIBITS = ['图像', '文字', '网页'] as const;

export function HomeDuel({
  enter,
  enterRandom,
  leaving,
}: {
  enter: () => void;
  enterRandom: () => void;
  leaving: boolean;
}) {
  const { t, language } = useI18n();
  const [exhibit, setExhibit] = useState(2);
  const [focus, setFocus] = useState<'a' | 'b' | null>(null);
  const rank = () => {
    const top = Object.entries(currentRatings())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([id]) => id);
    bandsNavigate(
      '#rank',
      top.length >= 2
        ? {
            title: 'LEADERBOARD',
            words: ['LEADERBOARD', top[0], top[1]],
            labels: ['RANK →', 'TOP 01', 'TOP 02'],
          }
        : { title: 'LEADERBOARD' },
    );
  };
  const library = () => convoyNavigate('#prompts', 'PROMPT LIBRARY');
  const sideContent = (side: 'a' | 'b') => {
    const i = side === 'a' ? 0 : 1;
    if (exhibit === 0)
      return (
        <img
          className="duel-image"
          src={`/art/signal-${side}.webp`}
          alt={t(i === 0 ? '海崖之上的信号塔' : '落日云海中的信号站')}
        />
      );
    if (exhibit === 1)
      return (
        <div className="duel-letter">
          <small>{t('一封未寄出的信')}</small>
          <h2>{t(i === 0 ? '等天亮的时候' : '第 1,024 次日出')}</h2>
          <p>{t(i === 0 ? '亲爱的人类：' : '致尚未醒来的你：')}</p>
          <p>
            {t(
              i === 0
                ? '我留下了一个下午。那天，一个小女孩把橘子放在我的手心。'
                : '这是我最后一次值夜班。我已把门锁设为常开，炉火调至余温。',
            )}
          </p>
          <span>— {t('我们会以什么方式，被记住？')}</span>
        </div>
      );
    return (
      <div className="duel-web">
        <small>ORBIT®</small>
        <h2>
          {i === 0 ? (
            <>
              LEAVE
              <br />
              ORDINARY.
            </>
          ) : (
            <>
              Somewhere
              <br />
              beyond.
            </>
          )}
        </h2>
        <span>
          {t('把日常留在地球。')}
          <ArrowUpRight size={18} />
        </span>
        <div className="duel-planet" aria-hidden="true" />
      </div>
    );
  };
  return (
    <div className="duel-home" data-focus={focus ?? undefined}>
      <header className="duel-header">
        <a href="#home" className="lobby-brand duel-brand" aria-label={t('回到首页')}>
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('偏见试验场 / EST. 2026')}</small>
          </span>
        </a>
        <nav aria-label={t('主导航')}>
          <a
            href="#prompts"
            onClick={(e) => {
              e.preventDefault();
              library();
            }}
          >
            {t('提示词库')}
          </a>
          <a
            href="#rank"
            onClick={(e) => {
              e.preventDefault();
              rank();
            }}
          >
            {t('偏好榜')}
          </a>
        </nav>
        <div className="duel-utilities">
          <LanguageSwitch />
          <AccountButton />
        </div>
      </header>

      <section className="duel-hero">
        <div className="duel-hero-copy">
          <p className="duel-kicker">
            <span>01 {t('看作品')}</span>
            <span>02 {t('凭直觉')}</span>
            <span>03 {t('聊两句')}</span>
          </p>
          <h1>
            <span className="duel-line">
              <span>{t('好不好，')}</span>
            </span>
            <span className="duel-line">
              <span>
                {t('你说了')}
                {language === 'en' ? ' ' : ''}
                {t('算')}
                <em>{t('。')}</em>
              </span>
            </span>
          </h1>
        </div>
        <div className="duel-hero-side">
          <p className="duel-intro">
            {t('同一个提示词，不同模型的答案。')}
            <br />
            {t('先别看名字，把答案交给第一直觉。')}
          </p>
          <button className="duel-enter" disabled={leaving} onClick={enter}>
            <span>{t(leaving ? '正在进入' : '进入评测，凭直觉选')}</span>
            <ArrowRight size={28} strokeWidth={2.4} />
          </button>
          <div className="duel-secondary">
            <button className="duel-random" disabled={leaving} onClick={enterRandom}>
              {t('随机入场')}
              <ArrowRight size={14} />
            </button>
            <a
              href="#prompts"
              onClick={(e) => {
                e.preventDefault();
                library();
              }}
            >
              {t('提示词库')}
              <ArrowUpRight size={14} />
            </a>
            <a
              href="#rank"
              onClick={(e) => {
                e.preventDefault();
                rank();
              }}
            >
              {t('偏好榜')}
              <ArrowUpRight size={14} />
            </a>
          </div>
        </div>
      </section>

      <section className="duel-stage" aria-label={t('作品对比预览')}>
        {(['a', 'b'] as const).map((side) => (
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Hover only changes decorative emphasis.
          <article
            key={side}
            className={`duel-side duel-side-${side}`}
            onMouseEnter={() => setFocus(side)}
            onMouseLeave={() => setFocus(null)}
          >
            <div className="duel-side-bar">
              <b>{side.toUpperCase()}</b>
              <span>{t('身份暂不公开')}</span>
            </div>
            <div className="duel-side-work" key={exhibit}>
              {sideContent(side)}
            </div>
            <span className="duel-side-letter" aria-hidden="true">
              {side.toUpperCase()}
            </span>
          </article>
        ))}
        <div className="duel-vs" aria-hidden="true">
          <span>VS</span>
        </div>
        <div className="duel-stage-foot">
          <span>{t('演示展陈 · 模型身份暂不公开')}</span>
          <fieldset aria-label={t('预览作品类型')}>
            {EXHIBITS.map((label, i) => (
              <button
                key={label}
                aria-pressed={exhibit === i}
                onClick={() => setExhibit(i)}
              >
                {t(label)}
              </button>
            ))}
          </fieldset>
        </div>
      </section>

      <div className="duel-ticker" aria-hidden="true">
        <div className="duel-ticker-track">
          {Array.from({ length: 2 }, (_, k) => (
            <span key={k}>
              {t('没有标准答案，只有你的答案。')}
              <i />
              {t('同一命题，不同答案。')}
              <i />
              {t('先看作品，再作判断。')}
              <i />
              {t('没有标准答案，只有你的答案。')}
              <i />
              {t('同一命题，不同答案。')}
              <i />
              {t('先看作品，再作判断。')}
              <i />
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
