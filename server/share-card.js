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

/** Same vector composition supplies the downloadable PNG and crawler preview. No work iframe is captured. */
export function shareSvg(data, url, landscape = false) {
  const w = landscape ? 1200 : 1080,
    h = landscape ? 630 : 1350;
  let body = `<rect width="${w}" height="${h}" fill="${ink}"/><path d="M0 0H${w}V${h - 35}L${w - 35} ${h}H0Z" fill="${paper}"/>`;
  body +=
    `<rect x="48" y="40" width="${w - 96}" height="64" fill="${acid}"/>` +
    brand(78, 82);
  body += text(
    w - 75,
    80,
    data.type === 'guess'
      ? 'DAILY / 模一把'
      : data.type === 'duel'
        ? 'REVEALED / 直觉存档'
        : 'THE HUMAN CHOICE',
    18,
    ink,
    600,
    'text-anchor="end"',
  );
  if (landscape) {
    body += text(64, 164, data.kicker, 20, '#647669', 600);
    body += paragraph(60, 268, data.headline, 10, 68, ink, 2);
    body += paragraph(64, 464, data.subtitle, 35, 27, ink, 2);
    body += `<path d="M800 185h270v270H800z" fill="${ink}"/><path d="M780 165h270v270H780z" fill="${acid}"/>`;
    body += text(
      915,
      355,
      data.type === 'guess'
        ? `${data.won ? data.rows.length : 'X'}/8`
        : data.type === 'duel'
          ? data.pick === 'draw'
            ? '='
            : data.pick.toUpperCase()
          : '↗',
      data.type === 'guess' ? 92 : 170,
      ink,
      900,
      'text-anchor="middle"',
    );
    body +=
      text(64, 572, '先看作品，再揭晓名字。', 23, ink, 600) +
      text(1130, 572, '偏见试验场 ↗', 22, ink, 700, 'text-anchor="end"');
  } else {
    body += text(65, 169, data.kicker, 21, '#637568', 600);
    body += paragraph(60, 278, data.headline, 12, 78, ink, 2);
    body += `<path d="M65 411H1015" stroke="${ink}" stroke-width="2"/>`;
    if (data.type === 'duel') {
      body += text(65, 460, `本轮命题 / ${data.prompt.id}`, 21, '#637568');
      body += paragraph(65, 508, data.prompt.name, 24, 35, ink, 2);
      for (let i = 0; i < 2; i++) {
        const y = 609 + i * 194,
          chosen = data.pick === (i === 0 ? 'a' : 'b');
        body += `<rect x="76" y="${y + 10}" width="928" height="160" fill="${ink}"/><rect x="65" y="${y}" width="928" height="160" fill="${chosen ? acid : '#e2e6dc'}" stroke="${ink}" stroke-width="2"/><rect x="65" y="${y}" width="7" height="160" fill="${i === 0 ? '#ff7c6c' : '#89c9d9'}"/>`;
        body += text(92, y + 51, i === 0 ? 'A' : 'B', 36, ink, 800);
        body += text(
          958,
          y + 40,
          chosen
            ? '✓ 我的选择'
            : data.pick === 'draw'
              ? '难分高下'
              : '另一份答案',
          20,
          ink,
          600,
          'text-anchor="end"',
        );
        const modelName = data.names[i].replace(/\s+/g, ' ');
        const modelUnits = Math.max(28, Math.ceil(widthOf(modelName) / 2) + 1);
        body += paragraph(
          153,
          y + (widthOf(modelName) > modelUnits ? 74 : 91),
          modelName,
          modelUnits,
          Math.min(36, 760 / modelUnits),
          ink,
          2,
        );
        body += text(
          153,
          y + 136,
          'MODEL / ' + (data.demo ? '演示身份' : '身份已揭晓'),
          16,
          '#637568',
        );
      }
      body += text(65, 1036, '这是我的偏好。你的呢？', 30, ink, 700);
    } else if (data.type === 'guess') {
      body += text(
        65,
        468,
        data.won
          ? `${data.rows.length} 次，猜出了它的名字。`
          : '今天的谜底，有点难。',
        32,
        ink,
        700,
      );
      const colors = { h: '#568565', n: '#d9d865', m: '#34483f', u: '#d8ddd4' };
      const size = 49,
        gap = 12,
        x = 91,
        y = 519;
      data.rows.forEach((row, r) => {
        body += text(
          66,
          y + r * 62 + 32,
          String(r + 1),
          16,
          '#637568',
          500,
          'text-anchor="end"',
        );
        [...row].forEach((state, col) => {
          body += `<rect x="${x + col * (size + gap)}" y="${y + r * 62}" width="${size}" height="${size}" fill="${colors[state]}"/>`;
          if (state === 'h')
            body += `<path d="m${x + col * (size + gap) + 16} ${y + r * 62 + 25} 6 6 12-14" fill="none" stroke="${paper}" stroke-width="3"/>`;
          if (state === 'n')
            body += text(
              x + col * (size + gap) + 25,
              y + r * 62 + 34,
              '≈',
              29,
              ink,
              500,
              'text-anchor="middle"',
            );
        });
      });
      for (let r = data.rows.length; r < 8; r++) {
        body += text(
          66,
          y + r * 62 + 32,
          String(r + 1),
          16,
          '#b9c2b1',
          500,
          'text-anchor="end"',
        );
        for (let col = 0; col < 7; col++)
          body += `<rect x="${x + col * (size + gap)}" y="${y + r * 62}" width="${size}" height="${size}" fill="none" stroke="#d8ded0" stroke-width="1.5"/>`;
      }
      body +=
        text(
          942,
          712,
          data.won ? data.rows.length : 'X',
          230,
          ink,
          900,
          'text-anchor="end"',
        ) +
        text(934, 773, '/ 08 次机会', 25, '#637568', 600, 'text-anchor="end"');
      body +=
        text(580, 917, '保留谜底。', 37, ink, 700) +
        text(580, 972, '把挑战留给你。', 37, ink, 700);
      body += text(
        65,
        1061,
        '✓ 命中   ≈ 接近   深色未中   浅色未知',
        20,
        '#637568',
      );
    } else {
      body += paragraph(65, 500, data.subtitle, 25, 31, '#637568', 3);
      if (data.thumbs) {
        // 决策 107：嵌正在对比的两件作品截图（16:9 源图 slice 居中裁），
        // 墨边与硬投影照旧，A/B 缩成左上角标。
        for (let i = 0; i < 2; i++) {
          const x = i === 0 ? 72 : 562,
            y = i === 0 ? 672 : 700;
          body += `<rect x="${x + 18}" y="${y + 18}" width="417" height="292" fill="${ink}"/>`;
          body += `<image href="${data.thumbs[i]}" x="${x}" y="${y}" width="417" height="292" preserveAspectRatio="xMidYMid slice"/>`;
          body += `<rect x="${x}" y="${y}" width="417" height="292" fill="none" stroke="${ink}" stroke-width="2"/>`;
          body += `<rect x="${x + 10}" y="${y + 10}" width="34" height="34" fill="${ink}"/>`;
          body += text(
            x + 27,
            y + 35,
            i === 0 ? 'A' : 'B',
            24,
            paper,
            800,
            'text-anchor="middle"',
          );
        }
      } else {
        body += `<rect x="90" y="690" width="417" height="292" fill="${ink}"/><rect x="72" y="672" width="417" height="292" fill="#ff7c6c" stroke="${ink}" stroke-width="2"/><rect x="580" y="718" width="417" height="292" fill="${ink}"/><rect x="562" y="700" width="417" height="292" fill="#89c9d9" stroke="${ink}" stroke-width="2"/>`;
        body +=
          text(106, 902, 'A', 228, ink, 900) + text(600, 930, 'B', 228, ink, 900);
      }
      body += text(
        65,
        1061,
        '同一道题，两份作品，一个属于你的答案。',
        25,
        ink,
        600,
      );
    }
    body += `<path d="M65 1100H1015" stroke="${ink}" stroke-width="2"/>`;
    body += qr(url, 813, 1125, 185);
    body += text(
      65,
      1161,
      data.type === 'guess' ? '你能用几次猜出来？' : '不看名字，你会选谁？',
      32,
      ink,
      800,
    );
    body += text(65, 1210, '扫码打开 · 偏见试验场', 22, '#637568');
    body += text(
      65,
      1281,
      data.type === 'duel'
        ? '个人选择分享 / 不代表模型能力定论'
        : data.type === 'guess'
          ? '个人挑战记录 / 不含模型答案'
          : 'AI 负责想象。你负责喜欢。',
      17,
      '#637568',
    );
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Noto Sans SC" >${body}</svg>`;
}
