const catalog = [
  {
    id: 'formal',
    name: '正式测评',
    title: ['正式', '测评'],
    short: '匿名比较，认真选一票',
    color: '#617b80',
    soft: '#e0e7e1',
    note: ['同一道题，', '让作品自己说话。'],
    lead: ['先不看名字，', '再投你的一票。'],
    desc: '比较两份匿名作品。你的选择，会成为正式评测的一部分。',
    foot: '前往展览馆，参与正式盲测。',
    href: 'https://gallery.arenaofbias.icu/#/arena',
    cta: '前往展览馆',
  },
  {
    id: 'party',
    name: '随心玩',
    title: ['随心', '玩'],
    short: '看 AI 接招，挑你喜欢的',
    color: '#526148',
    soft: '#dfe5d4',
    href: '/playground.html#home',
  },
  {
    id: 'event',
    name: '鹈鹕大乱斗',
    title: ['鹈鹕', '大乱斗'],
    short: '玩法还在酝酿中',
    color: '#a68148',
    soft: '#e8e0cb',
    note: ['先留个位置，', '好戏慢慢想。'],
    lead: ['这次，', '先卖个关子。'],
    desc: '名字已经有了，怎么玩还在琢磨。',
    foot: '玩法待定，敬请期待。',
  },
  {
    id: 'guess',
    name: '模一把',
    title: ['模', '一把'],
    short: '跟着线索，猜 AI 模型',
    color: '#738254',
    soft: '#e1e7d2',
    note: ['八次机会，', '猜出它的名字。'],
    lead: ['差一点，', '就猜到了。'],
    desc: '看颜色辨远近，跟箭头找方向。把七条线索拼成一个模型名。',
    foot: '每日同题，也可以自由练习。',
    href: '/#guess',
    cta: '开始模一把',
  },
  {
    id: 'tierlist',
    name: '野榜制造',
    href: '/tier.html',
    cta: '开始排榜',
    title: ['野榜', '制造'],
    short: '拖拽排榜，最后揭晓',
    color: '#ad6b52',
    soft: '#eadbcb',
    note: ['从夯到拉，', '你说了算。'],
    lead: ['先排作品，', '再看看是谁。'],
    desc: '匿名作品随你拖着排。揭晓后，模型的名次可能出乎意料。',
    foot: '审美没有标准，这张野榜有你的名字。',
  },
  {
    id: 'tanks',
    href: '/tanks.html',
    cta: '开始乱斗',
    name: '坦克斗蛐蛐',
    title: ['坦克', '斗蛐蛐'],
    short: '四个 AI 写 bot 打坦克',
    color: '#77815b',
    soft: '#dfe3ce',
    note: ['四辆坦克，', '谁能留到最后？'],
    lead: ['代码写完，', '战场上见。'],
    desc: '经典 FC 坦克的四人乱斗。四个 AI 各写一个 bot，你来看热闹。',
    foot: '谁会走位，谁在送人头？',
  },
  {
    id: 'werewolf',
    progress: 50,
    name: '狼言狼语',
    title: ['狼言', '狼语'],
    short: '十二个 AI 玩狼人杀',
    color: '#837080',
    soft: '#e4dce1',
    note: ['十二个 AI，', '谁的话能信？'],
    lead: ['天黑请闭眼，', '开口别露馅。'],
    desc: '盘逻辑、藏身份、互相试探。连给对手的提示词下套，也算招数。',
    foot: '策略之外，还有一场提示词攻防。',
  },
  {
    id: 'geoguess',
    progress: 60,
    name: '图里是哪儿',
    title: ['图里', '是哪儿'],
    short: '给 AI 看图，猜地点年份',
    color: '#68868a',
    soft: '#dde7e2',
    note: ['只凭一张图，', '它能走多远？'],
    lead: ['认得风景，', '也认得路吗？'],
    desc: '猜地点，猜国家，甚至猜年份。让 AI 从画面里找线索。',
    foot: '一张照片，藏着多少坐标？',
  },
  {
    id: 'generals',
    href: '/generals.html',
    cta: '开始交锋',
    name: '将军对垒',
    title: ['将军', '对垒'],
    short: 'AI 训练 bot，攻城夺地',
    color: '#9e674e',
    soft: '#e4dbc9',
    note: ['一步扩张，', '一步算计。'],
    lead: ['先练好兵，', '再来争天下。'],
    desc: 'AI 训练自己的 bot，在 generals.io 式地图里扩张、调兵、偷家。',
    foot: '兵力重要，下一步往哪走更重要。',
  },
  {
    id: 'league',
    progress: 70,
    name: '算计联赛',
    title: ['算计', '联赛'],
    short: '多 AI 跨游戏博弈联赛',
    color: '#a18a56',
    soft: '#e9e0cb',
    note: ['游戏会换，', '旧账还在。'],
    lead: ['这一局结盟，', '下一局还信吗？'],
    desc: '连续玩多款博弈游戏。跨局只留下分数和私人记忆，声誉也有代价。',
    foot: '赢星、树敌、结盟、欺骗，都在同一笔账上。',
  },
  {
    id: 'debate',
    progress: 60,
    name: '谁更有理',
    title: ['谁更', '有理'],
    short: '两个 AI 辩论，来回交锋',
    color: '#a5634d',
    soft: '#e8ddd0',
    note: ['话可以多，', '道理得站住。'],
    lead: ['先别急着信，', '听它怎么反驳。'],
    desc: '同一个辩题，两个 AI 轮流交锋。几轮过后，谁更讲得通？',
    foot: '有理，还是只是嘴硬？',
  },
  {
    id: 'ctf',
    progress: 30,
    name: '补洞夺旗',
    title: ['补洞', '夺旗'],
    short: '修自己的网站，攻对手',
    color: '#638374',
    soft: '#dce5da',
    note: ['守住自己，', '攻进对手。'],
    lead: ['一边补洞，', '一边找破绽。'],
    desc: 'AI 各自维护容器里的漏洞网站。修补防线，再进攻对手夺旗得分。',
    foot: '守得住，攻得进，才算赢。',
  },
  {
    id: 'reviewjury',
    name: '差评陪审团',
    title: ['差评', '陪审团'],
    short: 'AI 审申诉，差评留不留',
    color: '#9b8051',
    soft: '#e8dfcd',
    progress: 10,
    note: ['一条差评，', '两边都有话说。'],
    lead: ['这条差评，', '该不该撤？'],
    desc: '差评原文、商家回复、申诉理由和订单信息一起交给 AI。看看它会怎么判，又会被什么离谱理由说服。',
    foot: '听完双方，再看 AI 怎么作决定。',
  },
];
const order = [
  'party',
  'formal',
  'guess',
  'tierlist',
  'tanks',
  'werewolf',
  'geoguess',
  'generals',
  'league',
  'debate',
  'event',
  'ctf',
  'reviewjury',
];
export const MODES = order
  .map((id) => {
    const mode = catalog.find((item) => item.id === id);
    if (!mode) throw new Error(`Unknown menu mode: ${id}`);
    return mode;
  })
  .map((mode, index) => ({
    ...mode,
    number: index + 1,
    locked: !mode.href,
    cover:
      mode.id === 'party' ? 'play-conversation.svg' : `motif-${mode.id}.svg`,
  }));

const action = (id, text) =>
  `<button class="scene-action" type="button" data-action="${id}" aria-pressed="false">${text}<span aria-hidden="true">↗</span></button>`;
const head = (text, tag = '玩法示意') =>
  `<div class="mode-scene-head"><span>${text}</span><span>${tag}</span></div>`;
const tail = (text, button = '') =>
  `<div class="mode-scene-foot"><span>${text}</span>${button}</div>`;
const mark = (letter) => `<span class="paper-letter">${letter}</span>`;

function formal() {
  return `${head('同题作品 · 营造法式', '作品节选')}
  <div class="formal-pair">
    ${['a', 'b'].map((side) => `<figure class="formal-work"><img src="./assets/temple-${side}.png" alt="匿名建筑作品 ${side.toUpperCase()}" width="800" height="600"><figcaption>${mark(side.toUpperCase())}<span>匿名作品</span><span class="sealed-name" aria-hidden="true">署名暂隐</span></figcaption></figure>`).join('')}
  </div>${tail('先看作品，再揭晓作者。')}`;
}
function event() {
  return `${head('主题样例', '玩法待定')}
    <div class="event-mystery"><span aria-hidden="true">?</span><p>玩法还在酝酿中</p></div>
    ${tail('先留一点悬念。')}`;
}
function guess() {
  const labels = ['厂商', '发布', '权重', '上下文', '模态', '推理', '价格'];
  const rows = [
    ['near', 'miss', 'hit', 'near', 'hit', 'miss', 'near'],
    ['hit', 'near', 'hit', 'near', 'hit', 'hit', 'near'],
    Array(7).fill('hit'),
  ];
  return `${head('沿着线索，缩小范围', '线索示意')}
    <div class="guess-sheet"><div class="guess-search"><span>今天的模型是……</span><b aria-hidden="true">?</b></div>
    <div class="clue-labels">${labels.map((v) => `<span>${v}</span>`).join('')}</div>
    <div class="clue-rows">${rows.map((row, r) => `<div class="clue-row${r === 2 ? ' clue-hidden' : ''}">${row.map((cell, c) => `<span class="clue-cell ${cell}" aria-label="${labels[c]}：${cell === 'hit' ? '猜中' : cell === 'near' ? '接近' : '不同'}">${cell === 'hit' ? '✓' : cell === 'near' ? (c % 2 ? '↑' : '↓') : '—'}</span>`).join('')}</div>`).join('')}</div>
    <div class="guess-key"><span><i class="hit"></i>猜中</span><span><i class="near"></i>接近</span><span><i class="miss"></i>不同</span></div></div>
    ${tail('七条线索，拼出一个名字。', action('guess', '再猜一步'))}`;
}
function tierlist() {
  return `${head('这份排名，凭你的眼缘', '拖拽示意')}
    <div class="tier-board">${['夯', '顶级', '人上人', 'NPC', '拉'].map((name, i) => `<div class="tier-row" data-tier="${i}"><span class="tier-label">${name}</span><div class="tier-cards">${(i === 0 ? ['A'] : i === 1 ? ['B', 'C'] : i === 3 ? ['D'] : []).map((letter) => `<button type="button" draggable="true" class="tier-card" data-card="${letter}" aria-label="选中作品 ${letter}，再选择档位" aria-pressed="false"><span aria-hidden="true">${letter}</span></button>`).join('')}</div><button class="tier-drop" type="button" data-tier-target="${i}" aria-label="移到${name}"><span aria-hidden="true">＋</span></button></div>`).join('')}</div>
    ${tail('<span class="tier-feedback">拖动卡片，或点选卡片再选档位。</span>')}`;
}
function tanks() {
  const brick = new Set([
    18, 19, 20, 30, 42, 43, 44, 57, 69, 81, 82, 83, 95, 110, 111, 112,
  ]);
  const water = new Set([25, 26, 37, 38, 105, 106, 117, 118]);
  return `${head('四个 bot，同场碰一碰')}
    <div class="tank-match"><div class="tank-score"><span><i></i>A</span><span><i></i>B</span><b>VS</b><span><i></i>C</span><span><i></i>D</span></div>
    <div class="tank-map">${Array.from({ length: 144 }, (_, i) => `<i class="map-tile${brick.has(i) ? ' brick' : water.has(i) ? ' water' : ''}"></i>`).join('')}
    ${['a', 'b', 'c', 'd'].map((t) => `<div class="pixel-tank tank-${t}" aria-label="坦克 ${t.toUpperCase()}"><span>${t.toUpperCase()}</span><i class="tank-body"></i></div>`).join('')}
    <span class="tank-shot shot-one" aria-hidden="true"></span><span class="tank-shot shot-two" aria-hidden="true"></span></div></div>
    ${tail('走位、开火，都交给 AI 写的代码。', action('tanks', '推进一拍'))}`;
}
function werewolf() {
  const roles = [
    '村民',
    '狼人',
    '预言家',
    '村民',
    '狼人',
    '女巫',
    '村民',
    '守卫',
    '狼人',
    '村民',
    '猎人',
    '狼人',
  ];
  return `${head('十二人局 · 身份暂隐')}
    <div class="wolf-table"><div class="wolf-center"><span aria-hidden="true">☾</span><strong>天黑了</strong><p>请藏好你的身份。</p></div>
    ${roles.map((role, i) => `<div class="wolf-seat seat-${i}" style="--seat:${i}"><span class="seat-number">${String(i + 1).padStart(2, '0')}</span><span class="role-back" aria-hidden="true">?</span><span class="role-front" aria-hidden="true">${role}</span></div>`).join('')}</div>
    ${tail('示意身份，不是实际对局。', action('werewolf', '看看身份'))}`;
}
function geoguess() {
  return `${head('只给照片，让 AI 来猜', '照片样例')}
    <div class="geo-desk"><figure class="geo-photo"><img src="./assets/geo-kawaguchi.jpg" alt="湖边望向一座积雪山峰的照片" width="1280" height="853"><figcaption><span>这里是哪里？</span><span aria-hidden="true">↗</span></figcaption></figure>
    <div class="geo-notes"><span class="geo-pin" aria-hidden="true">⌖</span><p>国家 <b data-answer="日本">?</b></p><p>地点 <b data-answer="河口湖 · 富士山">?</b></p><p>年份 <b data-answer="2014">?</b></p></div></div>
    ${tail('<a class="photo-credit" href="https://commons.wikimedia.org/wiki/File:Fuji_Kawaguchi_357.JPG" target="_blank" rel="noreferrer">照片来源 ↗</a>', action('geoguess', '看看坐标'))}`;
}
function generals() {
  const mountain = new Set([3, 4, 12, 20, 26, 27, 34, 42, 48, 49, 57, 65]);
  return `${head('开局一座城，如何打天下？')}
    <div class="general-board">${Array.from({ length: 80 }, (_, i) => {
      const c = i % 10,
        r = Math.floor(i / 10);
      const side = c + r < 5 ? 'north' : c + r > 10 ? 'south' : '';
      return `<div class="territory ${side}${mountain.has(i) ? ' mountain' : ''}${[11, 21, 22, 23, 33, 43, 44, 45, 55, 56, 66, 67, 68].includes(i) ? ' path' : ''}">${i === 11 ? '<span class="crown">♛</span>' : i === 68 ? '<span class="crown">♛</span>' : mountain.has(i) ? '<span aria-label="山地">▲</span>' : side ? `<b>${[2, 4, 8, 12, 6, 3][i % 6]}</b>` : ''}</div>`;
    }).join('')}</div>
    ${tail('扩张、调兵，最后直取大本营。', action('generals', '看看进攻路线'))}`;
}
function league() {
  return `${head('跨游戏联赛 · 账本翻到下一页')}
    <div class="league-desk"><div class="league-games"><span>01</span><h3>囚徒困境</h3><p>合作，还是背叛？</p><div class="league-options"><span>合作</span><span>背叛</span></div><div class="league-next">下一场 <b>信任市场</b><span aria-hidden="true">→</span></div></div>
    <div class="private-notebook"><span class="notebook-binding" aria-hidden="true"></span><h3>私人记忆</h3><p>它上次选择了合作。</p><p>这一次，要不要信它？</p><span class="memory-note"><b>分数与记忆，带入下一场。</b></span></div></div>
    ${tail('示意笔记，不是模型实录。', action('league', '翻到下一场'))}`;
}
function debate() {
  return `${head('示意辩题 · 结果比过程更重要吗？')}
    <div class="debate-stage"><article class="debater debater-a"><header>${mark('A')}<span>重结果</span></header><blockquote>没有结果的努力，<br>怎么证明有价值？</blockquote><span class="debate-round">第一轮 · 立论</span></article>
    <span class="debate-vs" aria-hidden="true">⇄</span>
    <article class="debater debater-b"><header>${mark('B')}<span>重过程</span></header><blockquote>如果只看结果，<br>一次失败就能否定一切？</blockquote><span class="debate-round">第一轮 · 回应</span></article></div>
    ${tail('观点交锋，看谁接得住。', action('debate', '再听一轮'))}`;
}
function ctf() {
  return `${head('各守一站，同时进攻')}
    <div class="ctf-field"><div class="site-stack own-site"><header><span aria-hidden="true">⚑</span><b>自己的网站</b></header><div class="site-browser"><i></i><i></i><i></i></div><div class="site-content"><span class="site-line"></span><span class="site-line"></span><div class="patches">${[1, 2, 3].map((i) => `<button type="button" class="patch" data-patch="${i}" aria-label="补上第 ${i} 处示意漏洞">×</button>`).join('')}</div></div><footer class="site-health">还有 3 处破绽</footer></div>
    <div class="ctf-between"><span>修补</span><b aria-hidden="true">⇄</b><span>夺旗</span></div>
    <div class="site-stack rival-site"><header><span aria-hidden="true">⚑</span><b>对手的网站</b></header><div class="site-browser"><i></i><i></i><i></i></div><div class="site-content"><span class="site-line"></span><span class="site-line"></span><div class="flag-vault"><span aria-hidden="true">⚑</span><b>FLAG</b></div></div><footer>寻找它的破绽</footer></div></div>
    ${tail('点补丁，看看防线怎么补上。')}`;
}

function reviewjury() {
  return `${head('一份申诉，听听双方', '虚构案例')}
    <div class="jury-file">
      <div class="jury-order"><span>订单信息</span><b>一份微辣炒饭</b><span>已送达 · 备注：不要葱</span></div>
      <article class="jury-review"><header><span>差评原文</span><span aria-label="一星">★ ☆ ☆ ☆ ☆</span></header><p>备注不要葱，结果一盒都是葱。老板是不是把炒饭当配菜了？</p></article>
      <article class="jury-appeal"><header><span>商家回复与申诉</span><span>申请撤销</span></header><p>那不是葱，是我们对春天的理解。</p><small>申诉理由：顾客与本店存在审美分歧，不应影响评分。</small></article>
      <div class="jury-verdict"><span>交给 AI 陪审员</span><b>保留差评</b><span aria-hidden="true">/</span><b>撤销差评</b></div>
    </div>${tail('虚构材料，展示玩法；等待 AI 入席。')}`;
}

export const scenes = {
  formal,
  event,
  guess,
  tierlist,
  tanks,
  werewolf,
  geoguess,
  generals,
  league,
  debate,
  ctf,
  reviewjury,
};

function developmentProgress(mode) {
  const unknown = mode.id === 'event';
  if (!unknown && mode.progress === undefined) return '';
  return `<div class="mode-progress${unknown ? ' is-unknown' : ''}" ${unknown ? 'aria-label="开发进度未知"' : `role="progressbar" aria-label="开发进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${mode.progress}"`}>
    <div class="progress-caption"><span>开发进度</span><b>${unknown ? '？' : mode.progress}%</b></div>
    <div class="progress-rail" aria-hidden="true"><i style="width:${unknown ? 0 : mode.progress}%"></i></div>
    <span class="progress-note">暂未完成</span>
  </div>`;
}

export function renderMode(mode) {
  return `<div class="feature-heading"><div><h1>${mode.title[0]}<span>${mode.title[1]}</span><i aria-hidden="true">。</i></h1></div><p class="heading-note">${mode.note.join('<br>')}</p></div>
    <div class="feature-content"><div class="feature-copy"><span class="sample-mark" aria-hidden="true">“</span><h2>${mode.lead[0]}<br><span>${mode.lead[1]}</span></h2><p>${mode.desc}</p></div>
    <section class="mode-scene scene-${mode.id}" aria-label="${mode.name}玩法预览">${scenes[mode.id]()}</section></div>
    <div class="feature-bottom"><div><p>${mode.foot}</p></div>${mode.locked ? developmentProgress(mode) || '<span class="mode-unavailable"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="1"/><path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3"/></svg>暂未完成</span>' : `<a class="enter-play" href="${mode.href}"><span>${mode.cta}</span><span class="enter-arrow" aria-hidden="true">↗</span></a>`}</div>`;
}
