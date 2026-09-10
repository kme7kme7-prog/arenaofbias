// 像素佐证：统计截图中墨色(--ink #1c2423)与酸黄(--acid #d9fb51)占比，
// 以及左右半屏的平均亮度——用于确认横扫过渡的盖满/退场/终态三帧。
// 用法：node scripts/wipe-pixel-check.mjs <png>...
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

const near = (r, g, b, tr, tg, tb, tol) =>
  Math.abs(r - tr) <= tol && Math.abs(g - tg) <= tol && Math.abs(b - tb) <= tol;

for (const file of process.argv.slice(2)) {
  const { width, height, bpp, data } = decodePng(readFileSync(file));
  let ink = 0, acid = 0;
  const lum = { left: [0, 0], right: [0, 0] };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width * bpp + x * bpp;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (near(r, g, b, 0x1c, 0x24, 0x23, 12)) ink++;
      if (near(r, g, b, 0xd9, 0xfb, 0x51, 40)) acid++;
      const half = x < width / 2 ? lum.left : lum.right;
      half[0] += 0.299 * r + 0.587 * g + 0.114 * b;
      half[1]++;
    }
  }
  const total = width * height;
  const pct = (n) => ((n / total) * 100).toFixed(1) + '%';
  console.log(
    `${file} ${width}x${height} | ink=${pct(ink)} acid=${pct(acid)} | ` +
      `左半屏亮度=${(lum.left[0] / lum.left[1]).toFixed(0)} 右半屏亮度=${(lum.right[0] / lum.right[1]).toFixed(0)}`,
  );
}
