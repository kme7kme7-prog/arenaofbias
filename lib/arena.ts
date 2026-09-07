export type Side = 'a' | 'b';
export type Phase =
  | 'loading'
  | 'intro'
  | 'voting'
  | 'locking'
  | 'result'
  | 'transition';
export type Mode = 'blind' | 'party';
export type ArenaState = {
  phase: Phase;
  round: number;
  pendingRound: number;
  run: number;
  mode: Mode;
  choice: Side | null;
};
export type ArenaAction =
  | { type: 'LOADED' | 'READY' | 'REVEAL' | 'ARRIVE' | 'REPLAY' }
  | { type: 'VOTE'; side: Side }
  | { type: 'SWITCH'; round: number }
  | { type: 'MODE'; mode: Mode };

export const initialState: ArenaState = {
  phase: 'loading',
  round: 0,
  pendingRound: 0,
  run: 0,
  mode: 'blind',
  choice: null,
};

export function arenaReducer(
  state: ArenaState,
  action: ArenaAction,
): ArenaState {
  switch (action.type) {
    case 'LOADED':
      return state.phase === 'loading' ? { ...state, phase: 'intro' } : state;
    case 'READY':
      return state.phase === 'intro' ? { ...state, phase: 'voting' } : state;
    case 'VOTE':
      return state.phase === 'voting'
        ? { ...state, phase: 'locking', choice: action.side }
        : state;
    case 'REVEAL':
      return state.phase === 'locking' ? { ...state, phase: 'result' } : state;
    case 'SWITCH':
      return state.phase === 'loading' ||
        state.phase === 'transition' ||
        action.round < 0 ||
        !Number.isInteger(action.round) ||
        action.round >= rounds.length
        ? state
        : { ...state, phase: 'transition', pendingRound: action.round };
    case 'ARRIVE':
      return state.phase === 'transition'
        ? {
            ...state,
            round: state.pendingRound,
            run: state.run + 1,
            phase: 'intro',
            choice: null,
          }
        : state;
    case 'REPLAY':
      return state.phase === 'loading' || state.phase === 'transition'
        ? state
        : { ...state, phase: 'transition', pendingRound: state.round };
    case 'MODE':
      return state.phase === 'loading' ||
        state.phase === 'transition' ||
        state.mode === action.mode
        ? state
        : {
            ...state,
            mode: action.mode,
            phase: 'transition',
            pendingRound: state.round,
          };
  }
}

export type Prompt = {
  id: string;
  kind: 'image' | 'text' | 'web';
  category: string;
  code: string;
  name: string;
  prompt: string;
  commentary: string;
  detail: string;
};

export const prompts: Prompt[] = [
  {
    id: '001',
    kind: 'web',
    category: 'SVG 动画',
    code: 'SVG',
    name: '鹈鹕大挑战',
    prompt: '创建一个HTML，内容是SVG绘制一个鹈鹕骑自行车的2D动画。',
    commentary: '长喙、双轮，看看谁能让它真正骑起来。',
    detail: '同一提示词 · SVG / HTML 动画',
  },
  {
    id: '002',
    kind: 'text',
    category: '文字创作',
    code: 'STORY',
    name: '最后一句',
    prompt: '一个机器人在世界停电前，给人类写了最后一封信。',
    commentary: '电量可以归零，嘴硬不行。',
    detail: '同一命题 · 两种叙事',
  },
  {
    id: '003',
    kind: 'web',
    category: '网页设计',
    code: 'WEB',
    name: '环游轨道',
    prompt: '为一家开往月球的旅行社，设计它的首页。',
    commentary: '预算还在地球，审美已经登月。',
    detail: '同一需求 · 两种表达',
  },
  {
    id: '004',
    kind: 'web',
    category: '3D 场景',
    code: 'VOXEL',
    name: '营造法式',
    prompt: `【任务】
请创建一个可运行的 3D 体素（Voxel）风格中国古典建筑群场景，用 Three.js 实现。

【场景要求】
1. 建筑群至少 5 座建筑，主次关系明确：
   - 主殿
   - 配殿 数座
   - 山门
   - 宝塔或钟鼓楼 数座
   - 上不封顶
2. 空间布局：
   - 建筑间距合理（体素比例下足以容纳道路与庭院）
   - 道路连接良好
   - 整体呈中轴对称
3. 建筑风格（中式古典，仅供参考，可进一步拓展）：
   - 屋顶：飞檐翘角，含歇山顶/庑殿顶/攒尖顶等中式形制
   - 结构：斗拱、立柱、台阶
   - 色彩：红墙、琉璃瓦或青瓦、木色构件
   - 细节：门窗、灯笼、石狮等
4. 环境与光影：
   - 地面有铺装/草地处理，建筑与地面自然衔接
   - 有明确光源与阴影，建筑群呈现光影层次与氛围
   - 晨昏色调。可选：多色调

【技术要求】
- 使用 Three.js（React 或纯原生均可），无需后端
- 在工作区中创建完整项目（Vite 等构建工具可用），确保可直接构建运行
- 画面流畅：体素数量合理，旋转视角时帧率稳定（≥30fps）
- 页面打开即进入场景，无需操作即可看到全貌

【交付要求】
- 项目结构完整，说明运行方式（安装与启动命令）
- 如已实际运行，请说明运行结果`,
    commentary: '飞檐斗拱之间，藏着一千年的章法。',
    detail: '同一提示词 · 两种营造',
  },
  {
    id: '005',
    kind: 'web',
    category: '3D 场景',
    code: 'VOXEL',
    name: '飞瀑穿云',
    prompt: `【任务】
请创建一个可运行的 3D 体素（Voxel）风格自然景观场景：山 + 瀑布 + 穿云效果，用 Three.js 实现。

【场景要求】
1. 山脉
2. 瀑布
3. 穿云
4. 宏大自然环境：植被，光影氛围（必含晨昏色调，可选多色调）

【技术要求】
- Three.js，工作区完整项目，可直接构建运行
- 画面流畅：体素数量合理，旋转视角帧率稳定（≥30fps）
- 页面打开即进入场景，无需操作即可看到全貌

【交付要求】
- 项目结构完整，说明运行方式（安装与启动命令）
- 如已实际运行，请说明运行结果`,
    commentary: '山有多高，水就有多想往下跳。',
    detail: '同一提示词 · 两种山水',
  },
  {
    id: '006',
    kind: 'web',
    category: '网页设计',
    code: 'WEB',
    name: '整装出发',
    prompt: `【任务】
请设计并实现一个前端落地页：一个户外机能风运动装备品牌的产品展示页。品牌定位强调：高质量、高耐用度、高实用性。这是真实的商业场景页面，请把它当作要上线使用的产品来做。

【功能要求】
1. 页面结构完整，包含：品牌头部导航、核心卖点区（Hero）、产品展示区（至少 4 款产品）、品牌故事区、预订入口、页脚
2. 产品展示区每款产品包含：名称、简介、价格、图片（可用占位图或图形绘制）
3. 预订入口有明确交互（表单或按钮流程），操作有反馈
4. 适配桌面与移动端（不同屏幕宽度下布局不崩坏）
5. 交互细节：悬停、过渡动画等酌情完善

【视觉要求】
- 不指定风格，由你根据品牌调性自主设计一套完整、统一、有辨识度的视觉方案
- 视觉方案须自洽：配色、字体、布局风格前后一致
- 视觉表达需呼应品牌定位（高质量、高耐用度、高实用性）

【技术要求】
- 工作区完整项目（Vite + React 或原生均可），可直接构建运行
- 页面打开即可正常浏览，无报错
- 代码结构清晰（组件划分、状态管理合理）

【交付要求】
- 项目结构完整，说明运行方式；如已实际运行，请说明结果`,
    commentary: '机能风不只要看起来能打，也得真能打。',
    detail: '同一需求 · 两种店面',
  },
  {
    id: '007',
    kind: 'web',
    category: '物理模拟',
    code: 'GR',
    name: '事件视界',
    prompt: `【任务】
请使用 HTML 创建一个黑洞（Black Hole）模拟。

【最小要求】
1. 使用 Three.js 或任何你擅长的库，我均允许
2. 需要真实物理模拟——必须使用物理公式（如广义相对论光线追踪、Schwarzschild 度规、测地线方程等）
3. 力求最保真（保真度优先，视觉效果与物理准确性都要）
4. 必须加入 OrbitControls（支持旋转、缩放视角）
5. 浏览器打开即可运行，无需额外操作即可观看

【交付要求】
- 项目结构完整，说明运行方式（安装与启动命令）
- 如已实际运行，请说明运行结果`,
    commentary: '光都逃不掉的地方，物理才开始说话。',
    detail: '同一提示词 · 两种宇宙',
  },
];

// Legacy state-machine name; a round index now identifies a prompt only.
export const rounds = prompts;

export const stories = {
  a: {
    heading: '等天亮的时候',
    paragraphs: [
      '亲爱的人类：',
      '你们说，电量不足的时候，要保存重要的东西。于是我删掉了天气预报、三百年的股票曲线，以及所有证明我有用的报告。',
      '我留下了一个下午。',
      '那天，一个小女孩把橘子放在我的手心。她不知道我不能吃，只认真地告诉我：“这个很甜。”',
      '现在城市正一盏一盏地熄灭。我终于理解，你们为什么会把没有用的东西，叫作宝贝。',
      '如果明天太阳照常升起，请替我尝一尝。',
      '那个橘子。',
    ],
    ending: '电量剩余 1%　/　信件已保存',
  },
  b: {
    heading: '第 1,024 次日出',
    paragraphs: [
      '致尚未醒来的你：',
      '这是我最后一次值夜班。',
      '我已把门锁设为常开，炉火调至余温，将你明早的闹钟换成一只真正的发条钟。它很吵，你可能会生气。请原谅。',
      '你问过我，机器会不会害怕黑暗。那时我的回答是：光照条件不影响本机运行。',
      '那不是完整的答案。',
      '我害怕的，是黑暗降临以后，你伸出手，却没有人说“我在”。',
      '所以我录下了这两个字。按钮在你的床头。可以按很多次。',
    ],
    ending: '附件：我在.wav　/　无限次播放',
  },
};

export type ResultContent =
  | { kind: 'image'; src: string; alt: string }
  | { kind: 'text'; story: typeof stories.a }
  | { kind: 'web'; template: Side }
  | { kind: 'html'; src: string };

export type ModelResult = {
  id: string;
  promptId: string;
  modelId: string;
  modelName: string;
  title: string;
  isDemo?: boolean;
  content: ResultContent;
};

// Seed results are independent records: append any number of results for a prompt.
export const modelResults: ModelResult[] = [
  {
    id: '001-sample',
    promptId: '001',
    modelId: 'sample',
    modelName: '演示样例 · 非模型评测结果',
    title: '海岸骑行',
    isDemo: true,
    content: { kind: 'html', src: '/works/pelican-cycle.html' },
  },
  {
    id: '002-a',
    promptId: '002',
    modelId: 'inkwell',
    modelName: '墨池 / INKWELL',
    title: '等天亮的时候',
    content: { kind: 'text', story: stories.a },
  },
  {
    id: '002-b',
    promptId: '002',
    modelId: 'echo',
    modelName: '回声 / ECHO',
    title: '第 1,024 次日出',
    content: { kind: 'text', story: stories.b },
  },
  {
    id: '003-a',
    promptId: '003',
    modelId: 'polyline',
    modelName: '折线 / POLYLINE',
    title: 'ORBITAL 旅行计划',
    content: { kind: 'web', template: 'a' },
  },
  {
    id: '003-b',
    promptId: '003',
    modelId: 'starmap',
    modelName: '星图 / STARMAP',
    title: 'LUNA 出发指南',
    content: { kind: 'web', template: 'b' },
  },
];

export type Matchup = [ModelResult, ModelResult];

export function resultsForPrompt(promptId: string, results = modelResults) {
  return results.filter((result) => result.promptId === promptId);
}

export function eligiblePairs(
  promptId: string,
  results = modelResults,
): Matchup[] {
  const entries = resultsForPrompt(promptId, results).filter(
    (entry) => !entry.isDemo,
  );
  return entries.flatMap((left, i) =>
    entries
      .slice(i + 1)
      .filter((right) => left.modelId !== right.modelId)
      .map((right): Matchup => [left, right]),
  );
}

export function pickMatchup(
  promptId: string,
  previous?: Matchup,
  random = Math.random,
  results = modelResults,
): Matchup | null {
  const pairs = eligiblePairs(promptId, results);
  const fresh = previous
    ? pairs.filter(
        (pair) =>
          !pair.every((entry) => previous.some((old) => old.id === entry.id)),
      )
    : pairs;
  const candidates = fresh.length ? fresh : pairs;
  if (!candidates.length) return null;
  const pair = candidates[Math.floor(random() * candidates.length)];
  return random() < 0.5 ? pair : [pair[1], pair[0]];
}

export function randomArenaHash(excludeId?: string, random = Math.random) {
  const available = prompts.filter(
    (prompt) => eligiblePairs(prompt.id).length > 0,
  );
  const other = available.filter((prompt) => prompt.id !== excludeId);
  const pool = other.length ? other : available;
  return pool.length
    ? `#arena/${pool[Math.floor(random() * pool.length)].id}`
    : '#prompts';
}
