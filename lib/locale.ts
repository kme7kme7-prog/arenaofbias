import { useSyncExternalStore, type ReactNode } from 'react';
import { messages, legacyLabels } from './messages';

export type Locale = 'zh' | 'en';
const key = 'arena-language';
const listeners = new Set<() => void>();
function readLocale(): Locale {
  try {
    return localStorage.getItem(key) === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
}
let locale: Locale = typeof window === 'undefined' ? 'zh' : readLocale();
export const getLocale = () => locale;
function applyLocale(next: Locale) {
  locale = next;
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
  document.title =
    next === 'zh'
      ? '偏见试验场 — 相信你的第一直觉'
      : 'Arena of Bias — Trust your instinct';
  listeners.forEach((notify) => notify());
}
export function setLocale(next: Locale) {
  try {
    localStorage.setItem(key, next);
  } catch {
    /* Session-only when storage is unavailable. */
  }
  applyLocale(next);
}
if (typeof window !== 'undefined') {
  applyLocale(locale);
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) applyLocale(readLocale());
  });
}
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
};
export function translate(text: string, language: Locale): string {
  const source = text.trim();
  const canonical = legacyLabels[source] ?? source;
  const result =
    language === 'en' ? (messages[canonical] ?? canonical) : canonical;
  return text.replace(source, result);
}
export function useI18n() {
  const language = useSyncExternalStore(
    subscribe,
    getLocale,
    () => 'zh' as const,
  );
  const t = (text: string, values?: Record<string, string | number>) => {
    const translated = translate(text, language);
    return values
      ? translated.replace(/\{(\w+)\}/g, (token, name: string) =>
          String(values[name] ?? token),
        )
      : translated;
  };
  const localize = (value: ReactNode): ReactNode =>
    typeof value === 'string' ? t(value) : value;
  return { language, t, localize };
}
