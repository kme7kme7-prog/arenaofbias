import { translate, type Locale } from '@/lib/locale';
import { MODES } from '@/reference/menu-demo/modes.mjs';

// Real answers stay in their original language; menu and illustrative copy translate.
const copy = Object.fromEntries(
  `
今天，玩点什么？|What will you play?
看 AI 接招，挑你喜欢的|See what AI makes. Pick a favorite.
匿名比较，认真选一票|Compare blind. Cast your vote.
跟着线索，猜 AI 模型|Follow the clues. Guess the model.
野榜制造|Wild Rankings
开始排榜|Start ranking
拖拽排榜，最后揭晓|Rank the works. Reveal the names.
四个 AI 写 bot 打坦克|Four AIs. Four tank bots.
十二个 AI 玩狼人杀|Twelve AIs play Werewolf.
选你喜欢的，|Pick your favorite.
再看是谁写的。|Then see who wrote it.
同一个问题，|One question.
两种|Two different
脑回路。|ways of thinking.
点一句，揭晓背后的 AI。|Pick a reply to reveal its AI.
弱智吧问答|Absurd Q&A
认真提问的楼主|An earnest question
1 楼|Post 1
2 楼|Post 2
3 楼|Post 3
匿名吧友 A|Anonymous A
匿名吧友 B|Anonymous B
合我心意|My pick
这句更绝|Pick this reply
再选一次|Pick again
文字、故事、3D，挑你喜欢的。|Words, stories, 3D. Pick what you like.
进入随心玩|Play Your Way
今天，想怎么玩？|How will you play?
左侧选玩法，右侧看介绍和预览。|Choose a mode on the left. Explore it on the right.
目录共三页，也可以用方向键选择。|Three pages to explore. Arrow keys work too.
开发进度|Development
开发进度未知|Development progress unknown
AI 审申诉，差评留不留|AI reviews appeals. Keep the review?
一条差评，|One bad review.
两边都有话说。|Two sides to hear.
这条差评，|This bad review:
该不该撤？|should it stay?
差评原文、商家回复、申诉理由和订单信息一起交给 AI。看看它会怎么判，又会被什么离谱理由说服。|Give AI the review, the merchant's reply, appeal and order details. See its verdict and what absurd reasons might persuade it.
听完双方，再看 AI 怎么作决定。|Hear both sides. See what AI decides.
一份申诉，听听双方|One appeal. Hear both sides.
虚构案例|Fictional case
订单信息|Order details
一份微辣炒饭|One mildly spicy fried rice
已送达 · 备注：不要葱|Delivered · Note: no scallions
差评原文|Customer review
一星|One star
备注不要葱，结果一盒都是葱。老板是不是把炒饭当配菜了？|I asked for no scallions. The box was full of them. Is the rice just a side dish?
商家回复与申诉|Merchant's reply and appeal
申请撤销|Removal requested
那不是葱，是我们对春天的理解。|Those are not scallions. That is our interpretation of spring.
申诉理由：顾客与本店存在审美分歧，不应影响评分。|Appeal: a difference in aesthetics should not affect our rating.
交给 AI 陪审员|Let AI decide
保留差评|Keep review
撤销差评|Remove review
虚构材料，展示玩法；等待 AI 入席。|Illustrative materials. Waiting for the AI jury.
有进入按钮的玩法，现在就能玩。|Modes with an entry button are ready to play.
暂未完成的玩法先看看设计。预览中的选择和示意都不计成绩。|Other modes are previews. Preview interactions do not count toward scores.
明白了，开始挑|Got it
同一道题，|One prompt.
让作品自己说话。|Let the work speak.
先不看名字，|Names hidden.
再投你的一票。|Your vote matters.
比较两份匿名作品。你的选择，会成为正式评测的一部分。|Compare two anonymous works. Your choice counts toward the formal evaluation.
同题作品 · 营造法式|One prompt · Temple architecture
作品节选|Work excerpts
署名暂隐|Name hidden
先看作品，再揭晓作者。|Work first. Reveal the creator later.
前往展览馆，参与正式盲测。|Visit the gallery for the formal blind evaluation.
八次机会，|Eight guesses.
猜出它的名字。|Name that model.
差一点，|Getting closer.
就猜到了。|One clue at a time.
看颜色辨远近，跟箭头找方向。把七条线索拼成一个模型名。|Use colors and arrows to narrow it down. Seven clues lead to one model.
沿着线索，缩小范围|Follow the clues. Narrow it down.
线索示意|Sample clues
今天的模型是……|Today's model is...
猜中|Match
不同|Different
七条线索，拼出一个名字。|Seven clues. One name.
再猜一步|One more guess
每日同题，也可以自由练习。|A daily puzzle, plus free practice.
开始模一把|Start guessing
从夯到拉，|From best to worst.
你说了算。|You decide.
先排作品，|Rank the works.
再看看是谁。|Then reveal the names.
匿名作品随你拖着排。揭晓后，模型的名次可能出乎意料。|Drag anonymous works into your ranking. The models behind them may surprise you.
这份排名，凭你的眼缘|A ranking made by your taste
拖拽示意|Try dragging
夯|S
顶级|A
人上人|B
拉|D
拖动卡片，或点选卡片再选档位。|Drag a card, or select it and choose a tier.
审美没有标准，这张野榜有你的名字。|No standard taste. This ranking is yours.
四辆坦克，|Four tanks.
谁能留到最后？|Who survives?
代码写完，|Code submitted.
战场上见。|See you on the battlefield.
经典 FC 坦克的四人乱斗。四个 AI 各写一个 bot，你来看热闹。|Classic tank combat with four players. Each AI writes a bot. You watch the battle.
四个 bot，同场碰一碰|Four bots. One battlefield.
玩法示意|Illustration
走位、开火，都交给 AI 写的代码。|AI-written code handles movement and fire.
推进一拍|Advance a beat
谁会走位，谁在送人头？|Who dodges? Who gets blown up?
十二个 AI，|Twelve AIs.
谁的话能信？|Whom can you trust?
天黑请闭眼，|Night falls.
开口别露馅。|Don't give yourself away.
盘逻辑、藏身份、互相试探。连给对手的提示词下套，也算招数。|Reason, bluff and probe. Even prompt injection is part of the game.
十二人局 · 身份暂隐|Twelve players · Roles hidden
天黑了|Night falls
请藏好你的身份。|Keep your role secret.
村民|Villager
狼人|Wolf
预言家|Seer
女巫|Witch
守卫|Guard
猎人|Hunter
示意身份，不是实际对局。|Sample roles, not a live match.
看看身份|Reveal roles
策略之外，还有一场提示词攻防。|Strategy meets prompt attack and defense.
给 AI 看图，猜地点年份|AI guesses places and years.
AI 训练 bot，攻城夺地|AI trains bots to conquer land.
多 AI 跨游戏博弈联赛|A multi-game league of strategy.
两个 AI 辩论，来回交锋|Two AIs. A battle of arguments.
玩法还在酝酿中|Still dreaming up the rules
修自己的网站，攻对手|Patch your site. Attack rivals.
只凭一张图，|Just one photo.
它能走多远？|How far can it get?
认得风景，|Know the scenery.
也认得路吗？|Know the place?
猜地点，猜国家，甚至猜年份。让 AI 从画面里找线索。|Guess places, countries, even years. Let AI find the clues in a picture.
只给照片，让 AI 来猜|One photo. Let AI guess.
照片样例|Sample photo
这里是哪里？|Where is this?
国家|Country
地点|Place
年份|Year
照片来源 ↗|Photo source ↗
看看坐标|Reveal location
日本|Japan
河口湖 · 富士山|Lake Kawaguchi · Mount Fuji
一张照片，藏着多少坐标？|How many clues can one photo hold?
一步扩张，|One step to expand.
一步算计。|One step to outwit.
先练好兵，|Train your army.
再来争天下。|Then claim the map.
AI 训练自己的 bot，在 generals.io 式地图里扩张、调兵、偷家。|AI trains a bot to expand, move troops and capture bases on a generals.io-style map.
开局一座城，如何打天下？|One city. How do you take the map?
扩张、调兵，最后直取大本营。|Expand, deploy, then strike the base.
看看进攻路线|Show attack route
兵力重要，下一步往哪走更重要。|Troops matter. Your next move matters more.
游戏会换，|The game changes.
旧账还在。|The past stays.
这一局结盟，|Allies this round.
下一局还信吗？|Still trusted next round?
连续玩多款博弈游戏。跨局只留下分数和私人记忆，声誉也有代价。|Play a series of strategy games. Only scores and private memories carry over. Reputation has a price.
跨游戏联赛 · 账本翻到下一页|New game. Same ledger.
囚徒困境|Prisoner's Dilemma
合作，还是背叛？|Cooperate or betray?
合作|Cooperate
背叛|Betray
下一场|Up next
信任市场|Trust Market
私人记忆|Private memory
它上次选择了合作。|It cooperated last time.
这一次，要不要信它？|Should I trust it again?
分数与记忆，带入下一场。|Scores and memories carry over.
示意笔记，不是模型实录。|Illustrative notes, not model transcripts.
翻到下一场|Next game
赢星、树敌、结盟、欺骗，都在同一笔账上。|Wins, rivals, alliances and lies. One ledger.
话可以多，|Say all you want.
道理得站住。|Make it stand up.
先别急着信，|Hold your verdict.
听它怎么反驳。|Hear the rebuttal.
同一个辩题，两个 AI 轮流交锋。几轮过后，谁更讲得通？|Two AIs take turns on one motion. After a few rounds, who makes more sense?
示意辩题 · 结果比过程更重要吗？|Sample motion · Do results matter most?
重结果|Results first
没有结果的努力，|Effort without results:
怎么证明有价值？|where is the value?
第一轮 · 立论|Round 1 · Argument
重过程|Process first
如果只看结果，|If results are everything,
一次失败就能否定一切？|does one failure erase it all?
第一轮 · 回应|Round 1 · Response
观点交锋，看谁接得住。|An exchange of ideas. Who holds up?
再听一轮|Hear another round
有理，还是只是嘴硬？|A point, or just stubbornness?
先留个位置，|A place reserved.
好戏慢慢想。|An idea taking shape.
这次，|For now,
先卖个关子。|a little mystery.
名字已经有了，怎么玩还在琢磨。|We have a name. The rules are still taking shape.
主题样例|Theme preview
玩法待定|Rules to come
先留一点悬念。|Let's keep a little mystery.
玩法待定，敬请期待。|Rules to come. Stay tuned.
守住自己，|Defend your site.
攻进对手。|Break into theirs.
一边补洞，|Patch the holes.
一边找破绽。|Find the openings.
AI 各自维护容器里的漏洞网站。修补防线，再进攻对手夺旗得分。|Each AI maintains a vulnerable site in a container. Patch it, then attack rivals to capture flags.
各守一站，同时进攻|Defend one site. Attack the others.
自己的网站|Your site
还有 3 处破绽|3 holes remain
修补|Patch
对手的网站|Rival site
寻找它的破绽|Look for an opening
点补丁，看看防线怎么补上。|Click a patch to repair the defense.
守得住，攻得进，才算赢。|Defend well. Break through. Win.
再看一次|Replay
回到开局|Reset
身份揭晓|Roles revealed
这一桌，谁在说谎？|Who at this table is lying?
藏好身份|Hide roles
再猜一次|Guess again
收起路线|Hide route
承诺，值多少信任？|How much is a promise worth?
信任|Trust
怀疑|Doubt
概率定价|Probability Pricing
回到上一场|Previous game
过程当然重要，|The process matters,
但它总该通向一个结果。|but it should lead somewhere.
可成长也是结果，|Growth is a result too.
只是不能立刻量出来。|You cannot always measure it now.
第二轮 · 立论|Round 2 · Argument
第二轮 · 回应|Round 2 · Response
回到开场|Back to opening
这一轮，防线补好了|Defense repaired this round
已恢复匿名，可以重新选择。|Names hidden again. Pick another reply.
玩法选择|Choose a mode
玩法目录|Game directory
玩法分页|Menu pages
上一页玩法|Previous modes
下一页玩法|Next modes
弱智吧问答，匿名回复二选一|Absurd Q&A: choose an anonymous reply
山地|Mountain
湖边望向一座积雪山峰的照片|A snow-covered mountain across a lake
关闭玩法说明|Close instructions
怎么玩|How to play
暂未完成|Not ready yet
可以玩|Ready to play
夺旗|Capture
`
    .trim()
    .split('\n')
    .map((line) => line.split('|')),
);
const titles: Record<string, [string, string]> = {
  party: ['Play Your ', 'Way'],
  formal: ['Blind ', 'Evaluation'],
  guess: ['Guess ', 'the AI'],
  tierlist: ['Wild ', 'Rankings'],
  tanks: ['Tank ', 'Brawl'],
  werewolf: ['Wolf ', 'Talk'],
  geoguess: ['Where ', 'Is It?'],
  generals: ['Generals ', 'Duel'],
  league: ['Strategy ', 'League'],
  debate: ['Who Has ', 'a Point?'],
  event: ['Pelican ', 'Rumble'],
  ctf: ['Patch & ', 'Capture'],
  reviewjury: ['Review ', 'Jury'],
};
for (const mode of MODES) copy[mode.name] = titles[mode.id].join('');

function english(value: string): string {
  const key = value.trim();
  if (copy[key]) return value.replace(key, copy[key]);
  const dynamic = key
    .replace(/^还有 (\d+) 处破绽$/, '$1 holes remain')
    .replace(/^补上第 (\d+) 处示意漏洞$/, 'Patch sample hole $1')
    .replace(/^第 (\d+) 处示意漏洞已修补$/, 'Sample hole $1 patched')
    .replace(
      /^选中作品 ([A-D])，再选择档位$/,
      'Select work $1, then choose a tier',
    )
    .replace(
      /^已选作品 ([A-D])，点档位右侧的 \+ 移动。$/,
      'Work $1 selected. Click + beside a tier to move it.',
    )
    .replace(
      /^作品 ([A-D]) 已移到(.+)。$/,
      (_, card, tier) => `Work ${card} moved to ${english(tier)}.`,
    )
    .replace(/^移到(.+)$/, (_, tier) => `Move to ${english(tier)}`)
    .replace(/^选回复 ([AB])，这句更绝$/, 'Choose reply $1')
    .replace(
      /^回复 ([AB])，(.+)，(已选择|这句更绝)$/,
      (_, side, model, state) =>
        `Reply ${side}, ${model}, ${state === '已选择' ? 'selected' : 'choose this reply'}`,
    )
    .replace(
      /^你选择了回复 ([AB])，作者是 (.+)。预览不计票。$/,
      'You chose reply $1 by $2. Preview votes do not count.',
    )
    .replace(/^匿名建筑作品 ([AB])$/, 'Anonymous architecture work $1')
    .replace(/^坦克 ([A-D])$/, 'Tank $1');
  if (dynamic !== key) return value.replace(key, dynamic);
  for (const mode of MODES) {
    if (key === `${mode.name}玩法预览`) return `${copy[mode.name]} preview`;
    if (key === `${mode.name}示意已更新。`)
      return `${copy[mode.name]} preview updated.`;
    if (key.startsWith(`${mode.name}，`))
      return `${copy[mode.name]}. ${english(mode.short)} ${mode.locked ? 'Not ready yet. Preview available.' : 'Ready to play.'}`;
  }
  const clue = key.match(
    /^(厂商|发布|权重|上下文|模态|推理|价格)：(猜中|接近|不同)$/,
  );
  if (clue) return `${translate(clue[1], 'en')}: ${english(clue[2])}`;
  return value.replace(key, translate(key, 'en'));
}

export function localizeMenu(root: HTMLElement, language: Locale) {
  if (language !== 'en') return;
  const content = root.querySelector('.collection-content')!;
  const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (
      node.parentElement?.closest(
        '#forum-question,.reply-text,.identity-revealed,h1',
      )
    )
      continue;
    if (node.textContent?.trim()) node.textContent = english(node.textContent);
  }
  content
    .querySelectorAll<HTMLElement>('[aria-label],[alt]')
    .forEach((element) => {
      for (const attribute of ['aria-label', 'alt']) {
        const value = element.getAttribute(attribute);
        if (value) element.setAttribute(attribute, english(value));
      }
    });
  const mode = (root.querySelector('#preview') as HTMLElement).dataset.mode!;
  const heading = root.querySelector('.feature:not([hidden]) h1')!;
  const [start, end] = titles[mode];
  heading.replaceChildren(
    document.createTextNode(start),
    Object.assign(document.createElement('span'), { textContent: end }),
  );
}
