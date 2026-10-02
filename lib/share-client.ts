import { apiFetch } from '@/lib/api';
import type { ModelResult, Prompt } from './arena';
import { shareSvg } from './share-card.js';

const site = {
  home: ['不看名字，\n你会选谁？', '两份 AI 作品，一个属于你的答案。先看作品，凭直觉选择，再揭晓模型身份。', '#home'],
  prompts: ['好题，值得\n一起玩。', '从鹈鹕骑车到山中巨城，发现 AI 的另一面。', '#prompts'],
  rank: ['偏好不同，\n答案不同。', '看看大家更喜欢哪些 AI 的作品，也来留下你的选择。', '#rank'],
  guess: ['把它的名字，\n猜出来。', '七条线索，八次机会。每天一个 AI 模型，等你揭晓。', '#guess'],
  play: ['凭直觉，\n来一场。', '选作品、猜模型。在偏见试验场，找到你的答案。', '#play'],
  event: ['让好作品，\n碰个面。', '来偏见试验场，发现有趣的 AI 作品。', '#event'],
} as const;

export type ShareData = {
  type: 'site' | 'prompt' | 'duel' | 'guess';
  kicker: string;
  headline: string;
  subtitle: string;
  title: string;
  target: string;
  prompt?: Prompt;
  names?: string[];
  pair?: string[];
  pick?: 'a' | 'b' | 'draw';
  day?: string;
  rows?: string[];
  won?: boolean;
  answer?: string;
  thumbs?: (string | null)[];
};

export type ShareResult = { data: ShareData; url: string; file: File; imageUrl: string };

async function publicList<T>(path: string, field: string): Promise<T[]> {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error('分享数据暂不可用，请稍后重试。');
  const body = await response.json() as Record<string, unknown>;
  if (!Array.isArray(body[field])) throw new Error('分享数据暂不可用，请稍后重试。');
  return body[field] as T[];
}

function parseWork(row: Record<string, unknown>): ModelResult | null {
  if (typeof row.id !== 'string' || typeof row.promptId !== 'string' ||
      typeof row.modelId !== 'string' || typeof row.modelName !== 'string' ||
      typeof row.content !== 'string') return null;
  try {
    return { ...row, content: JSON.parse(row.content) } as ModelResult;
  } catch { return null; }
}

async function imageData(work: ModelResult): Promise<string | null> {
  if (work.content.kind !== 'image') return null;
  const source = new URL(work.content.src, location.origin);
  if (source.protocol !== 'http:' && source.protocol !== 'https:') return null;
  try {
    // oxlint-disable-next-line no-restricted-globals -- Public share images intentionally omit credentials.
    const response = await fetch(source.href, { credentials: 'omit' });
    const mime = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!response.ok || !/^image\/(png|jpeg|webp|svg\+xml)$/.test(mime)) return null;
    const blob = await response.blob();
    if (mime === 'image/svg+xml') {
      const blobUrl = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.src = blobUrl;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/png');
      } finally { URL.revokeObjectURL(blobUrl); }
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function resolveShareData(query: string): Promise<ShareData> {
  const params = new URLSearchParams(query);
  const type = params.get('type') || 'site';
  if (type === 'site') {
    const page = params.get('page') || 'home';
    const [headline, subtitle, target] = site[page as keyof typeof site] ?? site.home;
    return { type, kicker: 'THE HUMAN CHOICE / 偏见试验场', headline, subtitle,
      title: `${headline.replaceAll('\n', '')} · 偏见试验场`, target: `/${target}` };
  }
  if (type === 'guess') {
    const day = params.get('day') ?? '';
    const grid = params.get('grid') ?? '';
    const wonParam = params.get('won');
    const answer = params.get('answer') ?? undefined;
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) ||
        new Date(day).toISOString().slice(0, 10) !== day || day < '2026-09-13' || day > today ||
        !['0', '1'].includes(wonParam ?? '') || !/^[hnmu]{7}(\.[hnmu]{7}){0,7}$/.test(grid) ||
        (answer !== undefined && answer.length > 120))
      throw new Error('这份竞猜记录暂不可用。');
    const rows = grid.split('.');
    const won = wonParam === '1';
    const number = Math.round((Date.parse(day) - Date.parse('2026-09-13')) / 86400000);
    return { type, day, rows, won, answer,
      kicker: `模一把 / #${String(number).padStart(3, '0')} / ${day}`,
      headline: won ? '猜中了。\n凭的是线索。' : '没猜中，\n也有下一局。',
      subtitle: `${day} · ${won ? rows.length : 'X'}/8 · 七条线索，八次机会，留下今天的答案。`,
      title: `模一把 #${number} · ${won ? rows.length : 'X'}/8，你能用几次？`, target: '/#guess' };
  }
  if (type !== 'duel' && type !== 'prompt') throw new Error('分享类型无效。');
  const promptId = params.get('prompt') ?? '';
  if (!/^\d{3}$/.test(promptId)) throw new Error('这道题暂不可用。');
  const prompts = await publicList<Prompt>('/api/prompts', 'prompts');
  const prompt = prompts.find((item) => item.id === promptId);
  if (!prompt) throw new Error('这道题暂不可用。');
  const a = params.get('a'), b = params.get('b');
  let pair: ModelResult[] | null = null;
  if (a && b && a !== b && a.length <= 200 && b.length <= 200) {
    const works = (await publicList<Record<string, unknown>>('/api/works', 'works'))
      .map(parseWork).filter((work): work is ModelResult => work !== null);
    const left = works.find((work) => work.id === a && work.promptId === promptId);
    const right = works.find((work) => work.id === b && work.promptId === promptId);
    if (left && right && left.modelId !== right.modelId) pair = [left, right];
  }
  if (type === 'duel') {
    const pick = params.get('pick');
    if (!pair || (pick !== 'a' && pick !== 'b' && pick !== 'draw'))
      throw new Error('这场对决暂时无法分享，作品可能已下架。');
    const names = pair.map((work) => work.modelName);
    return { type, prompt, pair: [a!, b!], names, pick,
      thumbs: await Promise.all(pair.map(imageData)),
      kicker: 'MY CHOICE / 我的直觉',
      headline: pick === 'draw' ? '这一次，\n难分高下。' : '名字揭晓，\n直觉有了回响。',
      subtitle: `${prompt.name} · ${pick === 'draw' ? '我选了难分高下' : `我选择了 ${names[pick === 'a' ? 0 : 1]}`}`,
      title: `${prompt.name}：这是我的选择，你呢？`,
      target: `/?duel=${encodeURIComponent(JSON.stringify([promptId, a, b]))}#arena/${promptId}` };
  }
  return { type, prompt, ...(pair ? {
    pair: [a!, b!], names: pair.map((work) => work.modelName),
    thumbs: await Promise.all(pair.map(imageData)),
  } : {}), kicker: `PROMPT / ${promptId}`, headline: prompt.name,
    subtitle: prompt.prompt, title: `${prompt.name} · 偏见试验场`,
    target: pair ? `/?duel=${encodeURIComponent(JSON.stringify([promptId, a, b]))}#arena/${promptId}` : `/#arena/${promptId}` };
}

export async function createShareCard(query: string): Promise<ShareResult> {
  const data = await resolveShareData(query);
  const url = new URL('/', location.origin);
  const canonical = new URLSearchParams({ type: data.type });
  if (data.type === 'site') canonical.set('page', data.target.slice(2));
  if (data.prompt) canonical.set('prompt', data.prompt.id);
  if (data.pair) {
    canonical.set('a', data.pair[0]);
    canonical.set('b', data.pair[1]);
  }
  if (data.pick) canonical.set('pick', data.pick);
  if (data.type === 'guess') {
    canonical.set('day', data.day!);
    canonical.set('won', data.won ? '1' : '0');
    canonical.set('grid', data.rows!.join('.'));
    if (data.answer) canonical.set('answer', data.answer);
  }
  url.searchParams.set('share', canonical.toString());
  const svg = shareSvg(data, url.href);
  const svgUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = svgUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('浏览器无法生成图片。');
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (value) => value ? resolve(value) : reject(new Error('图片生成失败，请重试。')), 'image/png'));
    const file = new File([blob], 'arena-of-bias.png', { type: 'image/png' });
    return { data, url: url.href, file, imageUrl: URL.createObjectURL(blob) };
  } finally { URL.revokeObjectURL(svgUrl); }
}
