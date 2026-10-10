import { releaseWorksGate } from '@/lib/works-gate';
import { readerPassage } from './playground-passage';
import { playgroundReaderNotes } from './playground-intros';

type PreparedReader = {
  stage: HTMLElement | null;
  signal: AbortSignal;
  waitReady: (signal: AbortSignal) => Promise<void>;
  reveal: () => void;
  ready: () => void;
};

// The explicit playground prop uses one opaque passage for entry and new pairs.
// The shared arena keeps its existing intro.
export async function preparePlaygroundReader({ stage, signal, waitReady, reveal, ready }: PreparedReader) {
  const root = document.documentElement;
  const preparing = root.dataset.pgMaterial === 'preparing'
    || (root.dataset.pgJourney === 'forward' && root.dataset.pgJourneyState === 'preparing');
  if (!root.hasAttribute('data-playground')) return false;
  // Keep the existing thematic masthead in the reader. This preview changes
  // only its short explanation; the original prompt and answers stay intact.
  const theme = stage?.closest<HTMLElement>('[data-text-theme]')?.dataset.textTheme;
  const note = stage?.querySelector<HTMLElement>('.text-masthead-copy > p');
  if (note && theme && playgroundReaderNotes[theme]) note.textContent = playgroundReaderNotes[theme];
  if (!preparing || !stage?.closest('.pg-scene-host[data-preparing]')) {
    const passage = readerPassage(location.hash.slice(7));
    const onAbort = () => { if (!stage?.isConnected) passage.dispose(); };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      await waitReady(signal);
      signal.throwIfAborted();
      // Commit the final controls under cover as well, so uncovering never shows
      // a disabled vote row or the old "skip intro" label for one last frame.
      passage.prepare(stage);
      reveal(); ready(); releaseWorksGate(); passage.release();
      await passage.finished;
      signal.throwIfAborted();
      return true;
    } finally { signal.removeEventListener('abort', onAbort); }
  }
  await waitReady(signal);
  signal.throwIfAborted();
  reveal();
  releaseWorksGate();
  // Opening the readiness gate starts the paper movement. Voting/sound become
  // available only after that movement finishes, without a second intro timer.
  while (root.dataset.pgJourney || root.dataset.pgMaterial) {
    await new Promise<void>(resolve => setTimeout(resolve, 32));
    signal.throwIfAborted();
  }
  return true;
}
