// 头像库（2026-09-30）：id 与顺序跟共享后端 server/config.mjs 的 AVATARS 一致，
// 图片与 Gallery 相同，放在 public/avatars/。后端负责校验与默认头像（按用户 id 取）。
export const AVATARS = [
  'teapot', 'bunny', 'cube', 'cursor', 'ghost', 'donut', 'brackets', 'frame',
  'seal', 'moon', 'robot', 'cat', 'plant', 'bulb', 'dice', 'planet',
] as const;

export const AVATAR_NAMES: Record<string, string> = {
  teapot: '茶壶', bunny: '兔子', cube: '立方体', cursor: '光标', ghost: '小幽灵', donut: '甜甜圈',
  brackets: '代码括号', frame: '画框', seal: '印章', moon: '月亮', robot: '机器人', cat: '猫',
  plant: '盆栽', bulb: '灯泡', dice: '骰子', planet: '行星',
};

export const avatarSrc = (id: string | null | undefined) =>
  id && (AVATARS as readonly string[]).includes(id) ? `/avatars/${id}.svg` : null;
