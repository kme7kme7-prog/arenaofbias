import QRCode from 'qrcode';

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
const ink = '#20352d',
  paper = '#f2f1e7',
  acid = '#dcfa48';
const graphemes = (value) =>
  Array.from(
    new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(value),
    (item) => item.segment,
  );
const widthOf = (text) =>
  graphemes(text).reduce((n, c) => n + (c.codePointAt(0) > 255 ? 1 : 0.57), 0);
function text(x, y, value, size = 24, fill = ink, weight = 500, extra = '') {
  return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" font-weight="${weight}" ${extra}>${escapeHtml(value)}</text>`;
}
function lines(value, units, limit = 3) {
  const out = [''];
  for (const c of graphemes(String(value).replace(/[\t\r ]+/g, ' '))) {
    if (c === '\n') {
      if (out.length < limit) out.push('');
      continue;
    }
    if (widthOf(out.at(-1) + c) > units) {
      if (out.length === limit) {
        out[out.length - 1] = out.at(-1).slice(0, -1) + '…';
        break;
      }
      out.push('');
    }
    out[out.length - 1] += c;
  }
  return out;
}
const paragraph = (x, y, value, units, size, fill = ink, limit = 3) =>
  lines(value, units, limit)
    .map((line, i) => text(x, y + i * size * 1.35, line, size, fill, 700))
    .join('');
function qr(url, x, y, size) {
  const { modules } = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const cell = size / (modules.size + 8);
  let path = '';
  for (let row = 0; row < modules.size; row++)
    for (let col = 0; col < modules.size; col++) {
      if (modules.get(row, col)) path += `M${col + 4} ${row + 4}h1v1h-1z`;
    }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${paper}"/><path d="${path}" fill="${ink}" shape-rendering="crispEdges" transform="translate(${x},${y}) scale(${cell})"/>`;
}
function brand(x, y, color = ink) {
  return (
    `<path d="M0 0h32l-4 9H-4zM-8 14h32l-4 9h-32zM0 28h32l-4 9H-4z" fill="${color}" transform="translate(${x},${y - 28})"/>` +
    text(x + 51, y, 'ARENA OF BIAS', 25, color, 800)
  );
}

// The work stays a complete 16:9 window. Labels and selection never cover artwork.
function workPanel(data, i, x, y, width, compact = false) {
  const height = (width * 9) / 16,
    color = i === 0 ? '#ff7c6c' : '#89c9d9';
  const chosen = data.pick === (i === 0 ? 'a' : 'b');
  const labelHeight = compact ? 48 : 64;
  let out = `<rect x="${x + 5}" y="${y + 5}" width="${width}" height="${height + labelHeight}" fill="${ink}"/><rect x="${x}" y="${y}" width="${width}" height="${height + labelHeight}" fill="${paper}" stroke="${ink}"/>`;
  if (data.thumbs?.[i])
    out += `<image href="${data.thumbs[i]}" x="${x}" y="${y}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
  else {
    out += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#e4e8de"/>`;
    out += text(
      x + 28,
      y + height / 2,
      i === 0 ? 'A' : 'B',
      65,
      '#a5b3a4',
      800,
    );
    out += text(x + 28, y + height / 2 + 40, '扫码查看完整作品', 19, '#637568');
  }
  const baseline = y + height + (compact ? 32 : 41);
  out += `<rect x="${x}" y="${y + height}" width="${width}" height="${labelHeight}" fill="${ink}"/><rect x="${x}" y="${y + height}" width="5" height="${labelHeight}" fill="${color}"/>`;
  out += text(
    x + 18,
    baseline,
    i === 0 ? 'A' : 'B',
    compact ? 22 : 27,
    color,
    800,
  );
  const name = data.names?.[i] ?? '未知模型';
  const badge = chosen ? '✓ 我的选择' : data.pick === 'draw' ? '难分高下' : '';
  const available = width - 76 - (badge ? (compact ? 104 : 142) : 16);
  const font = Math.min(
    compact ? 22 : 29,
    available / Math.max(1, widthOf(name)),
  );
  out += text(x + 54, baseline, name, font, paper, 700);
  if (badge)
    out += text(
      x + width - 18,
      baseline - 1,
      badge,
      compact ? 17 : 21,
      acid,
      700,
      'text-anchor="end"',
    );
  return out;
}

export function shareSvg(data, url, landscape = false) {
  const pair = data.type === 'duel' || (data.type === 'prompt' && data.pair);
  const w = landscape ? 1200 : 1080,
    h = landscape ? 630 : pair ? 1760 : 1600;
  const muted = '#718073';
  let body = `<rect width="${w}" height="${h}" fill="${paper}"/><rect x="24" y="24" width="${w - 48}" height="${h - 48}" fill="none" stroke="#c5cebe"/><path d="M24 65V24h41M${w - 65} ${h - 24}h41v-41" fill="none" stroke="${ink}" stroke-width="3"/>`;
  body += brand(65, 83);
  body += `<rect x="${w - 229}" y="51" width="165" height="36" fill="${acid}"/>`;
  body += text(
    w - 146,
    76,
    data.type === 'guess'
      ? '模一把 / DAILY'
      : data.type === 'duel'
        ? '直觉存档 / PICK'
        : '偏见试验场',
    17,
    ink,
    700,
    'text-anchor="middle"',
  );
  body += `<path d="M64 114H${w - 64}" stroke="#bcc8b7"/>`;
  if (pair) {
    body += text(
      64,
      159,
      `NO.${data.prompt.id}   /   ${data.type === 'duel' ? '身份已揭晓' : '同一道题 · 两种表达'}`,
      18,
      muted,
    );
    body += paragraph(
      61,
      landscape ? 212 : 217,
      data.prompt.name,
      landscape ? 31 : 22,
      landscape ? 38 : 48,
      ink,
      1,
    );
    if (landscape) {
      body += workPanel(data, 0, 64, 244, 520, true);
      body += workPanel(data, 1, 616, 244, 520, true);
    } else {
      body += text(
        64,
        260,
        data.pick === 'draw'
          ? '这一次，我选难分高下。'
          : data.pick
            ? '先看作品，再看名字。这是我的答案。'
            : '两份作品都在这里。你会选哪一份？',
        23,
        muted,
      );
      body += workPanel(data, 0, 64, 304, 952);
      body += workPanel(data, 1, 64, 934, 952);
    }
  } else if (data.type === 'guess') {
    body += text(64, 165, data.kicker, 20, muted);
    body += text(
      60,
      landscape ? 242 : 273,
      data.won ? '循着线索，猜中了。' : '谜底，终于揭晓。',
      landscape ? 52 : 64,
      ink,
      800,
    );
    body += `<rect x="64" y="${landscape ? 276 : 325}" width="${landscape ? 600 : 952}" height="${landscape ? 144 : 211}" fill="${ink}"/>`;
    body += text(91, landscape ? 311 : 373, '今日答案 / THE REVEAL', 18, acid);
    const name = data.answer ?? '答案暂不可用';
    body += text(
      88,
      landscape ? 374 : 460,
      name,
      Math.min(
        landscape ? 40 : 61,
        (landscape ? 540 : 890) / Math.max(1, widthOf(name)),
      ),
      paper,
      800,
    );
    const colors = { h: '#568565', n: '#d9d865', m: '#34483f', u: '#d8ddd4' };
    const size = landscape ? 30 : 73,
      gap = landscape ? 8 : 15;
    const startX = landscape ? 792 : 103,
      startY = landscape ? 188 : 651;
    if (!landscape) {
      body += text(64, 606, '推理轨迹', 26, ink, 700);
      body += text(
        1016,
        606,
        `${data.won ? data.rows.length : 'X'} / 08 次`,
        28,
        ink,
        700,
        'text-anchor="end"',
      );
      body += text(
        872,
        951,
        data.won ? data.rows.length : 'X',
        190,
        ink,
        800,
        'text-anchor="middle"',
      );
      body += text(
        872,
        1009,
        data.won ? '次揭晓' : '未猜中',
        23,
        muted,
        500,
        'text-anchor="middle"',
      );
    }
    for (let r = 0; r < 8; r++) {
      if (!landscape)
        body += text(
          65,
          startY + r * (size + gap) + 45,
          String(r + 1).padStart(2, '0'),
          18,
          muted,
        );
      for (let col = 0; col < 7; col++) {
        const state = data.rows[r]?.[col],
          x = startX + col * (size + gap),
          y = startY + r * (size + gap);
        body += `<rect x="${x}" y="${y}" width="${size}" height="${size}" fill="${state ? colors[state] : 'none'}" stroke="${state ? colors[state] : '#ced6c5'}"/>`;
        if (state === 'h')
          body += `<path d="m${x + size * 0.28} ${y + size * 0.51} ${size * 0.16} ${size * 0.16} ${size * 0.3} ${-size * 0.34}" fill="none" stroke="${paper}" stroke-width="${landscape ? 2 : 4}"/>`;
        if (state === 'n')
          body += text(
            x + size / 2,
            y + size * 0.71,
            '≈',
            size * 0.66,
            ink,
            600,
            'text-anchor="middle"',
          );
      }
    }
    if (!landscape)
      body += text(
        64,
        1405,
        '✓ 命中    ≈ 接近    墨色未中    浅色未知',
        21,
        muted,
      );
    else
      body += text(
        64,
        470,
        `${data.won ? data.rows.length : 'X'} / 8 次机会  ·  七条线索，一个名字。`,
        23,
        muted,
      );
  } else {
    body += text(64, landscape ? 165 : 192, data.kicker, 19, muted);
    body += paragraph(
      60,
      landscape ? 275 : 359,
      data.headline,
      12,
      landscape ? 67 : 90,
      ink,
      2,
    );
    body += paragraph(
      64,
      landscape ? 470 : 657,
      data.subtitle,
      landscape ? 27 : 25,
      30,
      muted,
      3,
    );
    const x = landscape ? 849 : 180,
      y = landscape ? 246 : 909;
    body += `<rect x="${x + 8}" y="${y + 8}" width="${landscape ? 220 : 720}" height="${landscape ? 220 : 330}" fill="${ink}"/><rect x="${x}" y="${y}" width="${landscape ? 220 : 720}" height="${landscape ? 220 : 330}" fill="${acid}"/>`;
    body += text(
      x + (landscape ? 110 : 360),
      y + (landscape ? 158 : 213),
      landscape ? '↗' : 'A  /  B',
      landscape ? 138 : 169,
      ink,
      800,
      'text-anchor="middle"',
    );
    if (!landscape)
      body += text(64, 1380, 'AI 负责想象。你负责喜欢。', 29, ink, 700);
  }
  if (landscape) {
    if (!pair)
      body += text(64, 581, '偏见试验场 · 你的判断，值得留一份。', 19, muted);
  } else {
    // Artwork panels end at 1534; pair cards use a taller edition to preserve the full frame.
    const footer = pair ? 1580 : 1430;
    body += `<path d="M64 ${footer}H1016" stroke="#bac7b6"/>`;
    body += qr(url, 892, footer + 13, 124);
    body += text(
      64,
      footer + 50,
      data.type === 'guess'
        ? '这就是我今天的答案。'
        : pair
          ? '这是我的偏好。你的呢？'
          : '不看名字，你会选谁？',
      28,
      ink,
      700,
    );
    body += text(64, footer + 87, '扫码打开 · ARENA OF BIAS', 18, muted);
    body += text(
      64,
      footer + 126,
      data.type === 'duel'
        ? '个人选择分享 / 不代表模型能力定论'
        : data.type === 'guess'
          ? '个人挑战记录 / 含当日模型答案'
          : '先看作品，再揭晓名字。',
      15,
      muted,
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Noto Sans SC">${body}</svg>`;
}
