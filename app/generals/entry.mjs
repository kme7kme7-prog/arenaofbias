// Keep the standalone engine and its dedicated workers outside the Vite bundle.
const entry='/generals/web/app.js';
try { await import(/* @vite-ignore */ entry); } catch (error) {
  console.error("Generals failed to load",error);
  const status=document.getElementById('status');
  status.textContent='战场加载失败，请刷新重试。';
  document.getElementById('status-wrap').hidden=false;
  document.getElementById('start').disabled=true;
  window.PlaygroundEntry?.ready();
}
