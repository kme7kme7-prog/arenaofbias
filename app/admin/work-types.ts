import type { ResultContent } from '@/lib/arena';

export type AdminWork = {
  id: string;
  promptId: string;
  modelId: string;
  modelName: string;
  title: string;
  isDemo: boolean;
  published: boolean;
  createdAt: number;
  src: string | null;
  content: ResultContent | null;
};

export async function patchWork(
  id: string,
  changes: object,
): Promise<AdminWork> {
  const response = await fetch(`/api/admin/works/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(changes),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.work)
    throw new Error(data.error || '保存失败，请重试');
  return data.work;
}
