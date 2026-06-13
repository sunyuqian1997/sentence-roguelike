// Node-runnable evaluator battery (no browser needed).
// Usage: node test-eval.node.mjs
// Imports evaluator/index.js directly — the evaluator is DOM-free by design.
import { readFileSync } from 'node:fs';

const { G } = await import('./src/game/state.js');
const { evaluateSentence } = await import('./src/game/evaluator/index.js');

const raw = JSON.parse(readFileSync(new URL('./src/data/cards.json', import.meta.url), 'utf8'));

function makeSeededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function resetG() {
  G.enemies = [
    { name: '纸鬼', hp: 30, maxHp: 30, tags: ['paper', 'ghost'], block: 0 },
    { name: '残句怪', hp: 25, maxHp: 25, tags: ['word', 'fragment'], block: 0 },
  ];
  G.strength = 1; G.weak = 0; G.vulnerable = 0;
  G.gold = 50; G.hand = []; G.maxHp = 50; G.hp = 40;
  G.poeticAura = false; G.lastRhymeKey = null; G.rhymeStreak = 0;
  G.sentence = [];
}

let uid = 0;
const mk = (key) => {
  if (!raw[key]) throw new Error('no card: ' + key);
  return { ...raw[key], key, upgraded: false, id: 'c' + (uid++) };
};
const enemyTarget = (idx, word) => ({ word, pos: 'object', cost: 0, _isEnemyTarget: true, _enemyIdx: idx, id: 't' + idx });
const selfTarget = () => ({ word: '我', pos: 'subject', cost: 0, _isSelfTarget: true, id: 'self' });

const CASES = [
  { name: 'svo_attack_period', cards: () => [mk('wo'), mk('zhan'), enemyTarget(0, '纸鬼'), mk('period')] },
  { name: 'defense_simple', cards: () => [mk('wo'), mk('shou'), mk('period')] },
  { name: 'pun_enemy_gei', cards: () => [enemyTarget(0, '纸鬼'), mk('shi_copula'), mk('gei')] },
  { name: 'pun_broadcast', cards: () => [mk('huangdi'), mk('ni'), mk('erzi'), mk('shi_copula'), mk('gei')] },
  { name: 'pun_self', cards: () => [mk('wo'), mk('shi_copula'), mk('gei')] },
  { name: 'lao_adverb_meaning', cards: () => [mk('wo'), mk('lao'), mk('zhan'), enemyTarget(0, '纸鬼')] },
  { name: 'lao_pun_after_copula', cards: () => [enemyTarget(0, '纸鬼'), mk('shi_copula'), mk('lao')] },
  { name: 'ri_with_verb', cards: () => [mk('wo'), mk('ri'), enemyTarget(0, '纸鬼')] },
  { name: 'modifier_attack', cards: () => [mk('wo'), mk('menglie'), mk('zhan'), enemyTarget(0, '纸鬼')] },
  { name: 'motif_soak', cards: () => [mk('wo'), mk('chen'), mk('hai')] },
  { name: 'moyu_self', cards: () => [mk('wo'), mk('moyu')] },
  { name: 'moyu_enemy', cards: () => [mk('moyu'), enemyTarget(0, '纸鬼')] },
  { name: 'declaration', cards: () => [mk('wo'), mk('ah')] },
  { name: 'exclamation_attack', cards: () => [mk('wo'), mk('zhan'), enemyTarget(0, '纸鬼'), mk('ah'), mk('period')] },
  { name: 'compound_comma', cards: () => [mk('wo'), mk('zhan'), mk('hai'), mk('comma'), mk('wo'), mk('shou'), mk('yueliang')] },
  { name: 'five_char', cards: () => [mk('wo'), mk('zhan'), mk('yueliang'), mk('huijin')] },
  { name: 'connector_he_multi', cards: () => [mk('wo'), mk('zhan'), enemyTarget(0, '纸鬼'), mk('he'), enemyTarget(1, '残句怪')] },
  { name: 'self_target_harm', cards: () => [mk('wo'), mk('zhan'), selfTarget()] },
  { name: 'rhyme_streak', pre: () => { G.lastRhymeKey = 'ai'; G.rhymeStreak = 1; }, cards: () => [mk('wo'), mk('zhan'), mk('hai')] },
  { name: 'no_verb_junk', cards: () => [mk('hai'), mk('yueliang')] },
  { name: 'question_weaken', cards: () => [mk('wo'), mk('zhan'), enemyTarget(0, '纸鬼'), mk('question')] },
  // ---- identity system (Baba-is-you style) ----
  { name: 'identity_enemy_is_cat', cards: () => [enemyTarget(0, '纸鬼'), mk('shi_copula'), mk('mao')] },
  { name: 'identity_enemy_is_shadow', cards: () => [enemyTarget(0, '纸鬼'), mk('shi_copula'), mk('yingzi')] },
  { name: 'identity_self_is_cat', cards: () => [mk('wo'), mk('shi_copula'), mk('mao')] },
  { name: 'identity_self_is_shadow', cards: () => [mk('wo'), mk('shi_copula'), mk('yingzi')] },
  { name: 'identity_claim_emperor', cards: () => [mk('huangdi'), mk('shi_copula'), mk('wo')] },
  { name: 'identity_mimic_enemy', cards: () => [mk('wo'), mk('shi_copula'), enemyTarget(0, '纸鬼')] },
  { name: 'forbidden_enemy_is_me', cards: () => [enemyTarget(0, '纸鬼'), mk('shi_copula'), mk('wo')] },
  { name: 'tautology_i_am_i', cards: () => [mk('wo'), mk('shi_copula'), mk('wo')] },
  { name: 'enemy_subject_hits_me', cards: () => [enemyTarget(0, '纸鬼'), mk('sui'), selfTarget()] },
  { name: 'enemy_subject_hits_me_fixedwo', cards: () => [enemyTarget(0, '纸鬼'), mk('sui'), { ...raw['wo'], key: 'wo', _isFixedWo: true, id: 'fw' }] },
  // ---- constructions (句式) ----
  { name: 'imperative_command', cards: () => [enemyTarget(0, '纸鬼'), mk('gei'), mk('wo'), mk('cu')] },
  { name: 'imperative_with_modifier', cards: () => [enemyTarget(0, '纸鬼'), mk('gei'), mk('wo'), mk('menglie'), mk('cu')] },
  { name: 'imperative_unnamed', cards: () => [mk('gei'), mk('wo'), mk('cu')] },
  { name: 'imperative_benefactive', cards: () => [mk('gei'), mk('wo'), mk('cu'), enemyTarget(0, '纸鬼')] },
  { name: 'imperative_special_verb', cards: () => [enemyTarget(0, '纸鬼'), mk('gei'), mk('wo'), mk('moyu')] },
  { name: 'gei_default_verb', cards: () => [mk('wo'), mk('gei')] },
  { name: 'jianyu_rang', cards: () => [mk('rang'), enemyTarget(0, '纸鬼'), mk('zhan')] },
  { name: 'baseline_wo_cu_enemy', cards: () => [mk('wo'), mk('cu'), enemyTarget(0, '纸鬼')] },
];

const results = {};
let failures = 0;
for (const c of CASES) {
  try {
    resetG();
    Math.random = makeSeededRandom(42);
    if (c.pre) c.pre();
    const r = evaluateSentence(c.cards());
    results[c.name] = {
      text: r.text,
      mults: `g${r.grammarMult.toFixed(2)} l${r.literaryMult.toFixed(2)} p${r.punctMult.toFixed(2)} → ×${r.totalMult.toFixed(2)}`,
      dmg: r.effects.damage, block: r.effects.block, heal: r.effects.heal,
      selfHarm: r.effects.selfHarm ? r.effects.selfHarmDmg + (r.effects.selfHarmBuff ? `(+${r.effects.selfHarmBuff}力)` : '') : 0,
      notes: [...r.grammarNotes, ...r.literaryNotes, ...r.punctNotes, ...r.excNotes].join(' | '),
      predicates: (r.effects._predicates || []).map(p => `${p.kind}:${p.target}:${p.identityWord || (p.pun && p.pun.tag) || ''}`).join(','),
      motifs: (r.effects._motifTriggers || []).map(t => t.motif.id).join(','),
      imperative: r.effects._imperative ? `enemy${r.effects._imperative.enemyIdx} x${r.effects._imperative.mult}${r.effects._imperative.ignoreBlock ? ' pierce' : ''}` : '',
      target: r.effects.targetEnemyIdx,
      pierce: !!r.effects.ignoreBlock,
    };
  } catch (e) {
    failures++;
    results[c.name] = { ERROR: String(e && e.stack || e).slice(0, 400) };
  }
}
console.log(JSON.stringify(results, null, 1));
console.log(failures === 0 ? '\nALL ' + CASES.length + ' CASES RAN WITHOUT ERROR' : '\n' + failures + ' CASES THREW');
