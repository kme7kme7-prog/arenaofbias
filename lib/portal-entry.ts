import { getWorksState, subscribeWorks } from './works';
import { getPromptsState, subscribePrompts } from './prompts';

declare global {
  interface Window {
    ArenaEntry?: { ready: (root: HTMLElement) => Promise<void>; fail: () => void; readonly phase: string };
  }
}

// The portal gate owns its deadline and never reveals a fallback as a successful load.
export function settlePortalHome(root: HTMLElement) {
  const gate = window.ArenaEntry;
  if (!gate) return;
  const check = () => {
    const works = getWorksState();
    const prompts = getPromptsState();
    if (works.status !== 'ready' || prompts.status !== 'ready') return;
    if (works.source === 'builtin' || prompts.source === 'builtin') gate.fail();
    else void gate.ready(root);
  };
  const stopWorks = subscribeWorks(check);
  const stopPrompts = subscribePrompts(check);
  check();
  return () => { stopWorks(); stopPrompts(); };
}
