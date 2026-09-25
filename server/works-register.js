// 作品登记核心（决策 043/044）：CLI 脚本（scripts/register-works.mjs）与后台收件箱
// （server/index.js）共用的文件名解析、模型 id、作品 id 生成、文件搬运与入库逻辑。
// 只此一份，不写两份；数据库句柄由调用方传入，路由、鉴权与请求校验不归这里管。

import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

// 模型 id：小写 slug；原文含非可打印 ASCII（中文模型名等）或 slug 为空时掺短哈希，
// 保证「gpt-6-astra-降智」不会和「gpt-6-astra」塌成同一个模型。
export const slug = (value) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '');

export const hash5 = (value) => {
  let h = 5381;
  for (let i = 0; i < value.length; i++)
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36).padStart(7, '0').slice(0, 5);
};

export const modelIdOf = (raw) => {
  const base = slug(raw);
  if (/[^\x21-\x7e]/.test(raw) || !base) return `${base || 'model'}-${hash5(raw)}`;
  return base;
};

// 解析「标题，模型名」的文件名主干 → { title, model }。
// 全角逗号分隔；缺逗号时按结尾的 ASCII 段回退；「普通-」之类分类前缀剥掉。
export const parseWorkFilename = (stem) => {
  const commaIndex = stem.lastIndexOf('，');
  if (commaIndex > 0)
    return {
      title: stem.slice(0, commaIndex).replace(/^[^-]-/, '').replace(/^普通-/, ''),
      model: stem.slice(commaIndex + 1),
    };
  const match = stem.match(/([A-Za-z][A-Za-z0-9._-]*)$/);
  if (!match) return { title: stem.replace(/^普通-/, ''), model: 'unknown' };
  return {
    title: stem.slice(0, match.index).replace(/^普通-/, ''),
    model: match[1],
  };
};

// 本机 Windows 上 rmSync 对非 ASCII 路径会静默失败甚至崩进程（2026-09-25 实测，
// unlinkSync/rmdirSync 正常）——删除一律走这里：文件 unlink、目录递归后 rmdir
export function removeEntry(target) {
  if (lstatSync(target).isDirectory()) {
    for (const child of readdirSync(target))
      removeEntry(path.join(target, child));
    rmdirSync(target);
  } else {
    unlinkSync(target);
  }
}

// 递归复制——本机 Windows 上 cpSync/rmSync 对非 ASCII 路径会静默崩进程
// （2026-09-25 实测 exit 127 / 0xC0000409），只有单文件原语安全
// （copyFileSync/renameSync/unlinkSync/readdirSync 实测正常），手工递归
export function copyTree(from, to) {
  const stats = lstatSync(from);
  if (stats.isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const child of readdirSync(from))
      copyTree(path.join(from, child), path.join(to, child));
    return;
  }
  copyFileSync(from, to);
}

// 把源文件/目录放到目标位置。copy 模式只收单文件（登记脚本：原件不动）；
// move 模式（收件箱登记：登记即搬走）优先 rename（同盘瞬时），跨盘 EXDEV 或
// Windows 文件被占用（EPERM/EBUSY，dev watcher/杀毒常驻句柄，2026-09-25 实测）
// 退化为复制+删除；目录整树搬运。
export function transferPath(from, to, { move = false } = {}) {
  mkdirSync(path.dirname(to), { recursive: true });
  if (!move) {
    copyFileSync(from, to);
    return;
  }
  try {
    renameSync(from, to);
  } catch (error) {
    if (error?.code !== 'EXDEV' && error?.code !== 'EPERM' && error?.code !== 'EBUSY')
      throw error;
    if (statSync(from).isDirectory()) {
      copyTree(from, to);
      try {
        removeEntry(from);
      } catch {
        // 复制已成功；源残留多半是句柄占用，收件箱清单里还能删
      }
    } else {
      copyFileSync(from, to);
      try {
        unlinkSync(from);
      } catch {
        // 同上：源文件残留不影响登记
      }
    }
  }
}

// 生成下一个未占用的作品 id：`<题号>-<模型id>`，被占用则追加 -2、-3……
// 「占用」以 works 表为准，同时避开磁盘上的同名遗留文件/目录（库和文件都要让路）。
export function nextFreeWorkId({ db, worksDir, promptId, modelId }) {
  const taken = db.prepare('SELECT 1 FROM works WHERE id = ?');
  const free = (id) =>
    !taken.get(id) &&
    !existsSync(path.join(worksDir, promptId, id)) &&
    !existsSync(path.join(worksDir, promptId, `${id}.html`));
  const base = `${promptId}-${modelId}`;
  if (free(base)) return base;
  for (let nth = 2; ; nth++) if (free(`${base}-${nth}`)) return `${base}-${nth}`;
}

// 作品落库（登记的作品一律 is_demo = 0；published 由调用方定——
// 脚本默认发布，收件箱默认草稿）。
export function insertWork(db, work) {
  return db
    .prepare(
      `INSERT INTO works (id, prompt_id, model_id, model_name, title, is_demo, content, published, created_at)
       VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`,
    )
    .run(
      work.id,
      work.promptId,
      work.modelId,
      work.modelName,
      work.title,
      JSON.stringify(work.content),
      work.published ? 1 : 0,
      Date.now(),
    );
}
