export const META_DEFAULT = {
  ink: 0, totalInk: 0, runs: 0, bestAct: 1, bestFloor: 0,
  unlockedCards: ['jiangjun', 'shenmi_daoshi', 'qinshi', 'zhu', 'kejin'],
  perks: [],
  lang: 'zh',
  unlockedPacks: ['base', 'caodong', 'luxun'],
  tutorialCompleted: false,
  battleMastery: {},
};

export function loadMeta() {
  try {
    const s = localStorage.getItem('sentence_rogue_meta');
    if (s) return { ...META_DEFAULT, ...JSON.parse(s) };
  } catch (e) { /* ignore */ }
  return { ...META_DEFAULT };
}

export let META = loadMeta();

export function saveMeta() {
  try { localStorage.setItem('sentence_rogue_meta', JSON.stringify(META)); } catch (e) { /* ignore */ }
}

export const LEGACY_PERKS = {
  thick_paper: { name: '厚封档案袋', desc: '每次夜巡开始+5最大生命', cost: 30 },
  ink_pot: { name: '值日生零钱盒', desc: '每次夜巡开始+15校章', cost: 20 },
  sharp_brush: { name: '红色批改笔', desc: '每次夜巡开始+1力量', cost: 40 },
  extra_scroll: { name: '备用作业本', desc: '每回合抽6张而非5张', cost: 50 },
};

export const UNLOCKABLE_CARDS_META = {
  jiangjun: { cost: 35, name: '将军' },
  shenmi_daoshi: { cost: 30, name: '神秘道士' },
  qinshi: { cost: 40, name: '琴师' },
  zhu: { cost: 40, name: '诛' },
  kejin: { cost: 45, name: '氪金' },
  wanwu: { cost: 40, name: '万物' },
  bug_obj: { cost: 35, name: 'bug' },
  jingtian: { cost: 45, name: '惊天动地地' },
  bujianwude: { cost: 50, name: '以不讲武德的方式' },
  sile: { cost: 55, name: '死了' },
};

export const G = {
  hp: 50, maxHp: 50, gold: 0, act: 1,
  deck: [], drawPile: [], discardPile: [], exhaustPile: [], hand: [],
  energy: 3, maxEnergy: 3, block: 0,
  strength: 0, vulnerable: 0, weak: 0,
  map: null, currentRow: -1, currentNodeIndex: -1,
  enemies: [], turn: 0, combatRewards: null,
  floorsCleared: 0, elitesKilled: 0, bossesKilled: 0, sentencesChanted: 0,
  sentence: [],
  enemyTargets: [],
  allCardsCostZero: false, poeticAura: false,
  musicStarted: false, muted: false,
  actNames: ['', '第零夜·多出来的三楼', '第一夜·第十三广播室', '第二夜·地下学生档案'],
  shopInventory: null,
  drawLessNextTurn: 0,
  sentenceJournal: [],
  combatJournal: [],
  lastRhymeKey: null,
  rhymeStreak: 0,
  currentScene: null,   // 场景(P5): { id, name, sinceTurn } | null
  sceneryProps: [],     // 舞台景物道具(P5): [{ id, word, turn }],上限 3
  scenesVisited: [],    // 本局到过的场景: [{ id, turn, combatCount }](P6 连环画原料)
  sentenceValidity: { ok: false, code: 'empty', reason: '请先放入文字' },
  actorIdentities: {},  // 具名个体的持续身份改写，如 皇帝→儿子
  combatFacts: null,    // 每轮真实伤害/防御/召唤摘要，供选择阶段台词读取
  lastRoundSummary: null,
  isTutorial: false,
};
