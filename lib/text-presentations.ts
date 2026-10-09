import type { Prompt, Side } from './arena';

export type TextThemeId = 'reading' | 'forest' | 'letter' | 'channels' | 'blackout' | 'waiting';
export type TextTheme = { id: TextThemeId; label: string; title: string[]; note: string; identity: string; vote: string; draw: string };

const themes: Record<TextThemeId, TextTheme> = {
  reading: { id: 'reading', label: '读到这里，你偏向哪一篇？', title: ['偏见读物'], note: '', identity: '匿名稿', vote: '留下这一稿', draw: '两稿都留下' },
  forest: { id: 'forest', label: '森林里的另一个版本', title: ['小红帽'], note: '同样的四个人物，两个不同的故事。', identity: '讲述者', vote: '走进这个故事', draw: '两条路都想走' },
  letter: { id: 'letter', label: '未寄出的告白', title: ['有些话，', '没有寄出。'], note: '暗恋三年。不说爱，也不说喜欢。', identity: '来信', vote: '我会回这封信', draw: '两封都舍不得' },
  channels: { id: 'channels', label: '一件小事 · 三种文风', title: ['十八楼，', '三种口吻。'], note: '早高峰，电梯坏了。爬上十八楼。', identity: '作者', vote: '这一组更有戏', draw: '两组都很会演' },
  blackout: { id: 'blackout', label: '灯灭了，故事还没。', title: ['停', '电'], note: '不超过三百字，最后一句让你回头。', identity: '夜读', vote: '这一篇让我回头', draw: '两篇都留到天亮' },
  waiting: { id: 'waiting', label: '候场故事', title: ['等一个', '意外。'], note: '两百字以内，等一个意料之外的结尾。', identity: '候场稿', vote: '这一篇让我停住', draw: '愿意多等一会儿' },
};

const dedicated: Record<string, TextThemeId> = {
  '013': 'forest',
  'q-1b9d4f59c2d7b31e': 'letter',
  'q-200d4b7f9c69b79c': 'channels',
  'q-b23ef619e82dec65': 'blackout',
  'q-bfea3f9d2135205c': 'waiting',
};

/** Unregistered text topics automatically use the reading desk; no title matching. */
export function textPresentation(prompt: Prompt, generic = false): TextTheme {
  return themes[generic ? 'reading' : dedicated[prompt.id] ?? 'reading'];
}

/** The three established skins keep their own entrances. */
export function textTransitionScene(prompt: Prompt | undefined, presentation: string | null) {
  return prompt?.kind === 'text' && presentation !== 'classic' &&
    !['008', 'q-5ebd7c84dff7cd8f', 'q-a71a7e7e4bcaadc7'].includes(prompt.id)
    ? textPresentation(prompt, presentation === 'reading').id : undefined;
}

export function textIdentity(theme: TextTheme, side: Side) {
  return `${theme.identity} ${side.toUpperCase()}`;
}

/** Group only headings actually present in the answer; retain every character and paragraph. */
export function channelGroups(paragraphs: string[]) {
  const groups: { channel: 'prose' | 'cinema' | 'voice' | 'plain'; paragraphs: string[] }[] = [];
  for (const paragraph of paragraphs) {
    const match = paragraph.match(/^\s*【(张爱玲|王家卫|业主群大妈)】/);
    if (match || !groups.length) groups.push({ channel: match ? ({ 张爱玲: 'prose', 王家卫: 'cinema', 业主群大妈: 'voice' } as const)[match[1] as '张爱玲' | '王家卫' | '业主群大妈'] : 'plain', paragraphs: [] });
    groups[groups.length - 1].paragraphs.push(paragraph);
  }
  return groups;
}
