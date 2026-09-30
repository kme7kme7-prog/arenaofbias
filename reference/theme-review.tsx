import { createRoot } from 'react-dom/client';
import { ThemeToggle } from '../components/theme-toggle';
import { initTheme, setThemePreference, getThemeSnapshot } from '../lib/theme';
import {
  createGameTransition,
  type GameTransitionKind,
} from '../lib/game-transitions';
import '../app/globals.css';
import '../app/game-transitions.css';
import '../app/theme.css';
import './theme-review.css';

initTheme();
createRoot(document.getElementById('theme-control')!).render(<ThemeToggle />);
const status = document.getElementById('status')!;
const stage = document.getElementById('stage')!;
const hold = document.getElementById('hold') as HTMLInputElement;
document.getElementById('toggle')!.onclick = () =>
  setThemePreference(getThemeSnapshot().theme === 'paper' ? 'ink' : 'paper');
document.getElementById('system')!.onclick = () => setThemePreference('system');
document.getElementById('release')!.onclick = () => {
  hold.checked = false;
};
let transition: ReturnType<typeof createGameTransition> | undefined;
for (const kind of [
  'frame',
  'bands',
  'convoy',
  'deal',
  'folio',
  'match',
] as GameTransitionKind[]) {
  const button = document.createElement('button');
  button.textContent = kind;
  button.onclick = () => {
    transition?.dispose();
    status.textContent = '覆盖';
    transition = createGameTransition(kind, {
      parent: stage,
      title: kind === 'deal' ? '模一把' : '相信你的第一直觉',
      holdGate: () => !hold.checked,
      onCovered: () => {
        status.textContent = '已盖满 · 可以换内容';
      },
      onFinish: () => {
        status.textContent = '揭幕完成';
      },
    });
    transition.play();
  };
  document.getElementById('kinds')!.append(button);
}
