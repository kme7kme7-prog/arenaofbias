import { useState } from 'react';
import {
  ArrowUpRight,
  ArrowRight,
  Crosshair,
  Fingerprint,
  PanelsTopLeft,
  ChartNoAxesColumn,
} from 'lucide-react';
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
      <div className="next-backdrop" aria-hidden="true">
        <span>BIAS</span>
      </div>
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
            <small>{t('偏见试验场 / EST. 2026')}</small>
          </span>
        </a>
        <nav aria-label={t('主导航')}>
          <a
            href="#prompts"
            onClick={(e) => {
              e.preventDefault();
              convoyNavigate('#prompts', 'PROMPT LIBRARY');
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
        </nav>
        <div className="next-utilities">
          <LanguageSwitch />
          <AccountButton />
        </div>
      </header>
      <main className="next-main">
        <section className="next-copy">
          <div className="next-kicker">
            <span />
            {t('HUMAN INSTINCT / AI EXPRESSION')}
          </div>
          <h1>
            {t('好不好，')}
            <br />
            {t('你说了')}
            <span className="next-last">
              <span className="next-word">{t('算')}</span>
              <span className="next-period">{t('。')}</span>
            </span>
          </h1>
          <p className="next-intro">
            {t('同一个提示词，不同模型的答案。')}
            <br />
            <span>{t('先别看名字，把答案交给第一直觉。')}</span>
          </p>
          <div className="next-actions">
            <button className="next-enter" disabled={leaving} onClick={enter}>
              <Fingerprint size={29} />
              <span>{t(leaving ? '正在进入' : '进入评测，凭直觉选')}</span>
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
          <nav className="next-discover" aria-label={t('继续探索')}>
            <a
              href="#prompts"
              aria-label={t('提示词库')}
              onClick={(e) => {
                e.preventDefault();
                convoyNavigate('#prompts', 'PROMPT LIBRARY');
              }}
            >
              <PanelsTopLeft size={19} aria-hidden="true" />
              <span>
                <strong>{t('提示词库')}</strong>
                <small>{t('找一个感兴趣的题目')}</small>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <a
              href="#rank"
              aria-label={t('偏好榜')}
              onClick={(e) => {
                e.preventDefault();
                rank();
              }}
            >
              <ChartNoAxesColumn size={19} aria-hidden="true" />
              <span>
                <strong>{t('偏好榜')}</strong>
                <small>{t('看看大家怎么选')}</small>
              </span>
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
          </nav>
          <div className="next-invitation">
            <span className="next-invitation-mark" aria-hidden="true">
              +
            </span>
            <span>{t('不必懂模型。懂自己的喜欢就够了。')}</span>
          </div>
        </section>
        <section className="next-gallery" aria-label={t('作品对比预览')}>
          <div className="next-stage-rules" aria-hidden="true" />
          <div className="next-gallery-heading">
            <span>
              <Crosshair size={15} />
              {t('同一命题，不同答案。')}
            </span>
            <span>0{exhibit + 1} / 03</span>
          </div>
          <div className="next-artworks" key={exhibit}>
            {['a', 'b'].map((side, i) => (
              <article
                className={`next-artwork next-artwork-${side}`}
                key={side}
              >
                <header className="next-window-bar">
                  <b>{side.toUpperCase()}</b>
                  <span>{t('身份暂不公开')}</span>
                  <i aria-hidden="true" />
                  <ArrowUpRight size={14} />
                </header>
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
                  <span className="next-artwork-letter">
                    {side.toUpperCase()}
                  </span>
                </div>
                <footer>
                  <span>
                    <small>
                      {t('匿名作品')} / 0{i + 1}
                    </small>
                    <strong>
                      {t(
                        exhibit === 0
                          ? i === 0
                            ? '潮汐之上'
                            : '落日之后'
                          : exhibit === 1
                            ? '字里行间，各有回声。'
                            : '同一块屏幕，不同答案。',
                      )}
                    </strong>
                  </span>
                  <ArrowUpRight size={22} />
                </footer>
              </article>
            ))}
          </div>
          <div className="next-versus" aria-hidden="true">
            <span>VS</span>
            <small>{t('你的判断')}</small>
          </div>
          <div className="next-gallery-bottom">
            <span>{t('演示展陈 · 模型身份暂不公开')}</span>
            <fieldset aria-label={t('预览作品类型')}>
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
        </section>
      </main>
      <footer className="next-footer">
        <div className="next-footer-motto">
          {t('没有标准答案，只有你的答案。')}
        </div>
        <ol>
          <li>
            <b>01</b>
            {t('看作品')}
          </li>
          <li>
            <b>02</b>
            {t('凭直觉')}
          </li>
          <li>
            <b>03</b>
            {t('聊两句')}
          </li>
        </ol>
        <span className="next-footer-sign">
          HUMAN INSTINCT.
          <br />
          AI EXPRESSION.
        </span>
      </footer>
    </div>
  );
}
