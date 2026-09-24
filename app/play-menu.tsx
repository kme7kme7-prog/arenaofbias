import { useI18n } from '@/lib/locale';
import { LanguageSwitch } from '@/components/language-switch';
import { ArrowUpRight, Lock } from 'lucide-react';
import { useAccount, AccountButton } from '@/components/account';
import { currentRandomArenaHash } from '@/lib/placeholder';
import { currentPrompts } from '@/lib/prompts';
import { convoyNavigate, guessNavigate } from '@/lib/game-transitions';
import { enterArena } from '@/lib/works-gate';

// 玩法分层的菜单数据（名称暂定，见决策 023/024/026）。
// 正式测评为资格制：当前管理员身份拥有资格（决策 028、070）。
export const MODES = [
  {
    id: 'formal',
    code: 'FORMAL',
    name: '正式测评',
    status: '资格制 · 管理员可进入',
    desc: '全程匿名的严格盲测：任何环节都不揭示模型名称，也没有评论区，你的选择只汇入独立的正式测评数据。',
  },
  {
    id: 'party',
    code: 'PARTY',
    name: '娱乐测评',
    status: '随时可玩',
    desc: '看作品，凭直觉选。做出选择之后才揭晓模型身份，赛后开放评论区。',
  },
  {
    id: 'event',
    code: 'EVENT',
    name: '鹈鹕大乱斗',
    status: '常驻特别赛 · 独立榜单',
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
  const { user } = useAccount();
  // 与服务端 formal 投票门禁一致：管理员持有正式测评资格。
  const qualified = user?.role === 'admin';
  const formalHref = () => {
    const hash = currentRandomArenaHash();
    return hash.startsWith('#arena/')
      ? hash.replace('#arena/', '#formal/')
      : hash;
  };
  // 菜单进测评（2026-09-19）：整屏纸幕钉住当加载中间态，作品就绪才展开；
  // 目的地点击时现抽，牌面标题/题号随之带上
  const enterMode = (hash: string) => {
    const promptId = hash.replace(/^#(arena|formal)\//, '');
    const prompt = currentPrompts().find((item) => item.id === promptId);
    enterArena(hash, prompt?.name, prompt?.id);
  };
  return (
    <div className="lobby play-classic">
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label={t('回到首页')}>
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            {t('ARENA OF')} <b className="brand-tag">{t('BIAS')}</b>
            <small>{t('玩法菜单 / PLAY MENU')}</small>
          </span>
        </a>
        <LanguageSwitch />
        <AccountButton />
      </header>
      <main className="play-classic-main">
        <h1>
          {t('选择玩法，')}
          <em>{t('然后交给直觉。')}</em>
        </h1>
        <ul className="play-classic-list">
          {MODES.map((mode, index) => {
            const locked = mode.id === 'formal' && !qualified;
            return (
              <li key={mode.id}>
                {locked ? (
                  <div
                    className="play-classic-item locked"
                    aria-disabled="true"
                  >
                    <span className="play-classic-idx">
                      {localize(String(index + 1).padStart(3, '0'))}
                    </span>
                    <span className="play-classic-name">
                      <b>{localize(mode.name)}</b>
                      <small>{t('资格制 · 暂未开放')}</small>
                    </span>
                    <span className="play-classic-desc">
                      {localize(mode.desc)}
                    </span>
                    <span className="play-classic-go">
                      <Lock size={15} /> {t('需要资格')}
                    </span>
                  </div>
                ) : (
                  <a
                    className="play-classic-item"
                    href={
                      mode.id === 'event'
                        ? '#event'
                        : mode.id === 'guess'
                          ? '#guess'
                          : mode.id === 'formal'
                            ? formalHref()
                            : '#random'
                    }
                    onClick={(e) => {
                      // 菜单进测评走钉住纸幕（2026-09-19 用户拍板，取代一体斜幕）；
                      // formal 的目的地在点击时现抽，保持随机口径；
                      // 模一把使用独立的抽牌过场，事件页维持 convoy。
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
                        return;
                      e.preventDefault();
                      if (mode.id === 'guess') {
                        guessNavigate();
                        return;
                      }
                      if (mode.id === 'event') {
                        convoyNavigate('#event', mode.code);
                        return;
                      }
                      enterMode(
                        mode.id === 'formal'
                          ? formalHref()
                          : currentRandomArenaHash(),
                      );
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
                )}
              </li>
            );
          })}
        </ul>
        <p className="play-classic-note">
          {t(
            '玩法名称为暂定；正式测评为资格制，管理员账号当前持有资格。',
          )}
        </p>
      </main>
    </div>
  );
}
