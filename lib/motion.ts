import { useSyncExternalStore } from 'react';
const query = window.matchMedia('(prefers-reduced-motion: reduce)');
export const prefersReducedMotion = () => query.matches;
const subscribe = (listener: () => void) => {
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
};
export const useReducedMotion = () =>
  useSyncExternalStore(subscribe, prefersReducedMotion, () => true);
