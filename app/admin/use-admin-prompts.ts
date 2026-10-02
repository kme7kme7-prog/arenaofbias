// 后台题目下拉的数据源：GET /api/admin/prompts（含草稿题）。
// 不用公开 /api/prompts——它只吐已发布题，而收件箱必须能往草稿题登记作品
//（先加题、再登记作品、检查后上架是正常流程，决策 045）。
import { apiFetch } from '@/lib/api';
import { useEffect, useState } from 'react';

export type PromptOption = { id: string; name: string };

export function useAdminPromptOptions(): PromptOption[] {
  const [options, setOptions] = useState<PromptOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    // setState 全部在 then/catch 回调里（项目 lint 规则：effect 体内不得同步 setState）
    apiFetch('/api/admin/prompts')
      .then((response) =>
        response.ok
          ? (response.json() as Promise<{ prompts: PromptOption[] }>)
          : Promise.reject(new Error()),
      )
      .then((data) => {
        if (!cancelled) setOptions(data.prompts);
      })
      .catch(() => {
        // 下拉加载失败保持空列表，不阻塞页面其余功能
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}
