// Sentence-level constructions (句式) — the first-class abstraction for
// grammar patterns that reassign semantic roles, e.g. the imperative
// "纸鬼给我戳" (the enemy is ORDERED to stab itself).
//
// Each construction: { id, label, detect(ctx) → match|null, apply(ctx, match) }
// detect() runs on ctx.cards (meanings already resolved — a construction can
// anchor on a card's _activeMeaning, single source of truth with meanings.js).
// apply() may:
//   - write structured payloads to ctx.effects (resolved in finalize/applyEffects)
//   - push ctx.grammarNotes (constructions are syntax achievements)
//   - multiply ctx.constructionGrammarMult (folded into grammarMult later)
//   - set ctx.forceSubjectIsEnemy for VERB_SPECIALS dual-mode verbs
//
// To add a construction (把字句/被字句/叠词…): push an entry here. Detection
// conventions: modifiers may sit between constituents (≤2), commas end clauses.

const isMeCard = (c) =>
  !!(c && (c._isSelfTarget || c._isFixedWo || (c.pos === 'subject' && c.word === '我')));

// Walk forward from index, skipping ≤maxMods modifiers; return verb index or -1.
function verbAfter(cards, from, maxMods = 2) {
  let mods = 0;
  for (let k = from; k < cards.length; k++) {
    const c = cards[k];
    if (!c) return -1;
    if (c.pos === 'modifier' && mods < maxMods) { mods++; continue; }
    return (c.pos === 'verb' || c.pos === 'special') ? k : -1;
  }
  return -1;
}

export const CONSTRUCTIONS = [
  {
    // 给我V imperative: [敌NP] 给 我 [修饰≤2] V [敌NP]
    //   command (敌NP before 给):  enemy executes V on ITSELF — ×1.4, pierces
    //   benefactive (敌NP after V): "给我上！" — grammar boost only
    //   unnamed (no 敌NP):          random enemy obeys — no ×1.4 (没点名)
    id: 'gei_imperative',
    label: '🫵 祈使·给我V',
    detect(ctx) {
      const cards = ctx.cards;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || !c._activeMeaning || c._activeMeaning.id !== 'gei_imperative') continue;
        if (!isMeCard(cards[i + 1])) continue;
        const verbIdx = verbAfter(cards, i + 2);
        if (verbIdx < 0) continue;

        // Enemy NP commanded — nearest enemy-target before 给 (modifiers ok)
        let enemyIdx = -1;
        for (let b = i - 1; b >= 0; b--) {
          const bc = cards[b];
          if (!bc) break;
          if (bc.pos === 'modifier') continue;
          if (bc._isEnemyTarget) enemyIdx = bc._enemyIdx;
          break;
        }
        // Enemy NP after the verb → benefactive ("给我戳纸鬼")
        let enemyAfter = -1;
        for (let a = verbIdx + 1; a < cards.length; a++) {
          const ac = cards[a];
          if (!ac) break;
          if (ac.pos === 'punctuation' || ac.pos === 'exclamation') continue;
          if (ac._isEnemyTarget) enemyAfter = ac._enemyIdx;
          break;
        }
        const variant = enemyIdx >= 0 ? 'command' : (enemyAfter >= 0 ? 'benefactive' : 'unnamed');
        return { variant, enemyIdx, verbIdx };
      }
      return null;
    },
    apply(ctx, m) {
      ctx.constructionGrammarMult *= 1.15;
      if (m.variant === 'command') {
        ctx.effects._imperative = { enemyIdx: m.enemyIdx, mult: 1.4, ignoreBlock: true };
        ctx.forceSubjectIsEnemy = true;
        ctx.grammarNotes.push('🫵 祈使句·军令如山 ×1.15 — 敌自受其刃 ×1.4穿透');
      } else if (m.variant === 'unnamed') {
        ctx.effects._imperative = { enemyIdx: -1, mult: 1.0, ignoreBlock: true };
        ctx.forceSubjectIsEnemy = true;
        ctx.grammarNotes.push('🫵 无名军令 ×1.15 — 随机敌人遵命自伤');
      } else {
        ctx.grammarNotes.push('🫵 祈使句·给我上！×1.15');
      }
    },
  },
  {
    // 兼语句: 让/叫 + 敌NP + [修饰≤2] V — softer command, no pierce
    id: 'rang_jianyu',
    label: '🪢 兼语·让NP V',
    detect(ctx) {
      const cards = ctx.cards;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || c.pos !== 'connector' || (c.word !== '让' && c.word !== '叫')) continue;
        const np = cards[i + 1];
        if (!np || !np._isEnemyTarget) continue;
        const verbIdx = verbAfter(cards, i + 2);
        if (verbIdx < 0) continue;
        return { enemyIdx: np._enemyIdx, verbIdx };
      }
      return null;
    },
    apply(ctx, m) {
      ctx.constructionGrammarMult *= 1.1;
      ctx.effects._imperative = { enemyIdx: m.enemyIdx, mult: 1.2, ignoreBlock: false };
      ctx.forceSubjectIsEnemy = true;
      ctx.grammarNotes.push('🪢 兼语句·委婉号令 ×1.1 — 敌自受 ×1.2');
    },
  },
];

export function applyConstructions(ctx) {
  ctx.constructions = [];
  for (const con of CONSTRUCTIONS) {
    const m = con.detect(ctx);
    if (!m) continue;
    ctx.constructions.push({ id: con.id, match: m });
    con.apply(ctx, m);
  }
}
