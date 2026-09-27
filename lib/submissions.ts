export type Submission = {
  id: string;
  promptId: string;
  modelName: string;
  title: string;
  notes: string;
  filename: string;
  size: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewNote: string;
  inboxName: string | null;
  username?: string;
};
export const submissionStatus = {
  pending: '待审核',
  approved: '审核通过',
  rejected: '已退回',
} as const;

export async function submissionRequest<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? '请求失败，请稍后重试。');
  return data as T;
}
