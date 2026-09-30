import { ThemeToggle } from '@/components/theme-toggle';
import { useState } from 'react';
import { ArrowUpRight, ArrowRight } from 'lucide-react';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { bandsNavigate, convoyNavigate } from '@/lib/game-transitions';
import { currentRatings } from '@/lib/ratings';

export function HomeNext({
  enter,
  enterRandom,
  leaving,
}: {
  enter: () => void;
  enterRandom: () => void;
  leaving: boolean;
}) {
  const { t } = useI18n();
  const [exhibit, setExhibit] = useState(0);
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
  return (
    <div className="next-home">
      <div className="next-backdrop" aria-hidden="true" />
      <header className="next-header">
        <a
          href="#home"
          className="lobby-brand next-brand"
          aria-label={t('回到首页')}
        >
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
          </span>
        </a>
        <nav aria-label={t('主导航')}>
          <a href="https://gallery.arenaofbias.icu/#/questions">{t('投稿作品')}</a>
          <a
            href="#prompts"
            onClick={(e) => {
              e.preventDefault();
              convoyNavigate('#prompts', 'PROMPT LIBRARY');
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
        <div className="next-utilities">
          <LanguageSwitch />
          <ThemeToggle />
          <AccountButton />
        </div>
      </header>
      <main className="next-main">
        <section className="next-copy">
          <h1>
            {t('好不好，')}
            <br />
            {t('你说了')}
            <span className="next-last">
              <span className="next-word">{t('算')}</span>
              <span className="next-period">{t('。')}</span>
            </span>
          </h1>
          <p className="next-intro">{t('同一提示词，匿名比较模型作品。')}</p>
          <div className="next-actions">
            <button className="next-enter" disabled={leaving} onClick={enter}>
              <span>{t(leaving ? '正在进入' : '开始评测')}</span>
              <ArrowRight size={26} />
            </button>
            <button
              className="next-random"
              disabled={leaving}
              onClick={enterRandom}
            >
              {t('随机入场')}
              <ArrowRight size={17} />
            </button>
          </div>
        </section>
        <section className="next-gallery" aria-label={t('作品示例')}>
          <div className="next-gallery-heading">
            <span>{t('作品示例')}</span>
            <fieldset
              className="next-gallery-types"
              aria-label={t('预览作品类型')}
            >
              {['图像', '文字', '网页'].map((label, i) => (
                <button
                  aria-pressed={exhibit === i}
                  key={label}
                  onClick={() => setExhibit(i)}
                >
                  {t(label)}
                </button>
              ))}
            </fieldset>
          </div>
          <div
            className={`next-artworks next-artworks-${['image', 'text', 'web'][exhibit]}`}
            key={exhibit}
          >
            {['a', 'b'].map((side, i) => (
              <article
                className={`next-artwork next-artwork-${side}`}
                key={side}
              >
                <div className="next-artwork-image">
                  {exhibit === 0 ? (
                    <img
                      src={`/art/signal-${side}.webp`}
                      alt={t(
                        i === 0 ? '海崖之上的信号塔' : '落日云海中的信号站',
                      )}
                    />
                  ) : exhibit === 1 ? (
                    <div className="next-letter">
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
                  ) : (
                    <div className={`next-web next-web-${side}`}>
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
                        <ArrowUpRight size={20} />
                      </span>
                      <div className="next-planet" />
                    </div>
                  )}
                </div>
                <footer>
                  <b className="next-artwork-side">{side.toUpperCase()}</b>
                  {exhibit === 0 && (
                    <span>{t(i === 0 ? '潮汐之上' : '落日之后')}</span>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
