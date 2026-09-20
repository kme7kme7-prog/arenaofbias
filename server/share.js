import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { escapeHtml as e } from './share-card.js';

const site = {
  home: [
    '不看名字，\n你会选谁？',
    '两份 AI 作品，一个属于你的答案。先看作品，凭直觉选择，再揭晓模型身份。',
    '#home',
  ],
  prompts: [
    '好题，值得\n一起玩。',
    '从鹈鹕骑车到山中巨城，发现 AI 的另一面。',
    '#prompts',
  ],
  rank: [
    '偏好不同，\n答案不同。',
    '看看大家更喜欢哪些 AI 的作品，也来留下你的选择。',
    '#rank',
  ],
  guess: [
    '把它的名字，\n猜出来。',
    '七条线索，八次机会。每天一个 AI 模型，等你揭晓。',
    '#guess',
  ],
  play: [
    '凭直觉，\n来一场。',
    '选作品、猜模型。在偏见试验场，找到你的答案。',
    '#play',
  ],
  event: [
    '让好作品，\n碰个面。',
    '来偏见试验场，发现有趣的 AI 作品。',
    '#event',
  ],
};

export function resolveShare(query, db) {
  const params = new URLSearchParams();
  const type = query.type || 'site';
  params.set('type', type);
  const loadPair = (promptId, a, b) => {
    if (
      ![a, b].every((v) => typeof v === 'string' && v.length > 0 && v.length <= 200) ||
      a === b
    )
      return null;
    const select = db.prepare(
      'SELECT id, model_name, model_id, is_demo FROM works WHERE id=? AND prompt_id=? AND published=1',
    );
    const works = [select.get(a, promptId), select.get(b, promptId)];
    if (works.some((w) => !w) || works[0].model_id === works[1].model_id)
      return null;
    return works;
  };
  if (type === 'duel' || type === 'prompt') {
    if (typeof query.prompt !== 'string' || !/^\d{3}$/.test(query.prompt))
      return null;
    const prompt = db
      .prepare(
        'SELECT id, name, prompt FROM prompts WHERE id=? AND published=1',
      )
      .get(query.prompt);
    if (!prompt) return null;
    params.set('prompt', prompt.id);
    if (type === 'prompt') {
      const data = {
        type,
        prompt,
        params,
        kicker: `PROMPT / ${prompt.id}`,
        headline: prompt.name,
        subtitle: prompt.prompt,
        target: `/#arena/${prompt.id}`,
        title: `${prompt.name} · 偏见试验场`,
      };
      // 决策 107：竞技场分享带上当前对局时，卡片嵌这两件作品的缩略图、
      // 链接固定回同一对；a/b 缺失或非法就退回通用题卡，不 404。
      const works = loadPair(prompt.id, query.a, query.b);
      if (works) {
        params.set('a', query.a);
        params.set('b', query.b);
        data.pair = [query.a, query.b];
        data.target = `/?duel=${encodeURIComponent(JSON.stringify([prompt.id, query.a, query.b]))}#arena/${prompt.id}`;
      }
      return data;
    }
    const works = loadPair(prompt.id, query.a, query.b);
    if (!works || !['a', 'b', 'draw'].includes(query.pick)) return null;
    params.set('a', query.a);
    params.set('b', query.b);
    params.set('pick', query.pick);
    const names = works.map((w) => w.model_name);
    const headline =
      query.pick === 'draw'
        ? '这一次，\n难分高下。'
        : '名字揭晓，\n直觉有了回响。';
    return {
      type,
      prompt,
      names,
      pick: query.pick,
      demo: works.some((w) => w.is_demo),
      params,
      kicker: 'MY CHOICE / 我的直觉',
      headline,
      subtitle: `${prompt.name} · ${query.pick === 'draw' ? '我选了难分高下' : `我选择了 ${names[query.pick === 'a' ? 0 : 1]}`}`,
      title: `${prompt.name}：这是我的选择，你呢？`,
      target: `/?duel=${encodeURIComponent(JSON.stringify([prompt.id, query.a, query.b]))}#arena/${prompt.id}`,
    };
  }
  if (type === 'guess') {
    const day = query.day;
    if (
      typeof day !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
      !Number.isFinite(Date.parse(day)) ||
      new Date(day).toISOString().slice(0, 10) !== day
    )
      return null;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (
      day < '2026-09-13' ||
      day > today ||
      !['0', '1'].includes(query.won) ||
      typeof query.grid !== 'string' ||
      !/^[hnmu]{7}(\.[hnmu]{7}){0,7}$/.test(query.grid)
    )
      return null;
    const rows = query.grid.split('.'),
      won = query.won === '1';
    // These are personal records, not server-certified scores. Never accept model names or IDs.
    params.set('day', day);
    params.set('won', query.won);
    params.set('grid', query.grid);
    const number = Math.round(
      (Date.parse(day) - Date.parse('2026-09-13')) / 86400000,
    );
    return {
      type,
      day,
      rows,
      won,
      params,
      kicker: `模一把 / #${String(number).padStart(3, '0')} / ${day}`,
      headline: won ? '猜中了。\n凭的是线索。' : '没猜中，\n也有下一局。',
      subtitle: `${day} · ${won ? rows.length : 'X'}/8 · 七条线索，八次机会，不剧透答案。`,
      title: `模一把 #${number} · ${won ? rows.length : 'X'}/8，你能用几次？`,
      target: '/#guess',
      historical: day !== today,
    };
  }
  if (type !== 'site') return null;
  const page =
    typeof query.page === 'string' && Object.hasOwn(site, query.page)
      ? query.page
      : 'home';
  params.set('page', page);
  const [headline, subtitle, target] = site[page];
  return {
    type,
    params,
    kicker: 'THE HUMAN CHOICE / 偏见试验场',
    headline,
    subtitle,
    title: `${headline.replaceAll('\n', '')} · 偏见试验场`,
    target: `/${target}`,
  };
}

function originOf(req) {
  const url = new URL(
    process.env.APP_ORIGIN || `${req.protocol}://${req.get('host')}`,
  );
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('APP_ORIGIN must be HTTP(S)');
  return url.origin;
}
export function shareMeta(data, origin) {
  const query = data.params.toString();
  return {
    url: `${origin}/share?${query}`,
    image: `${origin}/share/card.png?${query}`,
    og: `${origin}/share/og.png?${query}`,
    title: data.title,
    description: data.subtitle,
  };
}
export function metaTags(meta) {
  return `<meta property="og:type" content="website"><meta property="og:site_name" content="偏见试验场 ARENA OF BIAS"><meta property="og:locale" content="zh_CN"><meta property="og:title" content="${e(meta.title)}"><meta property="og:description" content="${e(meta.description)}"><meta property="og:url" content="${e(meta.url)}"><meta property="og:image" content="${e(meta.og)}"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${e(meta.title)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${e(meta.title)}"><meta name="twitter:description" content="${e(meta.description)}"><meta name="twitter:image" content="${e(meta.og)}"><link rel="canonical" href="${e(meta.url)}">`;
}

// Serial worker + bounded cache: image rendering must not block votes or grow without limit.
function imageRenderer() {
  let worker,
    active = false;
  const queue = [],
    pending = new Map(),
    cache = new Map();
  let bytes = 0;
  function pump() {
    if (active || !queue.length) return;
    if (!worker) {
      worker = new Worker(new URL('./share-worker.js', import.meta.url));
      worker.unref();
    }
    active = true;
    const job = queue.shift();
    const finish = (error, value) => {
      clearTimeout(timer);
      worker?.removeAllListeners('message');
      worker?.removeAllListeners('error');
      active = false;
      pending.delete(job.key);
      if (error) {
        worker?.terminate();
        worker = null;
        job.reject(error);
      } else {
        const buffer = Buffer.from(value);
        cache.set(job.key, buffer);
        bytes += buffer.length;
        while (cache.size > 48 || bytes > 24 * 1024 * 1024) {
          const key = cache.keys().next().value;
          bytes -= cache.get(key).length;
          cache.delete(key);
        }
        job.resolve(buffer);
      }
      pump();
    };
    const timer = setTimeout(() => finish(new Error('图片生成超时')), 15000);
    worker.once('message', (message) =>
      message.error
        ? finish(new Error(message.error))
        : finish(null, message.png),
    );
    worker.once('error', (error) => finish(error));
    try {
      worker.postMessage(job.payload);
    } catch (error) {
      finish(error);
    }
  }
  return (key, payload) => {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    if (queue.length >= 12)
      return Promise.reject(new Error('图片生成繁忙，请稍后重试'));
    const promise = new Promise((resolve, reject) => {
      queue.push({ key, payload, resolve, reject });
    });
    pending.set(key, promise);
    pump();
    return promise;
  };
}

export function installShare(app, db, distDir, thumbsDir = '') {
  const render = imageRenderer();
  // 缩略图由 scripts/make-work-thumbs.mjs 离线生成（决策 107），按作品 id 落盘；
  // 缺图的作品回落通用色块卡。mtime 缓存避免每次渲染都读盘 base64。
  const thumbCache = new Map();
  function thumbDataUri(id) {
    if (!thumbsDir || !/^[\w.-]+$/.test(id)) return null;
    const file = path.join(thumbsDir, `${id}.png`);
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      return null;
    }
    const hit = thumbCache.get(id);
    if (hit && hit.mtime === stat.mtimeMs) return hit.uri;
    const uri = `data:image/png;base64,${fs.readFileSync(file).toString('base64')}`;
    if (thumbCache.size > 64) thumbCache.clear();
    thumbCache.set(id, { mtime: stat.mtimeMs, uri });
    return uri;
  }
  function resolve(req, res) {
    const data = resolveShare(req.query, db);
    if (!data) {
      res
        .status(404)
        .set('Cache-Control', 'no-store')
        .type('html')
        .send(
          '<!doctype html><meta charset="utf-8"><title>分享暂不可用</title><h1>这张分享暂不可用</h1><p>题目或作品可能已经下架，或链接不完整。</p><a href="/#prompts">回到提示词库</a>',
        );
      return null;
    }
    return data;
  }
  app.get('/api/share', (req, res) => {
    const data = resolve(req, res);
    if (!data) return;
    res.set('Cache-Control', 'no-store').json(shareMeta(data, originOf(req)));
  });
  app.get(['/share/card.png', '/share/og.png'], async (req, res, next) => {
    try {
      const data = resolve(req, res);
      if (!data) return;
      if (data.pair) {
        const thumbs = data.pair.map(thumbDataUri);
        if (thumbs.every(Boolean)) data.thumbs = thumbs;
      }
      const meta = shareMeta(data, originOf(req));
      const landscape = req.path.endsWith('og.png');
      const png = await render(JSON.stringify([data, meta.url, landscape]), {
        data: { ...data, params: undefined },
        url: meta.url,
        landscape,
      });
      res
        .set('Cache-Control', 'no-cache')
        .set('X-Content-Type-Options', 'nosniff');
      if (req.query.download === '1')
        res.set(
          'Content-Disposition',
          `attachment; filename="arena-of-bias-${data.type}.png"`,
        );
      res.type('png').send(png);
    } catch (error) {
      next(error);
    }
  });
  app.get('/share', (req, res) => {
    const data = resolve(req, res);
    if (!data) return;
    const meta = shareMeta(data, originOf(req));
    const action =
      data.type === 'guess'
        ? data.historical
          ? '挑战今天的模型'
          : '我也来猜今天的模型'
        : data.type === 'duel'
          ? '看看这两份作品'
          : '凭直觉，来一场';
    res
      .set('Cache-Control', 'no-cache')
      .set('Referrer-Policy', 'same-origin')
      .set(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
      )
      .type('html')
      .send(
        `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#20352d"><title>${e(meta.title)}</title><meta name="description" content="${e(meta.description)}">${metaTags(meta)}<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/share-assets/page.css"><script src="/share-assets/page.js" defer></script></head><body><header><a href="/#home">ARENA OF <b>BIAS</b></a><span>一张卡片，一份自己的答案。</span></header><main><div class="poster"><img src="${e(meta.image)}" width="1080" height="1350" alt="${e(meta.title)}" id="card"></div><section><p class="eyebrow">${e(data.kicker)}</p><h1>${e(data.headline).replaceAll('\n', '<br>')}</h1><p class="description">${e(data.subtitle)}</p>${data.type === 'duel' ? '<p class="note">这是分享者的个人选择。打开后可观看同一对作品，再留下你自己的判断。</p>' : data.type === 'guess' ? `<p class="note">卡片不含答案。${data.historical ? '这是往期挑战记录，入口会进入今天的新题。' : '七条线索，从第一步开始推理。'}</p>` : ''}<a class="primary" href="${e(data.target)}">${action}<span>↗</span></a><div class="actions"><a href="${e(meta.image)}&amp;download=1" download>保存图片 ↓</a><button id="copy">复制链接 ↗</button><button id="native" hidden>系统分享</button></div><p class="note">手机可长按图片保存，或使用系统分享。</p><label class="manual" hidden>长按复制链接<input readonly value="${e(meta.url)}"></label><p id="status" role="status" aria-live="polite"></p></section></main><footer><span>AI 负责想象。你负责喜欢。</span><a href="/#prompts">探索更多题目 ↗</a></footer></body></html>`,
      );
  });
  // Hash routes share a document, so a pasted legacy URL gets the site card.
  app.get(['/', '/index.html'], (req, res, next) => {
    const entry = path.join(distDir, 'index.html');
    if (!fs.existsSync(entry)) return next();
    const data = resolveShare({}, db),
      origin = originOf(req);
    const meta = { ...shareMeta(data, origin), url: origin + '/' };
    const html = fs
      .readFileSync(entry, 'utf8')
      .replace('<!-- social-meta -->', metaTags(meta));
    res.set('Cache-Control', 'no-cache').type('html').send(html);
  });
}
