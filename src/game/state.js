export const META_DEFAULT = {
  ink: 0, totalInk: 0, runs: 0, bestAct: 1, bestFloor: 0,
  unlockedCards: [], perks: [],
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
  thick_paper: { name: '厚宣纸', desc: '每次冒险开始+5最大生命', cost: 30 },
  ink_pot: { name: '墨池', desc: '每次冒险开始+15文银', cost: 20 },
  sharp_brush: { name: '利笔', desc: '每次冒险开始+1力量', cost: 40 },
  extra_scroll: { name: '展卷', desc: '每回合抽6张而非5张', cost: 50 },
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
  actNames: ['', '第一章·昨夜雨疏风骤', '第二章·南渡风烟', '第三章·人杰鬼雄'],
  shopInventory: null,
  drawLessNextTurn: 0,
};
