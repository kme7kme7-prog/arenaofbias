import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  inspectSubmissionZip,
  extractSubmissionZip,
} from './submission-zip.js';
import { removeEntry } from './works-register.js';

export function migrateSubmissions(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS submissions (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, prompt_id TEXT NOT NULL,
    model_name TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL,
    filename TEXT NOT NULL, size INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'uploading', created_at INTEGER NOT NULL,
    reviewed_at INTEGER, reviewed_by TEXT, review_note TEXT NOT NULL DEFAULT '', inbox_name TEXT
  ); CREATE INDEX IF NOT EXISTS submissions_user ON submissions(user_id, created_at);
  CREATE INDEX IF NOT EXISTS submissions_status ON submissions(status, created_at);`);
}

export function installSubmissions(
  app,
  db,
  { dataDir, inboxDir, requireAdmin, sameOrigin, promptPublished },
) {
  const directory = path.resolve(dataDir, 'submissions');
  fs.mkdirSync(directory, { recursive: true });
  const select = db.prepare('SELECT * FROM submissions WHERE id = ?');
  const publicRow = (row) => ({
    id: row.id,
    promptId: row.prompt_id,
    modelName: row.model_name,
    title: row.title,
    notes: row.notes,
    filename: row.filename,
    size: row.size,
    status: row.status,
    createdAt: row.created_at,
    reviewNote: row.review_note,
    inboxName: row.inbox_name,
  });
  const requireUser = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: '请先登录再投稿。' });
  const guardWrite = (req, res, next) =>
    sameOrigin(req) ? next() : res.status(403).json({ error: '请求来源无效' });
  const find = (req, res) => {
    const row = /^[a-f0-9-]{36}$/.test(req.params.id)
      ? select.get(req.params.id)
      : null;
    if (!row || (req.user.role !== 'admin' && row.user_id !== req.user.id)) {
      res.status(404).json({ error: '投稿不存在' });
      return null;
    }
    return row;
  };
  const filePath = (row) => path.join(directory, row.id);
  app.get('/api/submissions', requireUser, (req, res) => {
    res.json({
      submissions: db
        .prepare(
          "SELECT * FROM submissions WHERE user_id = ? AND status != 'uploading' ORDER BY created_at DESC LIMIT 100",
        )
        .all(req.user.id)
        .map(publicRow),
    });
  });
  app.post('/api/submissions', requireUser, guardWrite, (req, res) => {
    const { promptId, modelName, title, notes, filename } = req.body ?? {};
    const validText = (value, max) =>
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= max &&
      !value.includes('\0');
    if (
      typeof promptId !== 'string' ||
      !promptPublished(promptId) ||
      !validText(modelName, 64) ||
      !validText(title, 120) ||
      !validText(notes, 800) ||
      !validText(filename, 120) ||
      /[\\/]/.test(filename) ||
      [...filename].some((char) => char.charCodeAt(0) < 32) ||
      !/\.(html|txt|md|zip)$/i.test(filename)
    )
      return res
        .status(400)
        .json({
          error:
            '请填写题目、具体模型、标题和测试说明，并选择 HTML、TXT、MD 或 ZIP 文件。',
        });
    // 断网/关页留下的未完成上传不能永久占满投稿名额；已提交原件从不自动清理。
    const expired = db
      .prepare(
        "SELECT * FROM submissions WHERE user_id = ? AND status = 'uploading' AND created_at < ?",
      )
      .all(req.user.id, Date.now() - 3600000);
    for (const draft of expired) {
      if (fs.existsSync(filePath(draft))) fs.unlinkSync(filePath(draft));
      db.prepare(
        "DELETE FROM submissions WHERE id = ? AND status = 'uploading'",
      ).run(draft.id);
    }
    const recent = db
      .prepare(
        'SELECT COUNT(*) AS n FROM submissions WHERE user_id = ? AND created_at > ?',
      )
      .get(req.user.id, Date.now() - 86400000).n;
    const pending = db
      .prepare(
        "SELECT COUNT(*) AS n FROM submissions WHERE user_id = ? AND status IN ('uploading','pending')",
      )
      .get(req.user.id).n;
    if (recent >= 10 || pending >= 5)
      return res
        .status(429)
        .json({ error: '待审投稿已达上限，请等审核后再提交。' });
    const id = randomUUID();
    db.prepare(
      'INSERT INTO submissions (id,user_id,prompt_id,model_name,title,notes,filename,created_at) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      id,
      req.user.id,
      promptId,
      modelName.trim(),
      title.trim(),
      notes.trim(),
      filename,
      Date.now(),
    );
    res.status(201).json({ id });
  });
  const uploadGuard = (req, res, next) => {
    const row = find(req, res);
    if (!row) return;
    if (row.user_id !== req.user.id || row.status !== 'uploading')
      return res
        .status(409)
        .json({ error: '这份投稿已经提交，请勿重复上传。' });
    if (!req.is('application/octet-stream'))
      return res.status(415).json({ error: '文件格式无效' });
    req.submission = row;
    next();
  };
  app.put(
    '/api/submissions/:id/file',
    requireUser,
    guardWrite,
    uploadGuard,
    express.raw({ type: 'application/octet-stream', limit: '20mb' }),
    (req, res) => {
      const row = req.submission;
      if (!Buffer.isBuffer(req.body) || !req.body.length)
        return res.status(400).json({ error: '文件不能为空。' });
      try {
        if (/\.zip$/i.test(row.filename)) inspectSubmissionZip(req.body);
        fs.writeFileSync(filePath(row), req.body, { flag: 'wx', mode: 0o600 });
        db.prepare(
          "UPDATE submissions SET size = ?, status = 'pending' WHERE id = ? AND status = 'uploading'",
        ).run(req.body.length, row.id);
        res.status(201).json({ submission: publicRow(select.get(row.id)) });
      } catch (error) {
        res
          .status(error.code === 'EEXIST' ? 409 : 400)
          .json({
            error: error.code ? '文件暂未接收，请重试。' : error.message,
          });
      }
    },
  );
  app.delete('/api/submissions/:id', requireUser, guardWrite, (req, res) => {
    const row = find(req, res);
    if (!row) return;
    if (row.user_id !== req.user.id || row.status !== 'uploading')
      return res.status(409).json({ error: '只能取消未上传完成的投稿。' });
    // 单文件，服务器生成的 UUID 路径；不接收客户端磁盘路径。
    if (fs.existsSync(filePath(row))) fs.unlinkSync(filePath(row));
    db.prepare(
      "DELETE FROM submissions WHERE id = ? AND status = 'uploading'",
    ).run(row.id);
    res.status(204).end();
  });
  app.get('/api/submissions/:id/file', requireUser, (req, res) => {
    const row = find(req, res);
    if (!row) return;
    if (!row.size || !fs.existsSync(filePath(row)))
      return res.status(404).json({ error: '文件不存在' });
    res
      .set('Content-Security-Policy', "default-src 'none'; sandbox")
      .set('X-Content-Type-Options', 'nosniff');
    res
      .type('application/octet-stream')
      .attachment(row.filename)
      .sendFile(filePath(row));
  });
  app.get('/api/admin/submissions', requireAdmin, (req, res) => {
    const status = String(req.query.status || 'pending');
    if (!['pending', 'approved', 'rejected'].includes(status))
      return res.status(400).json({ error: '状态无效' });
    const rows = db
      .prepare(
        'SELECT s.*, u.username FROM submissions s LEFT JOIN users u ON u.id=s.user_id WHERE s.status = ? ORDER BY s.created_at DESC LIMIT 100',
      )
      .all(status);
    res.json({
      submissions: rows.map((row) => ({
        ...publicRow(row),
        username: row.username ?? '已删除账号',
      })),
    });
  });
  app.post(
    '/api/admin/submissions/:id/review',
    requireAdmin,
    guardWrite,
    (req, res) => {
      const row = find(req, res);
      if (!row) return;
      const { action, note } = req.body ?? {};
      if (
        !['approve', 'reject'].includes(action) ||
        typeof note !== 'string' ||
        note.length > 800 ||
        note.includes('\0') ||
        (action === 'reject' && !note.trim())
      )
        return res
          .status(400)
          .json({ error: '请选择审核结果；拒绝时请填写原因。' });
      if (row.status !== 'pending')
        return res.status(409).json({ error: '这份投稿已经处理。' });
      let inboxName = null;
      let transferred = null;
      const stage = path.resolve(inboxDir, `.submission-${row.id}`);
      try {
        if (action === 'approve') {
          if (!promptPublished(row.prompt_id))
            return res
              .status(400)
              .json({ error: '题目已下架，请先恢复题目或退回投稿。' });
          const zip = /\.zip$/i.test(row.filename);
          inboxName = `submission-${row.id}${zip ? '' : path.extname(row.filename).toLowerCase()}`;
          const destination = path.resolve(inboxDir, inboxName);
          if (
            path.dirname(stage) !== path.resolve(inboxDir) ||
            path.dirname(destination) !== path.resolve(inboxDir)
          )
            throw new Error('暂存路径无效');
          if (fs.existsSync(destination))
            throw new Error('收件箱已有同名条目，请核对后重试。');
          if (zip) {
            fs.mkdirSync(stage);
            extractSubmissionZip(fs.readFileSync(filePath(row)), stage);
            fs.renameSync(stage, destination);
          } else
            fs.copyFileSync(
              filePath(row),
              destination,
              fs.constants.COPYFILE_EXCL,
            );
          transferred = destination;
        }
        db.prepare(
          'UPDATE submissions SET status=?, reviewed_at=?, reviewed_by=?, review_note=?, inbox_name=? WHERE id=?',
        ).run(
          action === 'approve' ? 'approved' : 'rejected',
          Date.now(),
          req.user.id,
          note.trim(),
          inboxName,
          row.id,
        );
        res.json({ submission: publicRow(select.get(row.id)) });
      } catch (error) {
        if (
          path.dirname(stage) === path.resolve(inboxDir) &&
          fs.existsSync(stage)
        )
          removeEntry(stage);
        if (
          transferred &&
          select.get(row.id)?.status === 'pending' &&
          path.dirname(transferred) === path.resolve(inboxDir)
        )
          removeEntry(transferred);
        res
          .status(400)
          .json({
            error: error.code ? '文件转入失败，请核对后重试。' : error.message,
          });
      }
    },
  );
}
