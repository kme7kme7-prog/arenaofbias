// Tank 2.6 · 单文件入门示例。只使用 decide(state) 提供的观测。
// 这是用于检查上传流程的简单策略，不代表任何模型的实力。
function decide(state) { // eslint-disable-line no-unused-vars -- Entrypoint called by the game engine.
  const zone = state.arena.safeZone;
  const self = state.self;
  let move = ['up', 'right', 'down', 'left'][Math.floor(state.tick / 15) % 4];
  if (self.x < zone.min + 2) move = 'right';
  else if (self.x > zone.max - 3) move = 'left';
  else if (self.y < zone.min + 2) move = 'down';
  else if (self.y > zone.max - 3) move = 'up';
  return { move, fire: true };
}
