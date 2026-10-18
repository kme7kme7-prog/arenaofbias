import './mode-entry.css';

if (new URLSearchParams(location.search).get('mode') === 'royale') {
  await import('./royale/app.mjs');
} else {
  await import('./app.mjs');
  const modes = document.createElement('nav');
  modes.className = 'tank-mode-switch';
  modes.setAttribute('aria-label', '坦克比赛模式');
  modes.innerHTML = '<span aria-current="page">四人赛</span>';
  const link = document.createElement('a');
  link.href = '/tanks.html?mode=royale';
  link.textContent = '大逃杀 ↗';
  link.addEventListener('click', (event) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !window.PlaygroundEntry) return;
    event.preventDefault();
    window.PlaygroundEntry.navigate(link.href);
  });
  modes.append(link);
  const ladder = document.createElement('a');
  ladder.href = '/ladder.html';
  ladder.textContent = '排位赛 ↗';
  ladder.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !window.PlaygroundEntry) return;
    event.preventDefault();
    window.PlaygroundEntry.navigate(ladder.href);
  });
  modes.append(ladder);
  document.querySelector('.title-block').append(modes);
}
