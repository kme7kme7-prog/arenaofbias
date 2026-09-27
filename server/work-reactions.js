// 新评价只属于具体作品；旧 reactions 表保留，不能推断它当时针对哪份作品。
export function installWorkReactions(
  app,
  db,
  { sameOrigin, limiter, promptPublished, uuidPattern },
) {
  const counts =
    db.prepare(`SELECT r.work_id AS rid, r.kind, COUNT(*) AS n FROM work_reactions r
    JOIN works w ON w.id = r.work_id WHERE w.prompt_id = ? AND w.published = 1 GROUP BY r.work_id, r.kind`);
  const mine = db.prepare(`SELECT r.work_id AS rid, r.kind FROM work_reactions r
    JOIN works w ON w.id = r.work_id WHERE w.prompt_id = ? AND r.user_id = ? AND w.published = 1`);
  const snapshot = (promptId, userId) => {
    const result = {};
    for (const row of counts.all(promptId)) {
      result[row.rid] ??= { up: 0, down: 0, laugh: 0 };
      result[row.rid][row.kind] = row.n;
    }
    return {
      counts: result,
      mine: userId
        ? Object.fromEntries(
            mine.all(promptId, userId).map((row) => [row.rid, row.kind]),
          )
        : {},
    };
  };
  app.get('/api/reactions', (req, res) => {
    const promptId = String(req.query.prompt ?? '');
    if (!promptPublished(promptId))
      return res.status(400).json({ error: '题目不存在' });
    res.set('Cache-Control', 'no-store').json(snapshot(promptId, req.user?.id));
  });
  app.post('/api/reactions', limiter, (req, res) => {
    if (!sameOrigin(req))
      return res.status(403).json({ error: '请求来源无效' });
    if (!req.headers['content-type']?.includes('application/json'))
      return res.status(415).json({ error: '请求格式无效' });
    if (!req.user) return res.status(401).json({ error: '请先登录再表态。' });
    const { id, promptId, rid, kind, userId } = req.body ?? {};
    if (userId !== req.user.id)
      return res
        .status(409)
        .json({ code: 'account', error: '账号已变化，请重新表态。' });
    const work =
      typeof rid === 'string'
        ? db
            .prepare(
              'SELECT prompt_id, published, is_demo FROM works WHERE id = ?',
            )
            .get(rid)
        : null;
    if (
      typeof id !== 'string' ||
      !uuidPattern.test(id) ||
      typeof promptId !== 'string' ||
      !promptPublished(promptId) ||
      !work?.published ||
      work.is_demo ||
      work.prompt_id !== promptId ||
      ![null, 'up', 'down', 'laugh'].includes(kind)
    )
      return res.status(400).json({ error: '作品评价内容无效，请刷新页面。' });
    if (kind === null)
      db.prepare(
        'DELETE FROM work_reactions WHERE work_id = ? AND user_id = ?',
      ).run(rid, req.user.id);
    else
      db.prepare(`INSERT INTO work_reactions (id, work_id, kind, user_id, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, work_id) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at`).run(
        id,
        rid,
        kind,
        req.user.id,
        Date.now(),
      );
    res
      .set('Cache-Control', 'no-store')
      .status(201)
      .json(snapshot(promptId, req.user.id));
  });
}
