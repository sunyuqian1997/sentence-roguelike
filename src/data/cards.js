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
  const tryAdd = (key, n = 1) => {
    if (!WORD_DEFS[key]) return;
    for (let i = 0; i < n; i++) deck.push(makeCard({ ...WORD_DEFS[key], key }));
  };
  // 拼贴诗起始词库 — 大幅扩种，覆盖每个词性的多种语气与功能
  // 主语 (4)
  tryAdd('wo');          // 我
  tryAdd('wuming');      // 无名者
  tryAdd('yingzi');      // 影子（穿透）
  tryAdd('mao');         // 猫（随机效果）
  // 动词 - 攻击 (5)
  tryAdd('zhan');        // 斩
  tryAdd('sui');         // 碎
  tryAdd('chui');        // 锤
  tryAdd('kan');         // 砍
  tryAdd('cu');          // 戳
  // 动词 - 防守 (3)
  tryAdd('shou');        // 守
  tryAdd('chen');        // 沉
  tryAdd('dang');        // 挡
  // 动词 - 治疗/回血 (2)
  tryAdd('piaofu');      // 漂
  tryAdd('moyu');        // 摸鱼
  // 宾语 (4)
  tryAdd('hai');         // 海
  tryAdd('huijin');      // 灰烬
  tryAdd('guge');        // 骨
  tryAdd('yueliang');    // 月亮
  // 修饰 (3)
  tryAdd('chaoshide');   // 潮湿地
  tryAdd('shuaiqide');   // 帅气地
  tryAdd('menglie');     // 猛烈地
  // 连接 (2)
  tryAdd('er');          // 而
  tryAdd('he');          // 和
  // 感叹 (2)
  tryAdd('oh');          // 哦
  tryAdd('ah');          // 啊
  // 标点 (3)
  tryAdd('comma', 2);    // ，×2
  tryAdd('period');      // 。
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
