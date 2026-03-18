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
    startBtn: '执笔出发',
    metaBtn: '文渊阁',
    subtitle: '以词为剑，以句为盾',
    credit: '李清照 · 句子构筑者 · v7',
    chant: '吟诵',
    declare: '宣言',
    summon: '召唤',
    endTurn: '结束',
    skip: '跳过',
    deckBtn: '词库',
    energy: '文力',
    sentenceLabel: '【造句区】点击手牌或敌人卡牌构建句子',
    victory: '战胜！',
    selectCard: '选择一张新词牌：',
    gold: '文银',
    poemTitle: '— 本局诗篇 —',
    posNames: { subject:'主语', verb:'谓语', object:'宾语', modifier:'修饰', connector:'连接', special:'特殊', punctuation:'标点', exclamation:'感叹' },
    rarityNames: { starter:'初始', common:'普通', uncommon:'非凡', rare:'稀有' },
  },
  en: {
    startBtn: 'Begin',
    metaBtn: 'Archive',
    subtitle: 'Words as swords, sentences as shields',
    credit: 'Li Qingzhao · Sentence Crafter · v7',
    chant: 'Chant',
    declare: 'Declare',
    summon: 'Summon',
    endTurn: 'End',
    skip: 'Skip',
    deckBtn: 'Deck',
    energy: 'Ink',
    sentenceLabel: '[Compose] Tap cards or enemies to build a sentence',
    victory: 'Victory!',
    selectCard: 'Choose a new word card:',
    gold: 'Gold',
    poemTitle: '— Battle Verses —',
    posNames: { subject:'Subject', verb:'Verb', object:'Object', modifier:'Modifier', connector:'Connector', special:'Special', punctuation:'Punct', exclamation:'Excl' },
    rarityNames: { starter:'Starter', common:'Common', uncommon:'Uncommon', rare:'Rare' },
  },
};

export function t(key) {
  const lang = getLang();
  return UI_STRINGS[lang]?.[key] ?? UI_STRINGS.zh[key] ?? key;
}
