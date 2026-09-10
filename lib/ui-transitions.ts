// 可打断的界面过渡：进入中途关闭会从当前透明度/位移接续反向，不跳变。
// 另有页面级横扫过渡 wipeNavigate：色块扫入盖满整屏时换路由，再扫出露出新页面。

const enterEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const exitEase = "cubic-bezier(0.4, 0, 1, 1)";

/** Owns the visible lifetime, including a close that interrupts an opening. */
export class SurfaceTransition {
  private animations: Animation[] = [];
  private revision = 0;

  constructor(
    private root: HTMLElement,
    private panel?: HTMLElement,
    private enterDuration = 300,
    private exitDuration = 200,
  ) {}

  show(reduced: boolean) {
    this.run(true, reduced);
  }

  hide(reduced: boolean, finished: () => void = () => {}) {
    this.run(false, reduced, finished);
  }

  finish() {
    this.animations.forEach((animation) => animation.finish());
  }

  dispose() {
    this.revision++;
    this.animations.forEach((animation) => animation.cancel());
    this.animations = [];
  }

  private run(show: boolean, reduced: boolean, finished?: () => void) {
    const revision = ++this.revision;
    const hidden = this.root.hidden;
    const opacity = hidden ? "0" : getComputedStyle(this.root).opacity;
    const transform = this.panel
      ? hidden
        ? "translateY(12px)"
        : getComputedStyle(this.panel).transform
      : undefined;
    this.animations.forEach((animation) => animation.cancel());
    this.animations = [];
    this.root.hidden = false;
    this.root.dataset.transition = show ? "opening" : "closing";
    const complete = () => {
      if (revision !== this.revision) return;
      this.root.hidden = !show;
      this.root.dataset.transition = show ? "open" : "closed";
      this.animations.forEach((animation) => animation.cancel());
      this.animations = [];
      finished?.();
    };
    if (reduced || (!show && hidden)) {
      complete();
      return;
    }
    const options: KeyframeAnimationOptions = {
      duration: show ? this.enterDuration : this.exitDuration,
      easing: show ? enterEase : exitEase,
      fill: "both",
    };
    const fade = this.root.animate(
      [{ opacity }, { opacity: show ? 1 : 0 }],
      options,
    );
    this.animations.push(fade);
    if (this.panel) {
      this.animations.push(
        this.panel.animate(
          [
            { transform },
            { transform: show ? "translateY(0)" : "translateY(8px)" },
          ],
          options,
        ),
      );
    }
    void fade.finished.then(complete).catch(() => {});
  }
}

// 页面级横扫过渡。旧实现（首页 .lobby-wipe）的两个问题：
// 1. clip-path 动画每帧整屏重绘会卡顿，这里只用 transform（合成器动画）；
// 2. 色块挂在页面组件里，路由一换组件卸载、色块瞬间消失没有退场——
//    过渡层必须挂在 body 上独立于路由存活，换路由发生在盖满整屏的停顿里。
export interface PageWipeCopy {
  /** 顶部小字（mono 编号风） */
  note: string;
  /** 主文案，随目的地变化（进玩法菜单 ≠ 开新一轮） */
  title: string;
}

/** 三段节奏与缓动。默认值即线上参数；reference/wipe-review.html 调参时覆盖。 */
export interface PageWipeTiming {
  /** 扫入：从屏幕左侧进入到盖满 */
  cover: number;
  /** 盖满停顿：换路由发生在这里，新页面在遮挡下挂载 */
  hold: number;
  /** 扫出：色块移出露出新页面 */
  exit: number;
  ease: string;
}

export const defaultWipeTiming: PageWipeTiming = {
  cover: 360,
  hold: 150,
  exit: 400,
  ease: "cubic-bezier(0.76, 0, 0.24, 1)",
};

let wipeRunning = false;

/** 横扫盖满整屏的瞬间切换路由，随后色块继续扫出，露出已挂载完成的新页面。 */
export function wipeNavigate(
  hash: string,
  copy: PageWipeCopy,
  timing: Partial<PageWipeTiming> = {},
) {
  const { cover, hold, exit, ease } = { ...defaultWipeTiming, ...timing };
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    window.location.hash = hash;
    return;
  }
  if (wipeRunning) return;
  wipeRunning = true;
  const layer = document.createElement("div");
  layer.className = "page-wipe";
  layer.setAttribute("aria-hidden", "true");
  const note = document.createElement("span");
  note.textContent = copy.note;
  const title = document.createElement("b");
  title.textContent = copy.title;
  layer.append(note, title);
  document.body.append(layer);
  const total = cover + hold + exit;
  const sweep = layer.animate(
    [
      { transform: "translateX(-101%)", easing: ease },
      { transform: "translateX(0)", offset: cover / total },
      {
        transform: "translateX(0)",
        offset: (cover + hold) / total,
        easing: ease,
      },
      { transform: "translateX(101%)" },
    ],
    { duration: total, fill: "forwards" },
  );
  // 盖满后才换路由：旧页面卸载、新页面挂载都发生在色块背后
  window.setTimeout(() => {
    window.location.hash = hash;
  }, cover);
  void sweep.finished
    .then(() => {
      layer.remove();
      wipeRunning = false;
    })
    .catch(() => {
      layer.remove();
      wipeRunning = false;
    });
}
