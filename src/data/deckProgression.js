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
  ['rang', 4],
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
