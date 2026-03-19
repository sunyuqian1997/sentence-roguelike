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
  add('zhan', 1);
  add('chui', 1);
  add('gei', 1);
  add('shou', 1);
  add('gang', 1);
  add('diren', 1);
  add('shijie', 1);
  add('laozi', 1);
  add('dajia', 1);
  add('shuaiqide', 1);
  add('menglie', 1);
  add('he', 1);
  add('jiu', 1);
  add('wocao', 1);
  add('ba2', 1);
  add('le', 1);
  add('comma', 2);
  add('exclamation_punct', 1);
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
