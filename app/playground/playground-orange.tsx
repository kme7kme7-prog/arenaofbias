export function PlaygroundOrange({ choice }: { choice: 'a' | 'b' | 'draw' | null }) {
  return <>
    <div className="orange-masthead pg-orange-masthead">
      <h2>卖我这颗<span>橘子。</span></h2>
      <p>只用三句话，哪份文案让你想买？</p>
    </div>
    <figure className="orange-product pg-orange-product" data-choice={choice ?? 'none'}>
      <div className="pg-orange-portrait">
        <img src="/text-scenes/orange-editorial-v1.webp" alt="一颗青皮、小个的橘子" width="1280" height="1280" />
      </div>
      <figcaption>青皮、小个，甜而多汁。</figcaption>
      <output className="orange-deal" aria-live="polite">{choice === 'draw' ? '两份都让人心动' : choice ? `这一单，给 ${choice.toUpperCase()}` : ''}</output>
    </figure>
  </>;
}
