import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { AccountButton } from '@/components/account';
import { currentPrompts } from '@/lib/prompts';
import { enterArena } from '@/lib/works-gate';

// 特别赛「鹈鹕大乱斗」独立页（P06，名称暂定；决策 026：独立成榜）。
// 当前为占位：呈现常驻入口与 001 鹈鹕大挑战的样例，轮换规则与独立榜单待实施。
export default function Event() {
  const { t } = useI18n();
  return (
    <main className="observatory event-page">
      <header className="obs-header">
        <a href="#play" className="obs-brand">
          <span className="obs-brand-symbol">≡</span>
          <span>
            {t('ARENA OF')} <b>{t('BIAS')}</b>
            <small>{t('特别赛 / SPECIAL EVENT')}</small>
          </span>
        </a>
        <nav aria-label={t('主导航')}>
          <a href="#play">
            <ArrowLeft size={13} style={{ verticalAlign: '-2px' }} />{' '}
            {t('玩法菜单')}
          </a>
          <a href="#prompts">{t('02 / 题目档案')}</a>
          <a href="#rank">{t('03 / 偏好榜 ↗')}</a>
        </nav>
        <LanguageSwitch />
        <AccountButton />
      </header>
      <div className="event-body">
        <span className="obs-kicker">
          <i /> {t('SPECIAL EVENT / 常驻玩法')}
        </span>
        <h1>
          {t('鹈鹕大乱斗')}
          <span className="event-dot">{t('。')}</span>
        </h1>
        <p className="event-en">{t('PELICAN RUMBLE · INDEPENDENT BOARD')}</p>
        <p className="event-desc">
          {t(
            '常驻 / 轮换的特别对局：同一道无厘头题目，看各路作品放飞自我。 特别赛独立成榜，不混入主榜。轮换规则与独立榜单正在筹备，先去看看那道起源之题。',
          )}
        </p>
        <div className="event-actions">
          <a
            className="home-enter event-enter"
            href="#arena/001"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              const prompt = currentPrompts().find((item) => item.id === '001');
              enterArena('#arena/001', prompt?.name, '001');
            }}
          >
            <span>
              {t('查看起源之题')}
              <small>{t('001 / 鹈鹕大挑战')}</small>
            </span>
            <ArrowUpRight size={26} />
          </a>
        </div>
        <p className="obs-data-note">
          {t('玩法名称与轮换规则均为暂定，筹备中。')}
        </p>
      </div>
    </main>
  );
}
