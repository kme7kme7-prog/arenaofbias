// 测试对局通道（2026-09-19）：后台「作品管理」勾选两份已发布作品后直达前台
// 竞技场并排对比，直观看画布校准效果。后台（admin.html）与主站是两个文档入口、
// 不共享模块状态，只靠 localStorage 传两个作品 id；竞技场挂载时消费一次即清除，
// 带时间戳兜底——没被消费（如作品中途下架）的陈旧标记自动作废，不隔日复活。
// 消费方（app/page.tsx）在测试对局期间投票不落库，防止测试票污染榜单。

import type { Matchup } from '@/lib/arena';
import { currentWorks } from '@/lib/works';

const KEY = 'aob-test-pair';
const TTL_MS = 5 * 60 * 1000;

type TestPairMark = { promptId: string; a: string; b: string; at: number };

export function setTestPair(promptId: string, a: string, b: string): void {
  try {
    const mark: TestPairMark = { promptId, a, b, at: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(mark));
  } catch {
    // 隐私模式等写不进：测试通道降级为不可用，不打断后台操作
  }
}

export function clearTestPair(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // 同上，写不进也删不掉，只能靠 TTL 兜底
  }
}

function peekTestPair(): TestPairMark | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const mark = JSON.parse(raw) as TestPairMark;
    if (
      !mark ||
      typeof mark.promptId !== 'string' ||
      typeof mark.a !== 'string' ||
      typeof mark.b !== 'string' ||
      typeof mark.at !== 'number'
    ) {
      clearTestPair();
      return null;
    }
    if (Date.now() - mark.at > TTL_MS) {
      clearTestPair();
      return null;
    }
    return mark;
  } catch {
    clearTestPair();
    return null;
  }
}

/**
 * 竞技场挂载 / 作品清单更新时消费：题目对上、且两份作品都在当前清单里才生效，
 * 生效即清除。清单还没到（远端作品未加载）时保留标记等下一次，不吞掉。
 * StrictMode 会双跑组件初始化函数——留一个两秒重放窗，同一挂载内重复调用
 * 拿回同一对，一次性消费不被重复调用吞掉。
 */
let replay: { promptId: string; at: number; pair: Matchup } | null = null;

export function takeTestPair(promptId: string): Matchup | null {
  if (
    replay &&
    replay.promptId === promptId &&
    Date.now() - replay.at < 2000
  )
    return replay.pair;
  const mark = peekTestPair();
  if (!mark || mark.promptId !== promptId) return null;
  const works = currentWorks();
  const a = works.find((work) => work.id === mark.a);
  const b = works.find((work) => work.id === mark.b);
  if (!a || !b) return null;
  clearTestPair();
  const pair: Matchup = [a, b];
  replay = { promptId, at: Date.now(), pair };
  return pair;
}
