// 「下一题」纸幕的作品就绪门（决策 096）：旧页进纸幕前 arm，纸幕盖满切路由后
// 钉在盖满位不扫出——牌面本身就是加载屏；新竞技场逐侧上报就绪、双侧齐了
// （或卡死超时/用户跳过/页面离开）才开门放幕，揭幕直接落在就绪作品上，
// 「正在接入试验场」整拍被纸幕吸收。
// 模块级状态跨路由存活：层挂在 body 上活过旧页卸载，新页在同一份 JS 上下文里放门。
import { createGameTransition } from './game-transitions';

const FAILSAFE_MS = 15000;
let armed = false;
let released = false;
let armedAt = 0;
const readySides = { a: false, b: false };

export function armWorksGate() {
  armed = true;
  released = false;
  armedAt = performance.now();
  readySides.a = readySides.b = false;
}

// 新页逐侧上报就绪：纸幕牌面的 A/B 连线据此填色报进度
export function reportWorkReady(side: 'a' | 'b') {
  readySides[side] = true;
}

export function releaseWorksGate() {
  released = true;
}

// 纸幕每帧问一句：开门 = 未布防 / 已放行 / 兜底超时（新页没 mount 上也不留死幕）
export function worksGateOpen() {
  return (
    !armed || released || performance.now() - armedAt > FAILSAFE_MS
  );
}

export function worksGateSides(): Readonly<{ a: boolean; b: boolean }> {
  return readySides;
}

// 全屏入场（2026-09-19 用户拍板）：玩法菜单 / 首页随机入场 / 题库 / 事件页进
// 竞技场统一走整屏纸幕，且默认钉在盖满位当加载中间态——作品双侧就绪才扫出
// 展开，重作品不再把过场卡在半扫或露出加载屏。返回是否真的起了幕（上一幕
// 还钉着时静默不响应，与「下一题」同口径）。
let entering = false;
export function enterArena(hash: string, title?: string, index?: string) {
  if (entering || !worksGateOpen()) return false;
  entering = true;
  armWorksGate();
  const transition = createGameTransition('match', {
    title,
    index,
    holdGate: worksGateOpen,
    onFrame: () => {
      const sides = worksGateSides();
      transition.layer.toggleAttribute('data-gt-a', sides.a);
      transition.layer.toggleAttribute('data-gt-b', sides.b);
    },
    onCovered: () => {
      window.location.hash = hash;
    },
    onFinish: () => {
      entering = false;
    },
  });
  transition.play();
  return true;
}
