export const TIERS = ['夯', '顶级', '人上人', 'NPC', '拉'];
export function newBoard(ids) {
  return { rows: [[], [], [], [], []], tray: [...ids], revealed: false };
}
export function validBoard(board, ids) {
  if (
    !board ||
    !Array.isArray(board.rows) ||
    board.rows.length !== 5 ||
    !board.rows.every(Array.isArray) ||
    !Array.isArray(board.tray) ||
    typeof board.revealed !== 'boolean'
  )
    return false;
  const all = [...board.rows.flat(), ...board.tray];
  return (
    all.length === ids.length &&
    new Set(all).size === ids.length &&
    all.every((id) => ids.includes(id)) &&
    (!board.revealed || !board.tray.length)
  );
}
export function moveCard(board, id, target, before = null) {
  if (
    board.revealed ||
    ![...board.rows.flat(), ...board.tray].includes(id) ||
    !['tray', '0', '1', '2', '3', '4'].includes(String(target))
  )
    return board;
  if (before === id) return board;
  const next = structuredClone(board);
  next.rows = next.rows.map((row) => row.filter((item) => item !== id));
  next.tray = next.tray.filter((item) => item !== id);
  const list = target === 'tray' ? next.tray : next.rows[Number(target)];
  const index = before ? list.indexOf(before) : -1;
  list.splice(index < 0 ? list.length : index, 0, id);
  return JSON.stringify(next) === JSON.stringify(board) ? board : next;
}
