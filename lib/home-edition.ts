// 首页三版（经典/新版/对决）本地偏好——切换入口已收进开发者面板（决策 086），
// 首页按此键渲染，默认新版。write 后派发事件让已挂载的首页即时换版，
// 其他页面下次进入首页时由路由重挂载自然重读。
export type HomeEdition = 'old' | 'new' | 'duel';

const STORAGE_KEY = 'aob-home-edition';
export const HOME_EDITION_CHANGED = 'aob:home-edition-changed';

export function readHomeEdition(): HomeEdition {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'old' || stored === 'duel' ? stored : 'new';
  } catch {
    return 'new';
  }
}

export function writeHomeEdition(value: HomeEdition) {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    /* Session-only preference. */
  }
  window.dispatchEvent(new CustomEvent(HOME_EDITION_CHANGED));
}
