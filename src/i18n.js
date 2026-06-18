import { META } from './game/state.js';

export function getLang() {
  return META.lang || 'zh';
}

export function setLang(lang) {
  META.lang = lang;
  try { localStorage.setItem('sentence_rogue_meta', JSON.stringify(META)); } catch (e) { /* */ }
}

export function isEn() {
  return getLang() === 'en';
}

const UI_STRINGS = {
  zh: {
    title: '词灵录',
    subtitle: '文字即魔法',
    startBtn: '开始',
    metaBtn: '文渊阁',
    credit: '李清照 · v8',
    chant: '吟诵',
    endTurn: '结束',
    deckBtn: '词库',
    energy: '文力',
    draw: '抽',
    discard: '弃',
    poemBook: '诗册',
    poet: '诗人',
    roundJournal: '本场诗册',
    notChanted: '尚未吟诵…',
    enemy: '敌',
    me: '我',
    victory: '战胜！',
    selectCard: '选张新牌：',
    skip: '跳过',
    gold: '文银',
    act1: '第一章',
    restTitle: '月下独酌',
    restFlavor: '小憩片刻…',
    restHeal: '品茗·回血30%',
    restUpgrade: '研墨·升级',
    shopTitle: '词坊',
    shopRemove: '忘却一张词',
    leave: '离去',
    poetryTitle: '题壁',
    poetryFlavor: '留诗换力。',
    upgradeSelect: '选牌升级：',
    deckTitle: '词库',
    status_str: '力',
    status_vuln: '伤',
    status_weak: '弱',
    status_block: '盾',
    cost: '费',
    summon: '召唤',
    declare: '宣言',
    sentenceLabel: '点牌造句',
    poemTitle: '— 本局诗篇 —',
    posNames: { subject:'主语', verb:'谓语', object:'宾语', modifier:'修饰', connector:'连接', special:'特殊', punctuation:'标点', exclamation:'感叹' },
    rarityNames: { starter:'初始', common:'普通', uncommon:'非凡', rare:'稀有' },
  },
  en: {
    title: 'Ink & Verse',
    subtitle: 'Words are magic',
    startBtn: 'Start',
    metaBtn: 'Archive',
    credit: 'Li Qingzhao · v8',
    chant: 'Chant',
    endTurn: 'End',
    deckBtn: 'Deck',
    energy: 'Ink',
    draw: 'Draw',
    discard: 'Disc',
    poemBook: 'Verses',
    poet: 'Poet',
    roundJournal: 'This Battle',
    notChanted: 'No verse yet…',
    enemy: 'Foe',
    me: 'I',
    victory: 'Victory!',
    selectCard: 'New card:',
    skip: 'Skip',
    gold: 'Gold',
    act1: 'Act I',
    restTitle: 'Moonlit Rest',
    restFlavor: 'A brief rest…',
    restHeal: 'Tea · Heal 30%',
    restUpgrade: 'Ink · Upgrade',
    shopTitle: 'Shop',
    shopRemove: 'Remove a card',
    leave: 'Leave',
    poetryTitle: 'Inscribe',
    poetryFlavor: 'A verse for power.',
    upgradeSelect: 'Upgrade:',
    deckTitle: 'Deck',
    status_str: 'STR',
    status_vuln: 'VUL',
    status_weak: 'WK',
    status_block: 'BLK',
    cost: 'Cost',
    summon: 'Summon',
    declare: 'Declare',
    sentenceLabel: 'Tap to compose',
    poemTitle: '— Battle Verses —',
    posNames: { subject:'Subject', verb:'Verb', object:'Object', modifier:'Modifier', connector:'Connector', special:'Special', punctuation:'Punct', exclamation:'Excl' },
    rarityNames: { starter:'Starter', common:'Common', uncommon:'Uncommon', rare:'Rare' },
  },
};

export function t(key) {
  const lang = getLang();
  return UI_STRINGS[lang]?.[key] ?? UI_STRINGS.zh[key] ?? key;
}

export function applyStaticI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    const v = t(k);
    if (v) el.textContent = v;
  });
}
