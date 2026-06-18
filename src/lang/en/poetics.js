// English poetic-scoring module — the en analog of zh/rules/quality.js +
// zh/rules/punctuation.js#detectDuizhang. The Chinese version rewards
// 对仗/押韵/谐音; English rewards its own native devices:
//
//   • Alliteration   — body words sharing the same initial consonant sound
//   • End rhyme       — last words of comma-clauses rhyme (+ cross-sentence streak)
//   • Balanced meter  — comma-clauses with equal syllable counts (≈ 五言/七言整齐)
//   • Iambic length   — pleasing total syllable targets (5/7/10) (≈ 五言×1.3/七言×1.5)
//
// Magnitudes mirror the Chinese ones so combat balance carries over:
//   alliteration ~+0.3..+0.8, rhyme +0.4..+0.8, meter ×1.3..1.5, parallel ×1.5..3.0.
//
// Each rule is { id, apply(ctx) } and bumps ctx.literaryMult / pushes
// ctx.literaryNotes / writes ctx.effects._rhymeInfo — same protocol as zh.
import { G } from '../../game/state.js';

// ---------- low-level English phonetic helpers ----------

const VOWELS = 'aeiou';

// Normalize a word: lowercase, strip anything that isn't a letter.
function clean(word) {
  return String(word || '').toLowerCase().replace(/[^a-z]/g, '');
}

// Rough syllable counter: count vowel GROUPS, drop a silent trailing 'e',
// floor at 1 for any non-empty word. Not linguistically perfect, just a
// stable heuristic for balance/meter scoring.
export function countSyllables(word) {
  let w = clean(word);
  if (!w) return 0;
  // silent trailing e ("slave", "fight"->no, "night"->no) — only when it
  // wouldn't leave the word vowel-less.
  if (w.length > 2 && w.endsWith('e') && !VOWELS.includes(w[w.length - 2])) {
    w = w.slice(0, -1);
  }
  const groups = w.match(/[aeiouy]+/g);
  let n = groups ? groups.length : 0;
  if (n === 0) n = 1; // e.g. "rhythm"-ish fallbacks
  return n;
}

// First-consonant-sound key for alliteration. We approximate by first letter,
// case-insensitive. Vowel-initial words are treated as WEAK (return null) so
// "apple ace" doesn't count as alliteration — matching the brief.
export function alliterationKey(word) {
  const w = clean(word);
  if (!w) return null;
  const c = w[0];
  if (VOWELS.includes(c)) return null; // vowels-as-weak → ignore
  return c;
}

// Rhyme key of a single word: trailing vowel-cluster onward.
//   "night" -> "ight", "fight" -> "ight", "might" -> "ight"
//   "glory" -> "y"? no — last vowel group + trailing consonants:
//   we take from the LAST vowel group to the end. "glory" -> "ory".
export function rhymeKeyEn(word) {
  const w = clean(word);
  if (!w) return null;
  // find start index of the last vowel group
  let i = w.length - 1;
  // walk back over trailing consonants
  while (i >= 0 && !VOWELS.includes(w[i]) && w[i] !== 'y') i--;
  if (i < 0) return w; // no vowel at all → whole word is its own key
  // now w[i] is part of the last vowel group; walk back over the vowel group
  let start = i;
  while (start - 1 >= 0 && (VOWELS.includes(w[start - 1]) || w[start - 1] === 'y')) start--;
  return w.slice(start);
}

// ---------- clause splitting ----------

// Split body (non-punctuation) words into clauses at commas, in card order.
// Returns array of clauses; each clause is an array of word strings.
function splitClausesByComma(cards) {
  const clauses = [];
  let cur = [];
  for (const c of cards) {
    if (c.pos === 'punctuation' && c.punctType === 'comma') {
      clauses.push(cur);
      cur = [];
    } else if (c.pos !== 'punctuation' && c.pos !== 'exclamation') {
      cur.push(c.word);
    }
  }
  clauses.push(cur);
  return clauses.filter(cl => cl.length > 0);
}

function bodyWords(ctx) {
  return ctx.nonPunctCards.map(c => c.word);
}

function lastWord(clause) {
  return clause.length ? clause[clause.length - 1] : null;
}

function syllablesOf(clause) {
  return clause.reduce((sum, w) => sum + countSyllables(w), 0);
}

// ---------- rhyme export (en analog of zh getRhymeKey/checkRhyme) ----------

export const rhymeEn = {
  // text is the space-joined sentence; key off its last word.
  getRhymeKey(text) {
    if (!text) return null;
    const words = String(text).trim().split(/\s+/).filter(Boolean);
    for (let i = words.length - 1; i >= 0; i--) {
      const k = rhymeKeyEn(words[i]);
      if (k) return k;
    }
    return null;
  },
  checkRhyme(a, b) {
    if (!a || !b) return { rhymes: false, key: a, prevKey: b };
    return { rhymes: a === b, key: a, prevKey: b };
  },
};

// ---------- parallel-couplet detection (en analog of detectDuizhang) ----------
//
// Same return SHAPE as detectDuizhang so settle.js's 「对」-card logic
// (`matched && type !== 'basic'`) works unchanged for English:
//   { text1, text2, len1, len2, matched, type, multiplier, label }
//   type ∈ 'none' | 'basic' | 'couplet' | 'meter' | 'perfect'
export function detectParallelEn(cards) {
  const commaIdx = cards.findIndex(c => c.pos === 'punctuation' && c.punctType === 'comma');
  if (commaIdx < 0) return null;

  const firstHalf = cards.slice(0, commaIdx)
    .filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');
  const secondHalf = cards.slice(commaIdx + 1)
    .filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation'
      && !c._isEnemyTarget && !c._isSelfTarget);

  if (firstHalf.length === 0 || secondHalf.length === 0) return null;

  const words1 = firstHalf.map(c => c.word);
  const words2 = secondHalf.map(c => c.word);
  const text1 = words1.join(' ');
  const text2 = words2.join(' ');
  const len1 = words1.length; // English uses WORD COUNT (≈ zh 字数)
  const len2 = words2.length;

  const result = { text1, text2, len1, len2, matched: false, type: 'none', multiplier: 1.1 };

  if (len1 !== len2) {
    result.label = '✗ Uneven clauses (word counts differ)';
    return result;
  }

  result.matched = true;

  // Two ways for equal-length clauses to rise above "basic":
  //   • shared alliteration across the clauses (the two final/any words ring),
  //   • equal syllable totals → balanced meter.
  const syl1 = syllablesOf(words1);
  const syl2 = syllablesOf(words2);
  const sameMeter = syl1 === syl2;

  // Alliteration shared between clauses: same dominant initial consonant.
  const a1 = words1.map(alliterationKey).filter(Boolean);
  const a2 = words2.map(alliterationKey).filter(Boolean);
  const sharedAllit = a1.length > 0 && a2.length > 0 && a1.some(k => a2.includes(k));

  if (sameMeter && sharedAllit) {
    result.type = 'perfect'; result.multiplier = 2.5;
    result.label = `✓ Perfect couplet! Matched meter + alliteration ×2.5`;
    return result;
  }
  if (sharedAllit) {
    result.type = 'couplet'; result.multiplier = 2.0;
    result.label = `✓ Alliterative couplet ×2.0`;
    return result;
  }
  if (sameMeter) {
    result.type = 'meter'; result.multiplier = 2.0;
    result.label = `✓ Balanced meter (${syl1} syllables each) ×2.0`;
    return result;
  }

  // Equal word count but nothing else lyrical → basic.
  result.type = 'basic'; result.multiplier = 1.5;
  result.label = `✓ Even clauses (same word count) ×1.5`;
  return result;
}

// ---------- quality rules ----------

export const QUALITY_RULES_EN = [
  {
    // Alliteration: 2+ body words sharing the same initial consonant sound.
    // Scales by how many alliterate. ~+0.3 (pair) up to +0.8 (4+).
    id: 'alliteration',
    apply(ctx) {
      const words = bodyWords(ctx);
      const counts = {};
      for (const w of words) {
        const k = alliterationKey(w);
        if (k) counts[k] = (counts[k] || 0) + 1;
      }
      // best alliterating cluster
      let bestKey = null, best = 0;
      for (const k in counts) {
        if (counts[k] > best) { best = counts[k]; bestKey = k; }
      }
      if (best < 2) return;
      // +0.3 for 2, +0.5 for 3, +0.8 for 4+
      let bonus;
      if (best >= 4) bonus = 0.8;
      else if (best === 3) bonus = 0.5;
      else bonus = 0.3;
      ctx.literaryMult += bonus;
      ctx.literaryNotes.push(`🔁 Alliteration ×${best} (${bestKey}-) +${bonus}`);
    },
  },
  {
    // End rhyme across comma clauses: if the last words of two clauses rhyme,
    // reward the couplet. Also tracks cross-sentence rhyme streaks via G,
    // mirroring zh quality.js 'rhyme' (single +0.4 / streak2 +0.6 / streak3+ +0.8).
    id: 'rhyme',
    apply(ctx) {
      const clauses = splitClausesByComma(ctx.cards);

      // (a) intra-sentence end rhyme between comma clauses
      let intraRhyme = false;
      if (clauses.length >= 2) {
        const keys = clauses.map(cl => rhymeKeyEn(lastWord(cl))).filter(Boolean);
        for (let i = 0; i < keys.length && !intraRhyme; i++) {
          for (let j = i + 1; j < keys.length; j++) {
            if (keys[i] === keys[j]) { intraRhyme = true; break; }
          }
        }
        if (intraRhyme) {
          ctx.literaryMult += 0.4;
          ctx.literaryNotes.push('🎵 End rhyme (rhyming couplet) +0.4');
        }
      }

      // (b) cross-sentence rhyme streak — key off the whole sentence's last word.
      const key = rhymeEn.getRhymeKey(ctx.text);
      const info = { rhymes: false, key, prevKey: G.lastRhymeKey || null, streak: 0 };
      if (key && G.lastRhymeKey && rhymeEn.checkRhyme(key, G.lastRhymeKey).rhymes) {
        const streak = (G.rhymeStreak || 0) + 1;
        info.rhymes = true;
        info.streak = streak;
        if (streak >= 3) { ctx.literaryMult += 0.8; ctx.literaryNotes.push(`🎵 Triple rhyme! +0.8 (×${streak})`); }
        else if (streak >= 2) { ctx.literaryMult += 0.6; ctx.literaryNotes.push(`🎵 Rhyme streak +0.6 (×${streak})`); }
        else { ctx.literaryMult += 0.4; ctx.literaryNotes.push('🎵 Cross-line rhyme +0.4'); }
      }
      ctx.effects._rhymeInfo = info;
    },
  },
  {
    // Balanced meter: comma-split clauses with equal syllable counts.
    // English analog of 五言/七言整齐. ×1.3 (2 clauses) up to ×1.5 (3+).
    id: 'meter',
    apply(ctx) {
      const clauses = splitClausesByComma(ctx.cards);
      if (clauses.length < 2) return;
      const sylls = clauses.map(syllablesOf);
      const allEqual = sylls.every(s => s === sylls[0] && s > 0);
      if (!allEqual) return;
      const mult = clauses.length >= 3 ? 1.5 : 1.3;
      ctx.literaryMult *= mult;
      ctx.literaryNotes.push(`⚖️ Balanced meter (${sylls[0]} syllables ×${clauses.length}) ×${mult}`);
    },
  },
  {
    // Iambic-ish length bonus: total syllable count hitting pleasing targets.
    // 5 → ×1.3 (≈五言), 7 → ×1.4, 10 → ×1.5 (iambic pentameter). Single sentences
    // only (skip if a comma already split it — meter rule handles those).
    id: 'iambic_length',
    apply(ctx) {
      const total = syllablesOf(bodyWords(ctx));
      let mult = 1.0, label = null;
      if (total === 10) { mult = 1.5; label = '🪶 Iambic pentameter (10 syllables) ×1.5'; }
      else if (total === 7) { mult = 1.4; label = '🪶 Heptasyllabic line (7 syllables) ×1.4'; }
      else if (total === 5) { mult = 1.3; label = '🪶 Pentasyllabic line (5 syllables) ×1.3'; }
      if (mult > 1.0) { ctx.literaryMult *= mult; ctx.literaryNotes.push(label); }
    },
  },
  {
    // Poetic aura + long-line bonus — straight mirror of zh 'poetic_aura'.
    id: 'poetic_aura',
    apply(ctx) {
      if (G.poeticAura) { ctx.literaryMult += 0.5; ctx.literaryNotes.push('Poet possessed!'); }
      if (ctx.cards.length >= 5) { ctx.literaryMult += 0.2; ctx.literaryNotes.push('Long line +0.2'); }
    },
  },
  {
    // Weaken on questions — mirror of zh 'question_weaken'.
    id: 'question_weaken',
    apply(ctx) {
      if (ctx.hasQuestion) ctx.effects.applyWeak = 2;
    },
  },
  {
    // Poetic crit — must stay LAST so it reads the accumulated literaryMult.
    // Mirror of zh 'poetic_crit': ≥3.0 → ×1.5 crit.
    id: 'poetic_crit',
    apply(ctx) {
      if (ctx.literaryMult >= 3.0) {
        ctx.effects._crit = true;
        ctx.effects._poeticCrit = true;
        ctx.literaryNotes.push('⚡ A poem to move the gods! ×1.5 crit');
      }
    },
  },
];

export function applyQualityEn(ctx) {
  for (const rule of QUALITY_RULES_EN) rule.apply(ctx);
}
