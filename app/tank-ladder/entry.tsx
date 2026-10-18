import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { AccountButton, AccountProvider, useAccount } from '@/components/account';
import { apiUrl } from '@/lib/api';
import { playgroundNavigate, settlePlaygroundEntry } from '@/lib/playground-entry';
import './base.css';
import '@/app/account.css';
import '../../tools/tank-ladder/public/style.css';
import './site.css';

declare global {
  interface Window { TankLadderConfig?: { apiBase: string; openAccount?: () => void } }
}
window.TankLadderConfig = { apiBase: apiUrl('/api/tank-ladder') };
document.title = '坦克排位赛 · ARENA OF BIAS';
function Account() {
  const { user, loading, open } = useAccount();
  useEffect(() => {
    window.TankLadderConfig!.openAccount = open;
  }, [open]);
  useEffect(() => {
    if (!loading) window.dispatchEvent(new Event('ladder-account-change'));
  }, [user, loading]);
  return <AccountButton />;
}
createRoot(document.getElementById('ladder-account')!).render(<AccountProvider><Account /></AccountProvider>);
await import('../../tools/tank-ladder/public/ui.js');
document.querySelectorAll<HTMLAnchorElement>('.brand, .back-link').forEach(link => link.addEventListener('click', event => {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); playgroundNavigate(link.href, true);
}));
settlePlaygroundEntry();
