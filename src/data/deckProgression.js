// Deck progression is a curriculum: new rewards unlock new sentence shapes,
// not merely larger numbers. Keep this module data-only so design checks can
// run without a browser.

export const STARTER_DECK_KEYS = Object.freeze([
  // Named actors: every one can stand on stage and perform the verb itself.
  'yingzi', 'wuming', 'mao',
  // A compact, reliable verb core. 我 and enemy targets are always available
  // from the target dock, so they do not need to bloat the draw pile.
  'zhan', 'sui', 'cu', 'shou', 'piaofu',
  // Concrete imagery makes basic SVO lines expressive before grammar unlocks.
  'hai', 'huijin', 'guge',
  'chaoshide', 'shuaiqide',
  // One emotional and one closing tool. Commas arrive later with summons.
  'oh', 'period',
]);

export const SYNTAX_LESSONS = Object.freeze([
  {
    id: 'identity', minFloor: 1, key: 'shi_copula', title: '判断句',
    example: '我是猫 / 皇帝是儿子',
    note: '用「A是B」改写自己或个体的身份。',
    companionKeys: [],
  },
  {
    id: 'instrument', minFloor: 2, key: 'yong', title: '万物皆兵',
    example: '我用猫戳纸鬼',
    note: '「用+名词+动作」会把任何名词变成器物。',
    companionKeys: [],
  },
  {
    id: 'summon', minFloor: 3, key: 'hatsunemiku', title: '呼名登场',
    example: '哦，初音未来',
    note: '获得「初音未来」和「，」；叹词呼名可召唤，逗号也能写复句。',
    companionKeys: ['comma'],
  },
  {
    id: 'imperative', minFloor: 4, key: 'gei', title: '祈使命令',
    example: '纸鬼给我戳',
    note: '「敌人+给我+动作」会命令敌人攻击自己。',
    companionKeys: [],
  },
  {
    id: 'scene', minFloor: 5, key: 'qu_verb', title: '移步换景',
    example: '我去海边',
    note: '获得「去」和「海边」；换景后会得到整场环境效果。',
    companionKeys: ['haibian'],
  },
  {
    id: 'coordination', minFloor: 6, key: 'he', title: '结伴主语',
    example: '猫和影子守我',
    note: '用「和」让两个个体共同执行同一个动作。',
    companionKeys: [],
  },
  {
    id: 'assist', minFloor: 7, key: 'bang', title: '关系句',
    example: '猫帮我戳纸鬼',
    note: '用「帮」触发具名角色的个体特性，关系本身也会产生效果。',
    companionKeys: [],
  },
  {
    id: 'causative', minFloor: 8, key: 'rang', title: '兼语命令',
    example: '我让纸鬼戳',
    note: '用「让+个体+动作」改变真正的行动者。',
    companionKeys: [],
  },
  {
    id: 'question', minFloor: 9, key: 'question', title: '疑问反转',
    example: '我戳纸鬼？',
    note: '问号把直接攻击改写成追问，使目标虚弱。',
    companionKeys: [],
  },
  {
    id: 'sequence', minFloor: 10, key: 'ranhou', title: '顺承复句',
    example: '我守，然后影子戳纸鬼',
    note: '用「然后」串起两个动作，并再次执行句子的效果。',
    companionKeys: [],
  },
]);

const MILESTONE_FLOOR = new Map();
for (const lesson of SYNTAX_LESSONS) {
  MILESTONE_FLOOR.set(lesson.key, lesson.minFloor);
  lesson.companionKeys.forEach((key) => MILESTONE_FLOOR.set(key, lesson.minFloor));
}

// Supporting vocabulary follows the lesson that makes it legible. These may
// still be useful as plain words, but withholding them early keeps rewards
// from advertising syntax the game has not introduced yet.
[
  ['rang', 8],
  ['yuexia', 5], ['jiuguan', 5], ['zhanchang', 5],
].forEach(([key, floor]) => MILESTONE_FLOOR.set(key, floor));

export function cardUnlockFloor(key) {
  return MILESTONE_FLOOR.get(key) || 0;
}

export function isCardAvailableAtFloor(key, floor = 0) {
  return floor >= cardUnlockFloor(key);
}

// One reward slot keeps offering the next due lesson until the player accepts
// it. The other two slots stay random, preserving roguelike choice.
export function nextSyntaxLesson(deckKeys = [], floor = 0) {
  const owned = new Set(deckKeys);
  return SYNTAX_LESSONS.find((lesson) =>
    floor >= lesson.minFloor
    && !owned.has(lesson.key)) || null;
}

export function lessonRewardKeys(lesson) {
  return lesson ? [lesson.key, ...lesson.companionKeys] : [];
}

const REWARD_TRACKS = Object.freeze({
  vocabulary: {
    id: 'vocabulary',
    label: '新词入句',
    note: '加入尚未拥有的词，扩大可以描述的对象。',
  },
  synergy: {
    id: 'synergy',
    label: '补全搭配',
    note: '补足当前牌组较少的词性，更容易在实战中成句。',
  },
  variation: {
    id: 'variation',
    label: '风格变奏',
    note: '加入会改变语气、节奏或行动者的词。',
  },
});

function rewardExample(def) {
  const word = def.word;
  if (def.pos === 'subject') return `${word}戳纸鬼`;
  if (def.pos === 'modifier') return `我${word}戳纸鬼`;
  if (def.pos === 'object') return `我戳${word}`;
  if (def.pos === 'exclamation') return `我戳纸鬼${word}`;
  if (def.pos === 'punctuation') return `我戳纸鬼${word}`;
  if (def.pos === 'verb') {
    return def.valence === 'intrans' ? `我${word}` : `我${word}纸鬼`;
  }
  return `把「${word}」接进下一句`;
}

function scoreRewardCandidate(key, def, track, ownedCounts, posCounts) {
  const owned = ownedCounts.get(key) || 0;
  let score = owned === 0 ? 12 : -owned * 8;
  const rarityScore = { common: 1, uncommon: 3, rare: 4 }[def.rarity] || 0;
  const pos = def.pos || 'other';
  const roleTarget = {
    subject: 4, verb: 6, object: 4, modifier: 4,
    connector: 1, punctuation: 1, exclamation: 2,
  }[pos] || 1;
  const roleNeed = Math.max(0, roleTarget - (posCounts.get(pos) || 0));

  if (track === 'vocabulary') {
    score += roleNeed * 2;
    if (pos === 'subject' || pos === 'object') score += 3;
    if (pos === 'connector') score -= 3;
    if (pos === 'punctuation') score += 1;
  } else if (track === 'synergy') {
    score += roleNeed * 4;
    if (pos === 'modifier' || pos === 'object') score += 3;
    if (def.combatType && def.combatType !== 'attack') score += 2;
  } else {
    score += rarityScore * 2;
    if (pos === 'subject' || pos === 'exclamation' || pos === 'punctuation') score += 4;
    if (def.combatType === 'attack' && def.rarity === 'common') score -= 3;
  }
  return score;
}

/**
 * Pure reward planner. `definitions` and `isEligible` are injected so both
 * browser code and Node progression simulations exercise the same draft.
 */
export function draftRewardKeys({
  definitions,
  deck = [],
  floor = 0,
  count = 3,
  excludeKeys = [],
  selfKey = 'wo',
  rng = Math.random,
  isEligible = () => true,
} = {}) {
  const ownedCounts = new Map();
  const posCounts = new Map();
  deck.forEach((card) => {
    if (card?.key) ownedCounts.set(card.key, (ownedCounts.get(card.key) || 0) + 1);
    if (card?.pos) posCounts.set(card.pos, (posCounts.get(card.pos) || 0) + 1);
  });
  const excluded = new Set(excludeKeys);
  const trackOrder = ['vocabulary', 'synergy', 'variation'];
  const picks = [];

  for (let i = 0; i < count; i++) {
    const trackId = trackOrder[i % trackOrder.length];
    const candidates = Object.entries(definitions || {})
      .filter(([key, def]) => {
        if (excluded.has(key) || key === selfKey) return false;
        if (!['common', 'uncommon', 'rare'].includes(def.rarity)) return false;
        if (!isCardAvailableAtFloor(key, floor)) return false;
        return isEligible(key, def);
      })
      .map(([key, def]) => ({
        key,
        score: scoreRewardCandidate(key, def, trackId, ownedCounts, posCounts) + rng() * 1.5,
      }))
      .sort((a, b) => b.score - a.score);
    const chosen = candidates[0]?.key;
    if (!chosen) break;
    excluded.add(chosen);
    const track = REWARD_TRACKS[trackId];
    picks.push({
      key: chosen,
      track: track.id,
      label: track.label,
      note: track.note,
      example: rewardExample(definitions[chosen]),
    });
  }
  return picks;
}
