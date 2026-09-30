// Every review uses production state, tokens and controls; no copied animation.
import { createRoot } from 'react-dom/client';
import { ThemeToggle } from '../components/theme-toggle';
import { AccountProvider, AccountButton } from '../components/account';
import { initTheme } from '../lib/theme';
import '../app/globals.css';
import '../app/account.css';
import '../app/theme.css';

initTheme();
const host = document.createElement('div');
host.style.cssText =
  'display:flex;flex-wrap:wrap;gap:16px;align-items:center;margin:16px 0';
(document.querySelector('header') ?? document.body).append(host);
createRoot(host).render(
  <>
    <ThemeToggle />
    <a href="./theme-review.html">纸 / 墨总览 ↗</a>
  </>,
);
const account = document.getElementById('account-control');
if (account)
  createRoot(account).render(
    <AccountProvider>
      <AccountButton />
    </AccountProvider>,
  );
