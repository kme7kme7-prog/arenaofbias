import { ArrowUpRight, Lock } from 'lucide-react';
import { useAccount, AccountButton } from '@/components/account';
import { currentRandomArenaHash } from '@/lib/placeholder';
import { convoyNavigate } from '@/lib/game-transitions';

// 玩法分层的菜单数据（名称暂定，见决策 023/024/026）。
// 正式测评为资格制：当前 dev 开发者身份拥有资格（决策 028）。
export const MODES = [
  {
    id: 'formal',
    code: 'FORMAL',
    name: '正式测评',
    status: '资格制 · dev 身份可进入',
    desc: '全程匿名的严格盲测：任何环节都不揭示模型名称，也没有评论区，你的选择只汇入偏好数据。',
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
] as const;

export default function PlayMenu() {
  const { user } = useAccount();
  // 资格判定：当前唯一持资格的是开发者身份（决策 028）
  const qualified = user?.username === 'dev';
  const formalHref = () => {
    const hash = currentRandomArenaHash();
    return hash.startsWith('#arena/')
      ? hash.replace('#arena/', '#formal/')
      : hash;
  };
  return (
    <div className="lobby play-classic">
      <header className="lobby-header">
        <a className="lobby-brand" href="#home" aria-label="回到首页">
          <span className="lobby-mark" aria-hidden="true">
            ≡
          </span>
          <span>
            ARENA OF <b className="brand-tag">BIAS</b>
            <small>玩法菜单 / PLAY MENU</small>
          </span>
        </a>
        <AccountButton />
      </header>
      <main className="play-classic-main">
        <h1>
          选择玩法，<em>然后交给直觉。</em>
        </h1>
        <ul className="play-classic-list">
          {MODES.map((mode, index) => {
            const locked = mode.id === 'formal' && !qualified;
            return (
              <li key={mode.id}>
                {locked ? (
                  <div className="play-classic-item locked" aria-disabled="true">
                    <span className="play-classic-idx">
                      {String(index + 1).padStart(3, '0')}
                    </span>
                    <span className="play-classic-name">
                      <b>{mode.name}</b>
                      <small>{mode.code} · 资格制 · 暂未开放</small>
                    </span>
                    <span className="play-classic-desc">{mode.desc}</span>
                    <span className="play-classic-go">
                      <Lock size={15} /> 需要资格
                    </span>
                  </div>
                ) : (
                  <a
                    className="play-classic-item"
                    href={
                      mode.id === 'event'
                        ? '#event'
                        : mode.id === 'formal'
                          ? formalHref()
                          : '#random'
                    }
                    onClick={(e) => {
                      // 菜单进测评走一体斜幕（2026-09-13 用户拍板）；
                      // formal 的目的地在点击时现抽，保持随机口径
                      e.preventDefault();
                      const hash =
                        mode.id === 'event'
                          ? '#event'
                          : mode.id === 'formal'
                            ? formalHref()
                            : '#random';
                      convoyNavigate(hash, mode.code);
                    }}
                  >
                    <span className="play-classic-idx">
                      {String(index + 1).padStart(3, '0')}
                    </span>
                    <span className="play-classic-name">
                      <b>{mode.name}</b>
                      <small>
                        {mode.code} · {mode.status}
                      </small>
                    </span>
                    <span className="play-classic-desc">{mode.desc}</span>
                    <span className="play-classic-go">
                      进入 <ArrowUpRight size={17} />
                    </span>
                  </a>
                )}
              </li>
            );
          })}
        </ul>
        <p className="play-classic-note">
          玩法名称为暂定；正式测评为资格制，开发者身份（dev 面板登录）当前持有资格。
        </p>
      </main>
    </div>
  );
}
