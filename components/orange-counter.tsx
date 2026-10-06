import type { ModelResult, Side } from '@/lib/arena';

// Review server only: ordinary dev and production builds keep the existing arena.
export const ORANGE_REVIEW = import.meta.env.DEV && import.meta.env.VITE_ORANGE_REVIEW === '1';
// 2026-10-06 用户拍板正式启用两套皮肤；ORANGE_REVIEW 仍是本地试版开关（不计数）。
export const SKINS_ENABLED = true;
export const ORANGE_PROMPT_ID = 'q-5ebd7c84dff7cd8f';

export function OrangeCounter({ choice, boards = false }: { choice: Side | 'draw' | null; boards?: boolean }) {
  return <>
    <div className="orange-masthead">
      <div className="orange-edition"><span>偏见小卖部</span></div>
      <h2>卖相不行<span>。</span><br />嘴上得行<span>。</span></h2>
    </div>
    <div className="orange-product" data-choice={choice ?? 'none'}>
      <div className="orange-fruit" aria-hidden="true">
        <svg viewBox="0 0 300 300" fill="none">
          <defs>
            <radialGradient id="orange-skin" cx=".34" cy=".27" r=".78">
              <stop stopColor="#d4d965" /><stop offset=".42" stopColor="#a9b73e" />
              <stop offset=".72" stopColor="#8c9930" /><stop offset="1" stopColor="#657629" />
            </radialGradient>
            <radialGradient id="orange-warm" cx=".32" cy=".35" r=".68">
              <stop stopColor="#efb73d" stopOpacity=".72" /><stop offset="1" stopColor="#b9b84a" stopOpacity="0" />
            </radialGradient>
            <pattern id="orange-pores" width="11" height="13" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="3" r=".9" fill="#495722" opacity=".22" />
              <circle cx="7" cy="9" r=".7" fill="#f7edbb" opacity=".28" />
            </pattern>
          </defs>
          <ellipse cx="153" cy="267" rx="85" ry="10" fill="currentColor" opacity=".1" />
          <path d="M149 58C87 44 43 88 39 149C34 214 84 255 151 255C218 255 265 216 261 155C258 94 212 46 149 58Z" fill="url(#orange-skin)" />
          <path d="M149 58C87 44 43 88 39 149C34 214 84 255 151 255C218 255 265 216 261 155C258 94 212 46 149 58Z" fill="url(#orange-warm)" />
          <path d="M149 58C87 44 43 88 39 149C34 214 84 255 151 255C218 255 265 216 261 155C258 94 212 46 149 58Z" fill="url(#orange-pores)" />
          <path d="M63 132C65 101 83 79 109 71" stroke="#f3ed99" strokeWidth="3" strokeLinecap="round" opacity=".24" />
          <path d="M213 213C225 202 233 186 233 170" stroke="#586d29" strokeWidth="2" strokeLinecap="round" opacity=".28" />
          <ellipse cx="95" cy="192" rx="11" ry="6" fill="#d6b143" opacity=".15" transform="rotate(23 95 192)" />
          <ellipse cx="188" cy="108" rx="5" ry="3" fill="#677729" opacity=".23" transform="rotate(-24 188 108)" />
          <path d="M127 66L141 58L140 48L154 57L169 53L160 66L168 76L150 71L137 77L140 68Z" fill="#52622c" />
          <path d="M151 61C146 47 151 35 158 29" stroke="#5e5635" strokeWidth="5" strokeLinecap="round" />
          <path d="M155 44C174 13 206 23 218 17C213 45 184 58 155 44Z" fill="#395c38" />
          <path d="M157 43L204 28" stroke="#a1b56d" strokeWidth="1.5" />
        </svg>
      </div>
      {boards && <div className="orange-crate" aria-hidden="true"><b>橘</b><i /></div>}
      <p className="orange-product-description">青皮、小个，甜而多汁。</p>
      <p className="orange-product-caption">三句话，卖我这颗橘子。</p>
      <output className="orange-deal" aria-live="polite">
        {choice === 'draw' ? '难分高下' : choice ? `成交 / ${choice.toUpperCase()}` : ''}
      </output>
    </div>
  </>;
}

export function OrangeSignFrame({ side, chosen }: { side: Side; chosen: boolean }) {
  return <>
    <div className="orange-sign-rig" aria-hidden="true">
      <span className="orange-sign-shadow" />
      <span className="orange-sign-back" />
      <span className="orange-sign-leg orange-sign-leg-left" />
      <span className="orange-sign-leg orange-sign-leg-right" />
      <span className="orange-sign-brace" />
      <span className="orange-sign-face" />
      <span className="orange-sign-hinge" />
      <span className="orange-sign-banner"><b>{side.toUpperCase()} 摊</b><em>今日营业</em></span>
    </div>
    <span className={`orange-sale-stamp ${chosen ? 'is-stamped' : ''}`} aria-hidden="true">成交</span>
  </>;
}

export function OrangePitch({ result }: { result: ModelResult }) {
  if (result.content.kind !== 'text') return null;
  return <article className="orange-pitch" data-work-id={result.id}>
    {result.content.story.paragraphs.map((text, index) => {
      // Move the author's list marker into the margin; keep every word verbatim.
      const match = text.match(/^([1-3])[.、．]\s*([\s\S]*)$/);
      return <p key={index}>
        <span className="orange-line-number" aria-hidden="true">{match ? `0${match[1]}` : String(index + 1).padStart(2, '0')}</span>
        <span className="orange-line-text">{match ? match[2] : text}</span>
      </p>;
    })}
  </article>;
}
