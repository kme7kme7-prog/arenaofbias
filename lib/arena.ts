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
        action.round > 2
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

export const rounds = [
  {
    id: '001',
    category: '图像生成',
    code: 'VISUAL',
    name: '信号尽头',
    prompt: '在世界尽头，建造一座孤独的信号站。',
    detail: '同一提示词 · 两种想象',
    labels: ['潮汐之上', '落日回声'],
    models: ['赤鸢 / CRIMSON', '白隼 / KESTREL'],
    ratio: 62,
  },
  {
    id: '002',
    category: '文字创作',
    code: 'STORY',
    name: '最后一句',
    prompt: '一个机器人在世界停电前，给人类写了最后一封信。',
    detail: '同一命题 · 两种叙事',
    labels: ['等天亮的时候', '第 1,024 次日出'],
    models: ['墨池 / INKWELL', '回声 / ECHO'],
    ratio: 47,
  },
  {
    id: '003',
    category: '网页设计',
    code: 'WEB',
    name: '环游轨道',
    prompt: '为一家开往月球的旅行社，设计它的首页。',
    detail: '同一需求 · 两种表达',
    labels: ['ORBITAL 旅行计划', 'LUNA 出发指南'],
    models: ['折线 / POLYLINE', '星图 / STARMAP'],
    ratio: 56,
  },
] as const;

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
