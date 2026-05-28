import { META } from '../game/state.js';
import { isEn } from '../i18n.js';
import rawCards from './cards.json';

function resolveDesc(template, def) {
  if (!template) return '';
  if (!template.includes('{')) return template;
  return (card) => {
    const power = card.upgraded ? (def.upgPower ?? def.basePower) : def.basePower;
    return template.replace(/\{power\}/g, power);
  };
}

export const WORD_DEFS = {};
for (const [key, raw] of Object.entries(rawCards)) {
  const desc = resolveDesc(raw.desc, raw);
  const enDesc = raw.en ? resolveDesc(raw.en.desc, raw) : desc;
  WORD_DEFS[key] = { ...raw, desc, enDesc, enWord: raw.en?.word ?? raw.word };
}

export function getCardWord(card) {
  return isEn() ? (card.enWord ?? card.word) : card.word;
}

export function getCardDesc(card) {
  if (isEn()) {
    const d = card.enDesc ?? card.desc;
    return typeof d === 'function' ? d(card) : d;
  }
  return typeof card.desc === 'function' ? card.desc(card) : (card.desc || '');
}

export function makeCard(def) {
  return { ...def, upgraded: false, id: Math.random().toString(36).substr(2, 9) };
}

export function createStarterDeck() {
  const deck = [];
  const add = (key, n) => {
    for (let i = 0; i < n; i++) deck.push(makeCard({ ...WORD_DEFS[key], key }));
  };
  // 拼贴诗起始词库：保留功能骨架（攻/防/治/连接/感叹/标点），
  // 用碎片意象替换原本偏口语的部分。整体气质：断裂、意象密度高、像剪报粘起来的诗。
  add('wo', 1);          // 主语·我
  add('wuming', 1);      // 主语·无名者（她没有名字，所以她是所有人）
  add('yingzi', 1);      // 主语·影子（穿透格挡）
  add('zhan', 1);        // 动词·斩
  add('sui', 1);         // 动词·碎（玻璃落地的那一秒）
  add('shou', 1);        // 动词·守
  add('chen', 1);        // 动词·沉（向海底，向更深的海底）
  add('piaofu', 1);      // 动词·漂（在两次呼吸之间）
  add('hai', 1);         // 宾语·海（盐，又一遍的盐）
  add('huijin', 1);      // 宾语·灰烬（燃烧之后剩下的，全部）
  add('guge', 1);        // 宾语·骨（也是最后一根）
  add('chaoshide', 1);   // 修饰·潮湿地（雨后第三天的报纸）
  add('er', 1);          // 连接·而（雪而不是雨，铁而不是糖）
  add('oh', 1);          // 感叹·哦（像突然认出陌生人）
  add('comma', 2);       // 标点·，×2
  add('period', 1);      // 标点·。
  return deck;
}

export function getCardPool(rarity) {
  const pool = [];
  for (const [key, def] of Object.entries(WORD_DEFS)) {
    if (def.rarity !== rarity) continue;
    if (key === 'wo') continue;
    if (def.unlockable && !META.unlockedCards.includes(key)) continue;
    if (def.pack && !META.unlockedPacks?.includes(def.pack)) continue;
    pool.push(key);
  }
  return pool;
}

export function randomCard(rarity) {
  const pool = getCardPool(rarity);
  if (pool.length === 0) return makeCard({ ...WORD_DEFS.wo, key: 'wo' });
  const key = pool[Math.floor(Math.random() * pool.length)];
  return makeCard({ ...WORD_DEFS[key], key });
}

const CATEGORY_WEIGHTS = [
  ['attackVerb', 0.22], ['utilVerb', 0.12], ['exclamation', 0.15], ['modifier', 0.10],
  ['object', 0.08], ['subject', 0.18], ['punctuation', 0.06], ['connector', 0.04], ['other', 0.05],
];

function categorize(key) {
  const d = WORD_DEFS[key];
  if (d.pos === 'verb' && d.combatType === 'attack') return 'attackVerb';
  if (d.pos === 'verb') return 'utilVerb';
  if (d.pos === 'exclamation') return 'exclamation';
  if (d.pos === 'modifier') return 'modifier';
  if (d.pos === 'object') return 'object';
  if (d.pos === 'subject') return 'subject';
  if (d.pos === 'punctuation') return 'punctuation';
  if (d.pos === 'connector') return 'connector';
  return 'other';
}

export function randomCardWeighted(rarity) {
  const pool = getCardPool(rarity);
  if (pool.length === 0) return makeCard({ ...WORD_DEFS.wo, key: 'wo' });

  const buckets = {};
  pool.forEach(key => {
    const cat = categorize(key);
    (buckets[cat] ??= []).push(key);
  });

  const active = CATEGORY_WEIGHTS
    .filter(([cat]) => buckets[cat]?.length > 0)
    .map(([cat, w]) => [buckets[cat], w]);

  const totalW = active.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * totalW;
  let chosen = active[0][0];
  for (const [arr, w] of active) {
    r -= w;
    if (r <= 0) { chosen = arr; break; }
  }

  const key = chosen[Math.floor(Math.random() * chosen.length)];
  return makeCard({ ...WORD_DEFS[key], key });
}
