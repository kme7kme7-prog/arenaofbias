import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const allowed = new Set([
  '.html',
  '.css',
  '.js',
  '.mjs',
  '.json',
  '.svg',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.mp3',
  '.mp4',
  '.ogg',
  '.wav',
  '.glb',
  '.gltf',
  '.bin',
  '.wasm',
  '.txt',
  '.md',
]);
const fail = () => {
  throw new Error(
    'ZIP 格式不支持或包含不安全路径；请上传含 index.html 的静态网页包。',
  );
};
const crcTable = Array.from({ length: 256 }, (_, i) => {
  let crc = i;
  for (let n = 0; n < 8; n++)
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

/** 审核前只读中央目录，不解压、不执行；限定静态包、体积、路径与文件数。 */
export function inspectSubmissionZip(bytes) {
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0) fail();
  const count = bytes.readUInt16LE(end + 10);
  const start = bytes.readUInt32LE(end + 16);
  if (
    bytes.readUInt16LE(end + 4) ||
    bytes.readUInt16LE(end + 6) ||
    bytes.readUInt16LE(end + 8) !== count ||
    !count ||
    count > 1000 ||
    start + bytes.readUInt32LE(end + 12) !== end
  )
    fail();
  const files = [],
    seen = new Set();
  let offset = start,
    total = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > end || bytes.readUInt32LE(offset) !== 0x02014b50) fail();
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20),
      size = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28),
      extra = bytes.readUInt16LE(offset + 30),
      comment = bytes.readUInt16LE(offset + 32);
    const attrs = bytes.readUInt32LE(offset + 38),
      local = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extra + comment;
    if (
      next > end ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      ((attrs >>> 16) & 0xf000) === 0xa000 ||
      bytes.readUInt16LE(offset + 34) !== 0 ||
      compressed === 0xffffffff ||
      size === 0xffffffff
    )
      fail();
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString('utf8')
      .replaceAll('\\', '/');
    const directory = name.endsWith('/');
    const clean = directory ? name.slice(0, -1) : name;
    if (
      !clean ||
      clean.length > 220 ||
      clean.startsWith('/') ||
      /[:%<>"|?*]/.test(clean) ||
      [...clean].some((char) => char.charCodeAt(0) < 32) ||
      clean
        .split('/')
        .some(
          (part) =>
            !part ||
            part.startsWith('.') ||
            part === 'node_modules' ||
            /[. ]$/.test(part) ||
            /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part),
        )
    )
      fail();
    if (seen.has(clean.toLowerCase())) fail();
    seen.add(clean.toLowerCase());
    if (!directory) {
      if (
        !allowed.has(path.posix.extname(clean).toLowerCase()) ||
        size > 20 * 1024 * 1024
      )
        fail();
      total += size;
      if (total > 80 * 1024 * 1024) fail();
      if (local + 30 > start || bytes.readUInt32LE(local) !== 0x04034b50)
        fail();
      const localNameLength = bytes.readUInt16LE(local + 26),
        localExtra = bytes.readUInt16LE(local + 28);
      const dataStart = local + 30 + localNameLength + localExtra;
      if (
        bytes
          .subarray(local + 30, local + 30 + localNameLength)
          .toString('utf8')
          .replaceAll('\\', '/') !== name ||
        bytes.readUInt16LE(local + 8) !== method ||
        bytes.readUInt16LE(local + 6) !== flags ||
        dataStart + compressed > start
      )
        fail();
      files.push({
        name: clean,
        method,
        size,
        compressed,
        dataStart,
        crc: bytes.readUInt32LE(offset + 16),
      });
    }
    offset = next;
  }
  if (offset !== end || !files.length) fail();
  const rootIndex = files.find((file) => file.name === 'index.html');
  const folder = files[0].name.split('/')[0];
  const prefix = rootIndex ? '' : `${folder}/`;
  if (
    !rootIndex &&
    (!files.every((file) => file.name.startsWith(prefix)) ||
      !files.some((file) => file.name === `${prefix}index.html`))
  )
    fail();
  return { files, prefix, total };
}

/** 仅管理员明确通过审核后调用；目标由服务器生成，拒绝逃出暂存目录。 */
export function extractSubmissionZip(
  bytes,
  target,
  manifest = inspectSubmissionZip(bytes),
) {
  const root = path.resolve(target);
  for (const entry of manifest.files) {
    const destination = path.resolve(
      root,
      entry.name.slice(manifest.prefix.length),
    );
    const relative = path.relative(root, destination);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
      fail();
    const compressed = bytes.subarray(
      entry.dataStart,
      entry.dataStart + entry.compressed,
    );
    const content =
      entry.method === 0
        ? compressed
        : inflateRawSync(compressed, {
            maxOutputLength: Math.max(1, entry.size),
          });
    if (content.length !== entry.size || crc32(content) !== entry.crc) fail();
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, content, { flag: 'wx' });
  }
}
