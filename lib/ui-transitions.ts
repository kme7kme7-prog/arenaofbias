let translateWipe = (text: string) => text;
export function setWipeTranslator(translator: (text: string) => string) { translateWipe = translator; }
// 可打断的表面颜色过渡；正文不使用 opacity / transform。
// 另有页面级横扫过渡 wipeNavigate：色块扫入盖满整屏时换路由，再扫出露出新页面。

const enterEase = "cubic-bezier(0.22, 1, 0.36, 1)";
const exitEase = "cubic-bezier(0.4, 0, 1, 1)";

/** Owns the visible lifetime, including a close that interrupts an opening. */
export class SurfaceTransition {
  private animations: Animation[] = [];
  private revision = 0;
  private media = window.matchMedia('(prefers-reduced-motion: reduce)');
  private onPreference = () => { if (this.media.matches) this.finish(); };

  constructor(
    private root: HTMLElement,
    private panel?: HTMLElement,
    private enterDuration = 300,
    private exitDuration = 200,
  ) { this.media.addEventListener?.('change', this.onPreference); }

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
    this.media.removeEventListener?.('change', this.onPreference);
  }

  private run(show: boolean, reduced: boolean, finished?: () => void) {
    this.media.addEventListener?.('change', this.onPreference);
    const revision = ++this.revision;
    const hidden = this.root.hidden;
    const backgroundColor = hidden ? 'transparent' : getComputedStyle(this.root).backgroundColor;
    const panelColor = this.panel ? getComputedStyle(this.panel).backgroundColor : undefined;
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
    if (reduced || this.media.matches || (!show && hidden)) {
      complete();
      return;
    }
    const options: KeyframeAnimationOptions = {
      duration: show ? this.enterDuration : this.exitDuration,
      easing: show ? enterEase : exitEase,
      fill: "both",
    };
    const fade = this.root.animate(
      [{ backgroundColor }, { backgroundColor: show ? 'var(--overlay)' : 'transparent' }],
      options,
    );
    this.animations.push(fade);
    if (this.panel) {
      this.animations.push(
        this.panel.animate(
          [
            { backgroundColor: show ? 'var(--entry-wash)' : panelColor },
            { backgroundColor: panelColor },
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
  if (wipeRunning) return;
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (media.matches) { window.location.hash = hash; return; }
  const { cover, hold, exit, ease } = { ...defaultWipeTiming, ...timing };
  wipeRunning = true;
  let committed = false;
  let disposed = false;
  let timer: number | undefined;
  const layer = document.createElement('div');
  layer.className = 'page-wipe';
  layer.dataset.theme = document.documentElement?.dataset.theme || 'paper';
  layer.setAttribute('aria-hidden', 'true');
  const plate = document.createElement('div');
  plate.className = 'page-wipe-plate';
  const copyLayer = document.createElement('div');
  copyLayer.className = 'page-wipe-copy';
  copyLayer.hidden = true;
  const note = document.createElement('span');
  note.textContent = translateWipe(copy.note);
  const title = document.createElement('b');
  title.textContent = translateWipe(copy.title);
  copyLayer.append(note, title);
  layer.append(plate, copyLayer);
  document.body.append(layer);
  const ink = layer.dataset.theme === 'ink';
  const axis = ink ? 'Y' : 'X';
  const commit = () => { if (!committed) { committed = true; window.location.hash = hash; } };
  let animation = plate.animate([
    { transform: `translate${axis}(-101%)` }, { transform: `translate${axis}(0)` },
  ], { duration: cover, easing: ink ? 'cubic-bezier(.25,.6,.25,1)' : ease, fill: 'forwards' });
  const cleanup = () => {
    if (disposed) return;
    disposed = true;
    window.clearTimeout(timer);
    animation.cancel();
    layer.remove();
    wipeRunning = false;
    media.removeEventListener?.('change', onPreference);
    document.removeEventListener?.('visibilitychange', onVisibility);
  };
  const finish = () => { commit(); cleanup(); };
  const onPreference = () => { if (media.matches) finish(); };
  const onVisibility = () => { if (document.hidden) finish(); };
  media.addEventListener?.('change', onPreference);
  document.addEventListener?.('visibilitychange', onVisibility);
  void animation.finished.then(() => {
    if (disposed) return;
    copyLayer.hidden = false;
    commit();
    // Hold a fully painted cover through mounting, even after a long task.
    timer = window.setTimeout(() => {
      if (disposed) return;
      copyLayer.hidden = true;
      animation.cancel();
      animation = plate.animate([
        { transform: `translate${axis}(0)` }, { transform: `translate${axis}(101%)` },
      ], { duration: exit, easing: ink ? 'cubic-bezier(.25,.6,.25,1)' : ease, fill: 'forwards' });
      void animation.finished.then(cleanup).catch(cleanup);
    }, hold);
  }).catch(() => { if (!disposed) finish(); });
}
