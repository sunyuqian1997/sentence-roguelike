import { G, META } from '../game/state.js';
import { isEn } from '../i18n.js';
import zhCards from './cards.json';
import enCards from '../lang/en/cards.json';
import { STARTER_DECK_KEYS, draftRewardKeys, isCardAvailableAtFloor } from './deckProgression.js';

// 语言切换会 reload 页面,故在模块加载期按当前语言选卡库即可。
// 英文版用 en 卡库;卡面/句子评估都走对应语言。
const rawCards = isEn() ? enCards : zhCards;

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

// 自指主语卡(我/I)的 key,按语言查 —— zh 用 'wo',en 用 concept 'subject_self'。
export function getSelfCardKey() {
  if (WORD_DEFS.wo) return 'wo';
  const k = Object.keys(WORD_DEFS).find(key => WORD_DEFS[key].concept === 'subject_self');
  return k || 'i';
}

export function createStarterDeck() {
  const deck = [];
  const tryAdd = (key, n = 1) => {
    if (!WORD_DEFS[key]) return;
    for (let i = 0; i < n; i++) deck.push(makeCard({ ...WORD_DEFS[key], key }));
  };
  // 英文起手牌:用 en 卡库的 key(完全不同于中文)。覆盖各词性可造句。
  if (isEn()) {
    ['i','knight','cat','monk'].forEach(k => tryAdd(k));            // subjects
    ['slay','strike','smite','poke','lash'].forEach(k => tryAdd(k)); // attack
    ['guard','block','brace'].forEach(k => tryAdd(k));               // defense
    ['mend','patch'].forEach(k => tryAdd(k));                        // heal
    ['enemy','moon','dragon','heavens'].forEach(k => tryAdd(k));     // objects
    ['fiercely','silently','calmly'].forEach(k => tryAdd(k));        // modifiers
    tryAdd('and'); tryAdd('or'); tryAdd('is', 2);                    // connectors (copula ×2)
    ['alas','wow','oh'].forEach(k => tryAdd(k));                     // exclamations
    tryAdd('comma', 2); tryAdd('period');                           // punctuation
    return deck;
  }
  STARTER_DECK_KEYS.forEach((key) => tryAdd(key));
  return deck;
}

export function getCardPool(rarity) {
  const pool = [];
  for (const [key, def] of Object.entries(WORD_DEFS)) {
    if (def.rarity !== rarity) continue;
    if (key === 'wo') continue;
    if (def.unlockable && !META.unlockedCards.includes(key)) continue;
    if (def.pack && !META.unlockedPacks?.includes(def.pack)) continue;
    if (!isCardAvailableAtFloor(key, G.floorsCleared || 0)) continue;
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

export function randomCardWeighted(rarity, options = {}) {
  const excluded = new Set(options.excludeKeys || []);
  const pool = getCardPool(rarity).filter(key => !excluded.has(key));
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

/**
 * Build post-battle choices that are useful with the current deck.
 * Syntax lessons occupy their own slot in combat.js; these choices provide
 * vocabulary, role balance, and stylistic variation without duplicate keys.
 */
export function draftRewardCards({
  deck = G.deck,
  floor = G.floorsCleared || 0,
  count = 3,
  excludeKeys = [],
  rng = Math.random,
} = {}) {
  return draftRewardKeys({
    definitions: WORD_DEFS,
    deck,
    floor,
    count,
    excludeKeys,
    selfKey: getSelfCardKey(),
    rng,
    isEligible(key, def) {
      if (def.unlockable && !META.unlockedCards.includes(key)) return false;
      return !(def.pack && !META.unlockedPacks?.includes(def.pack));
    },
  }).map((choice) => ({
    ...choice,
    card: makeCard({ ...WORD_DEFS[choice.key], key: choice.key }),
  }));
}
