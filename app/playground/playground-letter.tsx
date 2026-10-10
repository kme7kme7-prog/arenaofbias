export function PlaygroundLetterSignature({ name, chosen, draw }: { name: string; chosen: boolean; draw: boolean }) {
  return <div className="side-result pg-letter-signature" aria-live="polite">
    <span>{draw ? '两封都留下' : chosen ? '你想回复的这封' : '另一封来信'}</span>
    <strong><i aria-hidden="true">——</i>{name}</strong>
  </div>;
}
