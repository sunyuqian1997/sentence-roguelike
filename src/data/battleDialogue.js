// Battle dialogue copy is intentionally presentation-only. Keeping it out of
// combat.js makes the cadence easy to tune without touching settlement rules.

export const PLAYER_MASTERY_HINTS = Object.freeze({
  identity: {
    title: '身份句已学会',
    zh: ({ actor = '它' } = {}) => `你刚用了“我是「${actor}」”。这类句子会改变我方身份，并获得该身份的效果。`,
    en: ({ actor = 'it' } = {}) => `“I am ${actor}”... So a sentence really can rewrite me for a while.`,
  },
  namedAlly: {
    title: '个体助战已学会',
    zh: ({ actor = '猫', mode = 'actor' } = {}) => mode === 'summon'
      ? `你刚召唤了「${actor}」。以后可以用具名个体加入战斗。`
      : `你刚让「${actor}」成为句子主语。具名主语会作为独立个体执行动作。`,
    en: ({ actor = 'Cat', mode = 'actor' } = {}) => mode === 'summon'
      ? `${actor} answered. Calling a name can invite someone into the fight.`
      : `${actor} followed the sentence. A named actor can fight as its subject.`,
  },
  defend: {
    title: '防御句已学会',
    zh: () => '防御句会获得格挡。敌方准备攻击时，先防御可以减少实际失血。',
    en: () => `That line did not hurt it, but it kept me safe. Leaving room is a kind of writing, too.`,
  },
  heal: {
    title: '治疗句已学会',
    zh: () => '治疗句会恢复生命。生命较低时，可以先组成治疗句再继续攻击。',
    en: () => 'With my eyes closed, the sentence gathered my scattered breath.',
  },
});

const DEFAULT_QUOTES = Object.freeze({
  attack: ['铃声还没停。', '轮到这一行靠近你了。', '走廊把距离折短了。'],
  defend: ['这一页，先折起来。', '空白也会挡住声音。'],
  buff: ['旧字正在重新显影。', '再等一格，影子就对齐了。'],
  debuff: ['把你的标点借我一下。', '这句话，读慢一点。'],
  special: ['课表之外，还有一节课。', '广播正在换一条频率。'],
  stunned: ['……这一行忽然断了。', '铃声跳过了这一拍。'],
  low: ['快醒了吗？可窗外还是同一个傍晚。', '纸页变薄了，回声却更近。'],
});

// Dreamlike rather than horrific: each enemy speaks as if it belongs to a
// slightly misaligned after-school world. Missing enemies fall back to the
// generic pools above.
export const ENEMY_TURN_QUOTES = Object.freeze({
  墨妖: {
    attack: ['别急，墨迹还没干。', '你写下的，我也看见了。', '黑板会替我记住这一笔。'],
    low: ['水快干了，字反而更清楚。', '最后一滴墨，正在找落点。'],
  },
  纸鬼: {
    attack: ['纸边要合上了。', '下一页，在风里等你。', '听，折痕又靠近了一格。'],
    defend: ['折起来，就听不见铃声了。', '这一页暂时不翻。'],
    low: ['纸越来越轻，教室却没有变。'],
  },
  残句怪: {
    attack: ['句号还在走廊尽头。', '把没说完的，还给我。', '这一句，还差你的名字。'],
    low: ['只剩半句，也足够走到这里。'],
  },
  文曲星: {
    attack: ['星图不认这张课表。', '抬头，天花板后面还有一层。'],
    special: ['借走一个词，星位才会空出来。', '少一个字，夜空会更整齐。'],
    low: ['晨星将落，晚自习还未结束。'],
  },
  仓颉之影: {
    attack: ['字先于你醒来。', '第一笔，正在寻找最后一笔。'],
    buff: ['旧偏旁回到了它的位置。', '影子正在把笔画一一捡起。'],
    low: ['没有人记得第一个字原本的声音。'],
  },
  笔精: {
    attack: ['红笔从页边滑过来了。', '这一划，不写在作业本上。'],
    debuff: ['批注会让下一句变得很轻。'],
  },
  墨魂: {
    attack: ['倒影比本人早一步。', '水面又记起了这间教室。'],
    buff: ['墨池把刚才的一刻退了回来。'],
  },
  落人: {
    attack: ['楼梯向下，可脚步声在上面。', '我们是不是见过同一个黄昏？'],
  },
  镜墨: {
    attack: ['镜子里，这一招已经发生过。', '你的影子刚刚眨了眼。'],
    defend: ['先让镜面替我回答。'],
  },
  诗圣残魂: {
    attack: ['旧诗从窗缝里翻了一页。', '月色正在替这一句押韵。'],
    defend: ['这一联，先留给下个回合。'],
  },
  虚文: {
    attack: ['没有写下的字，也有重量。', '风把空句吹到了你面前。'],
  },
  墨劫: {
    attack: ['灯管暗了一格。', '影子在你的座位上坐下了。'],
    debuff: ['今天的粉笔灰，比昨天更重。'],
  },
  词帝幽灵: {
    attack: ['整座校舍，都是未完的序言。', '让这一行回到它应在的位置。'],
    buff: ['钟声为旧句加冕。'],
    debuff: ['你借来的词，该归档了。'],
    low: ['王冠落下时，还是放学后的声音。'],
  },
});

export function quotePoolFor(enemy, intent) {
  const own = ENEMY_TURN_QUOTES[enemy?.name] || {};
  const ratio = enemy?.maxHp > 0 ? enemy.hp / enemy.maxHp : 1;
  if (ratio <= 0.4) {
    return [...new Set([...(own.low || []), ...DEFAULT_QUOTES.low])];
  }
  const kind = intent?.type || 'special';
  const fallback = DEFAULT_QUOTES[kind] || DEFAULT_QUOTES.special;
  return [...new Set([...(own[kind] || []), ...fallback])];
}
