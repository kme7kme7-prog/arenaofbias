import type { Prompt } from './arena';
import presentation from './forum-presentation.json';

export const FORUM_PROMPT_ID = presentation.promptId;
export const FORUM_PROMPT_NAME = presentation.title;

/** Each thread keeps its own task ID, answers and ballots; only its presentation is shared. */
export function isForumPrompt(prompt?: Pick<Prompt, 'id' | 'kind' | 'tags'>): boolean {
  return !!prompt && prompt.kind === 'text' &&
    (prompt.id === FORUM_PROMPT_ID || prompt.tags?.includes('弱智吧') === true);
}

export function forumTopics(prompts: Prompt[], available: (id: string) => boolean): Prompt[] {
  return prompts.filter(prompt => isForumPrompt(prompt) && available(prompt.id));
}

export function nextForumTopic(currentId: string, topics: Prompt[]): Prompt | undefined {
  return topics.length ? topics[(topics.findIndex(prompt => prompt.id === currentId) + 1) % topics.length] : undefined;
}
