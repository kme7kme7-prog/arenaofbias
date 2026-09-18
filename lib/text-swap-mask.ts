// 换题过场中「盖区外文字」的补偿：match 双页纸幕只盖场内区域
// （field-meta → 操作行），顶部命题/附言与底部题解裸露，路由重挂载时
// 文字会瞬时硬换。本模块让换题先滑入纸条遮住会变动的文本行（cover），
// 新页挂载后把纸条按新行位重新铺开、再错峰退开（reveal）。
// 纸色与 match 纸幕同族；逐行测量与 lib/decryption.ts 同法，但语义不同——
// 解密黑条是身份揭晓的专属高光，这里是换档的纸面编辑动作。

const SELECTOR = '[data-swap]';
const COVER_MS = 340;
const REVEAL_MS = 700;
// 揭开的起揭延迟（决策 089）：纸条先盖住新行不动，等纸幕开始打开时
// 才错峰退开——文本揭幕与下方作品揭幕落在同一窗口，不提前露底
const REVEAL_DELAY_MS = 240;

type LineBox = { x: number; y: number; right: number; bottom: number };
type Strip = { win: HTMLElement; ink: HTMLElement; order: number };

// 跨路由标记：旧页 cover 已遮 → 新页挂载必须揭。模块级单例，
// 与 transition 层挂 body 活过卸载是同一套生命周期思路。
// armed 带 TTL：目的地不是竞技场时（如 pairs 清空落进 PromptPreview）
// 无人消费，标记若永久残留，之后随便进哪个竞技场都会凭空揭一次字。
// 正常路径 cover→切 hash→新页挂载在 1 秒内完成，TTL 给足余量。
const ARMED_TTL_MS = 5000;
let armed = false;
let armedAt = 0;

export function armTextSwap() {
  armed = true;
  armedAt = Date.now();
}

/** 新竞技场挂载时调用：仅上一轮换题真遮过字才返回 true，读取即复位。 */
export function consumeTextSwap(): boolean {
  const value = armed && Date.now() - armedAt <= ARMED_TTL_MS;
  armed = false;
  return value;
}

export class TextSwapMask {
  private strips: Strip[] = [];
  private frame = 0;
  private started: number | null = null;

  /** 旧页：纸条从左侧滑入，遮住 [data-swap] 元素的每行文本。 */
  cover(root: HTMLElement | null, reduced: boolean) {
    this.clear();
    if (!root || reduced || !this.add(root)) return;
    for (const strip of this.strips)
      strip.ink.style.transform = 'translateX(-101%)';
    this.drive(COVER_MS, (t, strip, count) => {
      const delay = (strip.order / Math.max(1, count - 1)) * 0.25;
      const p = Math.min(1, Math.max(0, (t - delay) / 0.75));
      const eased = 1 - (1 - p) ** 3;
      strip.ink.style.transform = `translateX(${-101 + eased * 101}%)`;
    });
  }

  /** 新页：纸条已按新行位铺好盖住文字，错峰向右退开，结束自清理。 */
  reveal(root: HTMLElement | null, reduced: boolean) {
    this.clear();
    if (!root || reduced || !this.add(root)) return;
    this.drive(
      REVEAL_MS,
      (t, strip, count) => {
        const delay = (strip.order / Math.max(1, count - 1)) * 0.22;
        const p = Math.min(1, Math.max(0, (t - delay) / 0.78));
        // 与身份解密同一条离场曲线：短加速、果断离场、长减速
        const eased =
          p < 0.2 ? 0.4 * (p / 0.2) ** 2 : 1 - 0.6 * ((1 - p) / 0.8) ** (16 / 3);
        strip.ink.style.transform = `translateX(${eased * 101}%)`;
      },
      () => this.clear(),
      REVEAL_DELAY_MS,
    );
  }

  dispose() {
    this.clear();
  }

  private clear() {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.started = null;
    for (const strip of this.strips) strip.win.remove();
    this.strips = [];
  }

  private add(root: HTMLElement): number {
    const strips: Strip[] = [];
    root.querySelectorAll<HTMLElement>(SELECTOR).forEach((target) => {
      target.classList.add('text-swap-masked');
      const bounds = target.getBoundingClientRect();
      const scale = bounds.width / target.offsetWidth;
      if (!scale || !Number.isFinite(scale)) return;
      const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT);
      const lines: LineBox[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          if (!rect.width || !rect.height) continue;
          const x = (rect.left - bounds.left) / scale;
          const y = (rect.top - bounds.top) / scale;
          const right = (rect.right - bounds.left) / scale;
          const bottom = (rect.bottom - bounds.top) / scale;
          const line = lines.find((entry) => Math.abs(entry.y - y) < 6);
          if (line) {
            line.x = Math.min(line.x, x);
            line.y = Math.min(line.y, y);
            line.right = Math.max(line.right, right);
            line.bottom = Math.max(line.bottom, bottom);
          } else lines.push({ x, y, right, bottom });
        }
      }
      for (const line of lines) {
        const win = document.createElement('span');
        win.className = 'swap-mask-window';
        win.setAttribute('aria-hidden', 'true');
        const left = Math.max(0, line.x - 1);
        const right = Math.min(target.clientWidth, line.right + 1);
        win.style.cssText = `left:${left}px;top:${line.y - 1}px;width:${right - left}px;height:${line.bottom - line.y + 2}px`;
        const ink = document.createElement('span');
        ink.className = 'swap-mask-ink';
        win.append(ink);
        target.append(win);
        strips.push({ win, ink, order: strips.length });
      }
    });
    this.strips = strips;
    return strips.length;
  }

  private drive(
    duration: number,
    paint: (t: number, strip: Strip, count: number) => void,
    done?: () => void,
    delayMs = 0,
  ) {
    const tick = (nowMs: number) => {
      const now = nowMs / 1000;
      if (this.started === null) this.started = now;
      const t = Math.min(
        1,
        Math.max(0, (now - this.started - delayMs / 1000) / (duration / 1000)),
      );
      for (const strip of this.strips) paint(t, strip, this.strips.length);
      if (t >= 1) {
        this.frame = 0;
        done?.();
        return;
      }
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }
}

export const textSwapMask = new TextSwapMask();
