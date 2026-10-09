import { useSyncExternalStore } from 'react';
import { finishThemeTransition, transitionTheme } from './theme-transition';

export type Theme = 'paper' | 'ink';
export type ThemePreference = Theme | 'system';
export type ThemeScene = 'reading' | 'forest' | 'letter' | 'channels' | 'blackout' | 'waiting';
const key = 'aob-theme';
const system = window.matchMedia('(prefers-color-scheme: dark)');
const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
const listeners = new Set<() => void>();
const valid = (value: unknown): value is Theme =>
  value === 'paper' || value === 'ink';
const readPreference = (): ThemePreference => {
  try {
    const value = localStorage.getItem(key);
    return valid(value) || value === 'system' ? value : 'paper';
  } catch {
    return 'paper';
  }
};
const resolve = (preference: ThemePreference): Theme =>
  preference === 'system' ? (system.matches ? 'ink' : 'paper') : preference;
let preference = readPreference();
let scene: ThemeScene | null = null;
let snapshot = {
  theme: valid(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : resolve(preference),
  preference,
};
const publish = (theme = snapshot.theme) => {
  snapshot = { theme, preference };
  listeners.forEach((listener) => listener());
};
const apply = (theme: Theme) => {
  if (scene === 'blackout') theme = 'ink';
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme === 'ink' ? 'dark' : 'light';
  const color = getComputedStyle(root)
    .getPropertyValue('--browser-color')
    .trim();
  if (color)
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', color);
  publish(theme);
};
/** A reading scene tints the page without replacing the saved preference. */
export function setThemeScene(value: ThemeScene | null) {
  if (scene === value) return;
  finishThemeTransition();
  scene = value;
  if (scene) document.documentElement.dataset.scene = scene;
  else delete document.documentElement.dataset.scene;
  apply(resolve(preference));
  window.dispatchEvent(new Event('aob:scene-tone'));
}
export function setThemePreference(value: ThemePreference) {
  if (value !== 'system' && !valid(value)) return;
  preference = value;
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Retain the manual choice in memory when storage is unavailable. */
  }
  publish();
  const theme = scene === 'blackout' ? 'ink' : resolve(value);
  transitionTheme({ theme, commit: () => apply(resolve(preference)) });
}
export const getThemeSnapshot = () => snapshot;
export const subscribeTheme = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const useTheme = () =>
  useSyncExternalStore(subscribeTheme, getThemeSnapshot, getThemeSnapshot);

export function initTheme() {
  apply(resolve(preference));
  const sync = () => {
    const theme = resolve(preference);
    transitionTheme({ theme, commit: () => apply(theme) }, false);
  };
  const onSystem = () => {
    if (preference === 'system') sync();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    preference = readPreference();
    sync();
  };
  const onMotion = () => {
    if (motion.matches) finishThemeTransition();
  };
  const onVisibility = () => {
    if (document.hidden) finishThemeTransition();
  };
  system.addEventListener('change', onSystem);
  motion.addEventListener('change', onMotion);
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    system.removeEventListener('change', onSystem);
    motion.removeEventListener('change', onMotion);
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisibility);
    finishThemeTransition();
  };
}
