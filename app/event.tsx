import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { AccountButton } from '@/components/account';

// 特别赛「鹈鹕大乱斗」独立页（P06，名称暂定；决策 026：独立成榜）。
// 当前为占位：呈现常驻入口与 001 鹈鹕大挑战的样例，轮换规则与独立榜单待实施。
export default function Event() {
  return (
    <main className="observatory event-page">
      <header className="obs-header">
        <a href="#play" className="obs-brand">
          <span className="obs-brand-symbol">≡</span>
          <span>
            ARENA OF <b>BIAS</b>
            <small>特别赛 / SPECIAL EVENT</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <a href="#play">
            <ArrowLeft size={13} style={{ verticalAlign: '-2px' }} /> 玩法菜单
          </a>
          <a href="#prompts">02 / 题目档案</a>
          <a href="#rank">03 / 偏好榜 ↗</a>
        </nav>
        <AccountButton />
      </header>
      <div className="event-body">
        <span className="obs-kicker">
          <i /> SPECIAL EVENT / 常驻玩法
        </span>
        <h1>
          鹈鹕大乱斗<span className="event-dot">。</span>
        </h1>
        <p className="event-en">PELICAN RUMBLE · INDEPENDENT BOARD</p>
        <p className="event-desc">
          常驻 / 轮换的特别对局：同一道无厘头题目，看各路作品放飞自我。
          特别赛独立成榜，不混入主榜。轮换规则与独立榜单正在筹备，先去看看那道起源之题。
        </p>
        <div className="event-actions">
          <a className="home-enter event-enter" href="#arena/001">
            <span>
              查看起源之题
              <small>001 / 鹈鹕大挑战</small>
            </span>
            <ArrowUpRight size={26} />
          </a>
        </div>
        <p className="obs-data-note">玩法名称与轮换规则均为暂定，筹备中。</p>
      </div>
    </main>
  );
}
