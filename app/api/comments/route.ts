import { getDatabase } from '@/lib/database';
import { validateComment, type ArenaComment } from '@/lib/comments';

const columns = 'id, round_id AS roundId, side, body, created_at AS createdAt';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  const roundId = new URL(request.url).searchParams.get('round');
  if (!roundId || !['001', '002', '003'].includes(roundId))
    return Response.json({ error: '题目不存在' }, { status: 400 });
  try {
    const rows = await getDatabase()
      .prepare(
        `SELECT ${columns} FROM comments WHERE round_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
      )
      .bind(roundId)
      .all<ArenaComment>();
    return Response.json({ comments: rows.results }, { headers });
  } catch {
    return Response.json(
      { error: '留言暂时无法加载，请稍后重试' },
      { status: 503, headers },
    );
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(request.url).origin)
    return Response.json({ error: '请求来源无效' }, { status: 403 });
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json({ error: '请求格式无效' }, { status: 415 });
  let input: unknown;
  try {
    const body = await request.text();
    if (body.length > 4000)
      return Response.json({ error: '留言过长' }, { status: 413 });
    input = JSON.parse(body);
  } catch {
    return Response.json({ error: '请求格式无效' }, { status: 400 });
  }
  const comment = validateComment(input);
  if (!comment)
    return Response.json({ error: '请输入 1–280 字的留言' }, { status: 400 });
  try {
    const db = getDatabase();
    await db
      .prepare(
        'INSERT INTO comments (id, round_id, side, body, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      )
      .bind(comment.id, comment.roundId, comment.side, comment.body, Date.now())
      .run();
    const saved = await db
      .prepare(`SELECT ${columns} FROM comments WHERE id = ? AND round_id = ?`)
      .bind(comment.id, comment.roundId)
      .first<ArenaComment>();
    if (!saved || saved.body !== comment.body || saved.side !== comment.side)
      return Response.json(
        { error: '留言编号冲突，请重新提交' },
        { status: 409 },
      );
    return Response.json({ comment: saved }, { status: 201, headers });
  } catch {
    return Response.json(
      { error: '暂时没发出去，你的文字还在。再试一次？' },
      { status: 503, headers },
    );
  }
}
