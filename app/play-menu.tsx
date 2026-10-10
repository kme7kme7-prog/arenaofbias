import { ThemeToggle } from '@/components/theme-toggle';
import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { ArrowUpRight, Lock } from 'lucide-react';
import { AccountButton } from '@/components/account';
import { GALLERY_BLIND } from '@/lib/gallery-links';
import { guessNavigate, homeNavigate } from '@/lib/game-transitions';
import { LegalFooter } from '@/components/legal-footer';
import { useEffect } from 'react';
import { playgroundNavigate, settlePlaygroundEntry } from '@/lib/playground-entry';

// 玩法分层的菜单数据（名称暂定，见决策 023/024/026）。
// 正式测评入口前往 Gallery 盲测，本站其他玩法保持原行为。
export const MODES = [
  {
    id: 'formal',
    code: 'FORMAL',
    name: '正式测评',
    status: '前往展览馆 · 盲测',
    desc: '将跳转到展览馆的盲测页面，参与匿名作品比较。',
  },
  {
    id: 'party',
    code: 'PLAY',
    name: '随心玩',
    status: '随时可玩',
    desc: '转一转作品，读一段故事。挑喜欢的，再看看是谁做的。',
  },
  {
    id: 'event',
    code: 'EVENT',
    name: '鹈鹕大乱斗',
    status: '暂未完成',
    desc: '轮换主题的特别对局，单独成页、独立成榜，不混入主榜。',
  },
  {
    id: 'guess',
    code: 'GUESS',
    name: '模一把',
    status: '每日一题 · 全世界同题',
    desc: '8 次机会猜出今天的 AI 模型：绿色猜中、黄色接近、箭头指方向。猜完把战绩格子分享出去。',
  },
] as const;

export default function PlayMenu() {
  const { t, localize } = useI18n();
  useEffect(settlePlaygroundEntry, []);
  return (
    <div className="lobby play-classic">
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label={t('回到首页')} onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          homeNavigate();
        }}>
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('玩法菜单 / PLAY MENU')}</small>
          </span>
        </a>
        <LanguageSwitch />
        <ThemeToggle />
          <AccountButton />
      </header>
      <main className="play-classic-main">
        <h1>
          {t('选择玩法，')}
          <em>{t('然后交给直觉。')}</em>
        </h1>
        <ul className="play-classic-list">
          {MODES.map((mode, index) => {
            if (mode.id === 'event') return (
              <li key={mode.id}>
                <div className="play-classic-item locked" aria-disabled="true">
                  <span className="play-classic-idx">{localize(String(index + 1).padStart(3, '0'))}</span>
                  <span className="play-classic-name">
                    <b>{localize(mode.name)}</b>
                    <small>{t('暂未完成')}</small>
                  </span>
                  <span className="play-classic-desc">{localize(mode.desc)}</span>
                  <span className="play-classic-go"><Lock size={15} />{t('暂未完成')}</span>
                </div>
              </li>
            );
            return (
              <li key={mode.id}>
                  <a
                    className="play-classic-item"
                    href={
                      mode.id === 'guess'
                          ? '#guess'
                          : mode.id === 'formal'
                            ? GALLERY_BLIND
                            : '/playground.html'
                    }
                    onClick={(e) => {
                      // 随心玩跨文档横推；模一把保留独立抽牌过场。
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                        return;
                      if (mode.id === 'formal') return;
                      e.preventDefault();
                      if (mode.id === 'party') {
                        playgroundNavigate();
                        return;
                      }
                      if (mode.id === 'guess') {
                        guessNavigate();
                        return;
                      }
                    }}
                  >
                    <span className="play-classic-idx">
                      {localize(String(index + 1).padStart(3, '0'))}
                    </span>
                    <span className="play-classic-name">
                      <b>{localize(mode.name)}</b>
                      <small>{localize(mode.status)}</small>
                    </span>
                    <span className="play-classic-desc">
                      {localize(mode.desc)}
                    </span>
                    <span className="play-classic-go">
                      {t('进入')}
                      <ArrowUpRight size={17} />
                    </span>
                  </a>
              </li>
            );
          })}
        </ul>
        <p className="play-classic-note">
          {t(
            '正式测评将前往展览馆；其他玩法在本站进行。',
          )}
        </p>
      </main>
      <LegalFooter />
    </div>
  );
}
