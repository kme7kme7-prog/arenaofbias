import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '@/lib/locale';
import {
  setThemePreference,
  useTheme,
  type ThemePreference,
} from '@/lib/theme';

export function ThemeToggle() {
  const { language } = useI18n();
  const english = language === 'en';
  const { theme, preference } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const id = useId();
  const label = (value: ThemePreference) =>
    value === 'system'
      ? english
        ? 'System'
        : '跟随系统'
      : value === 'paper'
        ? english
          ? 'Paper'
          : '纸面'
        : english
          ? 'Ink'
          : '墨色';
  const desired = preference === 'system' ? theme : preference;
  useEffect(() => {
    if (!open) return;
    root.current
      ?.querySelector<HTMLElement>(
        '[role="menuitemradio"][aria-checked="true"]',
      )
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return (
    <div
      className="theme-toggle"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="theme-toggle-main"
        aria-label={
          english
            ? `Switch to ${label(desired === 'paper' ? 'ink' : 'paper')}; current ${label(preference)}`
            : `切换到${label(desired === 'paper' ? 'ink' : 'paper')}，当前${label(preference)}`
        }
        onClick={() =>
          setThemePreference(desired === 'paper' ? 'ink' : 'paper')
        }
      >
        <span
          className="theme-gauge"
          data-ink={desired === 'ink'}
          aria-hidden="true"
        >
          <i />
        </span>
        <span>{label(theme)}</span>
      </button>
      <button
        type="button"
        ref={menuButton}
        className="theme-toggle-options"
        aria-label={english ? 'Theme preference' : '主题偏好'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div
          id={id}
          className="theme-menu"
          role="menu"
          tabIndex={-1}
          aria-label={english ? 'Theme preference' : '主题偏好'}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setOpen(false);
              menuButton.current?.focus();
            }
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button',
              ),
            ];
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
              event.preventDefault();
              items[
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? items.length - 1
                    : (index +
                        (event.key === 'ArrowDown' ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }
          }}
        >
          {(['system', 'paper', 'ink'] as const).map((value) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={preference === value}
              key={value}
              onClick={() => {
                setThemePreference(value);
                setOpen(false);
                menuButton.current?.focus();
              }}
            >
              <span>{label(value)}</span>
              <span aria-hidden="true">{preference === value ? '●' : '○'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
