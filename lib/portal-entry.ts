import { getWorksState } from './works';
import { getPromptsState } from './prompts';

declare global {
  interface Window {
    ArenaEntry?: { ready: (root: HTMLElement) => Promise<void>; fail: () => void; readonly phase: string };
  }
}

// The portal gate owns its deadline and never reveals a fallback as a successful load.
export function settlePortalHome(root: HTMLElement, catalogRequired = true) {
  const gate = window.ArenaEntry;
  if (!gate) return;
  if (catalogRequired) {
    const works = getWorksState();
    const prompts = getPromptsState();
    if (works.status === 'error' || prompts.status === 'error') { gate.fail(); return; }
    if (works.status !== 'ready' || prompts.status !== 'ready') return;
    if (works.source === 'builtin' || prompts.source === 'builtin') { gate.fail(); return; }
  }
  // Called after the active React route commits. The arrival gate itself waits
  // for visible images and fonts; unrelated catalogs do not hold the homepage.
  void gate.ready(root);
}
