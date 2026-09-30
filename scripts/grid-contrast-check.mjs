// 网格佐证：量化「档案锁定」过场里 gt-lattice 网格线在截图中的实际对比度。
// 沿水平/垂直方向按 40px 周期取样，比较「落在网格线上的行/列」与「纸面行/列」的亮度差，
// 用来判断对照页与生产页面里网格是否真的画出来了、以及肉眼可见度差多少。
// 用法：node scripts/grid-contrast-check.mjs <png>...
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2))
        throw new Error(`unsupported PNG: depth=${bitDepth} color=${colorType}`);
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = x >= bpp && prev ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
      cur[x] = v;
    }
  }
  return { width, height, bpp, data: out };
}

// 在指定采样窗内，按周期 pitch 把行（或列）分成「线上」与「线外」两组，比较平均亮度
function gridContrast(img, { x0, x1, y0, y1, pitch, phase }) {
  const { width, bpp, data } = img;
  const lum = (x, y) => {
    const i = y * width * bpp + x * bpp;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  };
  const best = { onLine: 0, offLine: 0, delta: 0, bestPhase: 0 };
  for (let p = 0; p < pitch; p++) {
    let on = 0, onN = 0, off = 0, offN = 0;
    for (let y = y0; y < y1; y++) {
      const isLine = ((y + p) % pitch) === (phase ?? pitch - 1);
      for (let x = x0; x < x1; x++) {
        const v = lum(x, y);
        if (isLine) { on += v; onN++; } else { off += v; offN++; }
      }
    }
    const onAvg = on / onN, offAvg = off / offN;
    const delta = offAvg - onAvg; // 网格线更暗 → 正值
    if (delta > best.delta) {
      best.onLine = onAvg;
      best.offLine = offAvg;
      best.delta = delta;
      best.bestPhase = p;
    }
  }
  return best;
}

function uniqueColors(img, { x0, x1, y0, y1 }) {
  const { width, bpp, data } = img;
  const seen = new Map();
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const i = y * width * bpp + x * bpp;
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
}

const wins = {
  // 对照页：网格只在 .screen 预览盒内（约 x51-929 y265+），取盒内左上干净纸面
  review: { x0: 70, x1: 300, y0: 290, y1: 420 },
  // 生产页：全屏覆盖，取左上干净纸面（避开中央卡片）
  prod: { x0: 60, x1: 300, y0: 60, y1: 220 },
};

for (const arg of process.argv.slice(2)) {
  const [file, key] = arg.includes(':') ? arg.split(':') : [arg, 'prod'];
  const img = decodePng(readFileSync(file));
  const { width, height } = img;
  const win = wins[key] ?? wins.prod;
  const h = gridContrast(img, { ...win, pitch: 40, phase: 39 });
  const v = gridContrast(img, {
    x0: win.y0, x1: win.y1, y0: win.x0, y1: win.x1, pitch: 40, phase: 39,
  });
  console.log(`\n${file}  ${width}x${height}  采样窗 x[${win.x0},${win.x1}) y[${win.y0},${win.y1})`);
  console.log(`  横线：线上亮度=${h.onLine.toFixed(2)} 纸面=${h.offLine.toFixed(2)} 差=${h.delta.toFixed(2)} (相位 ${h.bestPhase})`);
  console.log(`  竖线：线上亮度=${v.onLine.toFixed(2)} 纸面=${v.offLine.toFixed(2)} 差=${v.delta.toFixed(2)} (相位 ${v.bestPhase})`);
  console.log(`  主色：${uniqueColors(img, win).map(([c, n]) => `rgb(${c})×${n}`).join('  ')}`);
}
