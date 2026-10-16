const NAME = "Random 随机哥";
const DESC = "纯随机乱走，欢乐担当。";

function act(view) {
  const mine = [];
  for (let i = 0; i < view.h * view.w; i++)
    if (view.owned[i] && view.armies[i] > 1) mine.push(i);
  if (!mine.length || Math.random() < 0.25) return null;
  const s = mine[(Math.random() * mine.length) | 0];
  return [((s / view.w) | 0), s % view.w, (Math.random() * 4) | 0, Math.random() < 0.2];
}
