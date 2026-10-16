import { useLayoutEffect, useRef } from 'react';
import { ThemeToggle } from '@/components/theme-toggle';
import { LanguageSwitch } from '@/components/language-switch';
import { AccountButton } from '@/components/account';
import { LegalFooter } from '@/components/legal-footer';
import { useI18n } from '@/lib/locale';
import { guessNavigate, homeNavigate } from '@/lib/game-transitions';
import {
  playgroundNavigate,
  settlePlaygroundEntry,
} from '@/lib/playground-entry';
import { mountMenu } from '@/reference/menu-demo/controller.mjs';
import { MODES } from '@/reference/menu-demo/modes.mjs';
import template from '@/reference/menu-demo/index.html?raw';
import { localizeMenu } from './play-menu-locale';
import 'virtual:play-menu-design.css';
import './play-menu.css';

export { MODES };
const assets = import.meta.glob<string>(
  [
    '../reference/menu-demo/assets/motif-*.svg',
    '../reference/menu-demo/assets/play-conversation.svg',
    '../reference/menu-demo/assets/temple-*.png',
    '../reference/menu-demo/assets/geo-kawaguchi.jpg',
  ],
  { eager: true, query: '?url', import: 'default' },
);
const assetURL = (name: string) =>
  assets[`../reference/menu-demo/assets/${name}`];
let rememberedMode = 'party';

// Only this mount owns the reviewed DOM island. React owns the account, theme,
// language and legal controls, and the controller releases all listeners on exit.
export default function PlayMenu() {
  const { language, t } = useI18n();
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!root.current || !content.current) return;
    const island = content.current;
    document.documentElement.dataset.playMenu = '';
    const source = new DOMParser().parseFromString(template, 'text/html');
    island.innerHTML = ['main.layout', '.help-dialog', '#status']
      .map((selector) => source.querySelector(selector)!.outerHTML)
      .join('');
    const dispose = mountMenu(root.current, {
      assetURL,
      history: false,
      initialMode: rememberedMode,
      onMode: (id: string) => {
        rememberedMode = id;
      },
      localize: (element: HTMLElement) => localizeMenu(element, language),
      navigate: (id: string, href: string) => {
        if (id === 'party') playgroundNavigate();
        else if (id === 'tierlist') playgroundNavigate('/tier.html');
        else if (id === 'tanks') playgroundNavigate('/tanks.html');
        else if (id === 'generals') playgroundNavigate('/generals.html');
        else if (id === 'guess') guessNavigate();
        else if (id === 'formal') window.location.assign(href);
      },
    });
    settlePlaygroundEntry();
    return () => {
      dispose();
      island.replaceChildren();
      delete document.documentElement.dataset.playMenu;
    };
  }, [language]);
  return (
    <div className="play-collection" ref={root} data-language={language}>
      <div className="menu-app">
        <header className="masthead">
          <a
            className="brand"
            href="#home"
            aria-label={t('回到首页')}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
              )
                return;
              event.preventDefault();
              homeNavigate();
            }}
          >
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              ARENA OF <b>BIAS</b>
            </span>
          </a>
          <div className="masthead-tools">
            <LanguageSwitch />
            <ThemeToggle />
            <AccountButton />
            <button
              type="button"
              className="help-trigger"
              aria-label={t('怎么玩')}
              aria-haspopup="dialog"
            >
              ?
            </button>
          </div>
        </header>
        <div className="collection-content" ref={content} />
        <LegalFooter />
      </div>
    </div>
  );
}
