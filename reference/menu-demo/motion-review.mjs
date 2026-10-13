const frame = document.querySelector('iframe');
const mode = document.querySelector('#mode');
const slow = document.querySelector('#slow');
const motions = () =>
  frame.contentDocument
    .querySelector('.mode-scene')
    ?.getAnimations({ subtree: true }) || [];
const applyRate = () =>
  motions().forEach((motion) => {
    motion.playbackRate = slow.checked ? 0.25 : 1;
  });
mode.addEventListener('change', () => {
  frame.src = `./index.html?mode=${mode.value}`;
});
frame.addEventListener('load', applyRate);
document.querySelector('#replay').addEventListener('click', () => {
  frame.contentDocument.querySelector(`[data-action="${mode.value}"]`)?.click();
  applyRate();
});
document.querySelector('#pause').addEventListener('click', () => {
  const list = motions();
  const paused = list.some((motion) => motion.playState === 'paused');
  list.forEach((motion) => (paused ? motion.play() : motion.pause()));
});
slow.addEventListener('change', applyRate);
