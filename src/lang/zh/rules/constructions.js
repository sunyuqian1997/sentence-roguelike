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
  {
    // 驱虎吞狼: [敌A NP] + [修饰≤2] V(攻击) + [敌B NP],A≠B —— 敌名卡当主语,
    // 驱使敌人 A 去打敌人 B("纸鬼碎残句怪")。伤害重定向到宾语 B(settle 消费
    // _enemyVsEnemy),A 只负责出手的小剧场(puppets.playEnemyVsEnemyAnim)。
    // 检测在 gei_imperative 之后:「纸鬼给我戳」由祈使句先接走,互不抢。
    id: 'enemy_vs_enemy',
    label: '🐯 驱虎吞狼',
    detect(ctx) {
      const cards = ctx.cards;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || !c._isEnemyTarget) continue;
        const verbIdx = verbAfter(cards, i + 1);
        if (verbIdx < 0) continue;
        // 谓语后第一个实词若是另一个敌人 → 命中句式
        let mods = 0;
        for (let a = verbIdx + 1; a < cards.length; a++) {
          const ac = cards[a];
          if (!ac) break;
          if (ac.pos === 'modifier' && mods < 2) { mods++; continue; }
          if (ac.pos === 'punctuation' || ac.pos === 'exclamation') continue;
          if (ac._isEnemyTarget && ac._enemyIdx !== c._enemyIdx) {
            return { srcIdx: c._enemyIdx, dstIdx: ac._enemyIdx,
                     srcWord: c.word, dstWord: ac.word, verbIdx };
          }
          break;
        }
      }
      return null;
    },
    apply(ctx, m) {
      ctx.constructionGrammarMult *= 1.15;
      ctx.effects._enemyVsEnemy = {
        srcIdx: m.srcIdx, dstIdx: m.dstIdx, srcWord: m.srcWord, dstWord: m.dstWord,
      };
      ctx.grammarNotes.push(`🐯 驱虎吞狼 ×1.15 — ${m.srcWord}倒戈打${m.dstWord}`);
    },
  },
  {
    // 工具格状语: 用 + 器物NP + [修饰≤2] V — "我用猫戳纸鬼"。
    // 器物 = 用后第一个非修饰的名词卡(主/宾词性,非敌方目标、非我)。
    // 成句性无需改动:未知连词「用」按 COORD 折叠 NP-用-NP → NP,天然放行。
    id: 'yong_instrumental',
    label: '🔧 状语·用X',
    detect(ctx) {
      const cards = ctx.cards;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || c.pos !== 'connector' || c.word !== '用') continue;
        let instrIdx = -1, mods = 0;
        for (let k = i + 1; k < cards.length; k++) {
          const kc = cards[k];
          if (!kc) break;
          if (kc.pos === 'modifier' && mods < 2) { mods++; continue; }
          if ((kc.pos === 'subject' || kc.pos === 'object')
              && !kc._isEnemyTarget && !isMeCard(kc)) instrIdx = k;
          break;
        }
        if (instrIdx < 0) continue;
        const verbIdx = verbAfter(cards, instrIdx + 1);
        if (verbIdx < 0) continue;
        return { word: cards[instrIdx].word, instrIdx, verbIdx };
      }
      return null;
    },
    apply(ctx, m) {
      const trait = resolveInstrumentTrait(m.word);
      ctx.constructionGrammarMult *= 1.15;
      ctx.grammarNotes.push(`🔧 状语·用「${m.word}」×1.15`);
      ctx.literaryMult += trait.poetic;
      ctx.literaryNotes.push(`🔧 ${trait.note} +${trait.poetic}`);
      ctx.effects._instrument = { word: m.word, dmg: trait.dmg, note: trait.note };
    },
  },
  {
    // 移步换景(P5): [主语NP]? + 去/到/入(verb) + [修饰≤2] + 地点卡(place:true)。
    // 锚点是动词位的「去」(qu_verb 卡)——感叹卡「去」(我去!/我去V)有自己的
    // meanings 裁决,且 normalizeSentence 会把感叹浮到句尾,天然不与本句式抢。
    // 结算: effects._sceneChange 由 combat.js#applyEffects 消费,场景整场持续。
    id: 'qu_movement',
    label: '🗺 移步·去地点',
    detect(ctx) {
      const cards = ctx.cards;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (!c || (c.pos !== 'verb' && c.pos !== 'special')) continue;
        if (!MOVE_VERB_WORDS.has(c.word)) continue;
        let mods = 0, placeIdx = -1;
        for (let k = i + 1; k < cards.length; k++) {
          const kc = cards[k];
          if (!kc) break;
          if (kc.pos === 'modifier' && mods < 2) { mods++; continue; }
          if (kc.place && kc.sceneId) placeIdx = k;
          break;
        }
        if (placeIdx < 0) continue;
        return { word: cards[placeIdx].word, sceneId: cards[placeIdx].sceneId, verbIdx: i, placeIdx };
      }
      return null;
    },
    apply(ctx, m) {
      ctx.constructionGrammarMult *= 1.1;
      ctx.effects._sceneChange = { place: m.word, sceneId: m.sceneId };
      ctx.grammarNotes.push(`🗺 移步换景 ×1.1 — 去「${m.word}」`);
    },
  },
];

// qu_movement 认的趋向动词词面(动词位)。目前只有 qu_verb 一张,列表留给未来 到/入/赴。
const MOVE_VERB_WORDS = new Set(['去', '到', '入', '赴', '归']);

// 用X做V — 什么都能当武器,越怪越妙。表内词有专属味道,表外走「万物皆兵」兜底
// (保证任意名词都有意义,与 IDENTITY_TRAITS 的 DEFAULT 兜底同哲学)。
// dmg 由 parse.js#detectRoles 在 cardEffects 之后加进 effects.damage(器物之利);
// poetic 在 apply() 立即进 literaryMult(quality 的 poetic_crit 在其后,能吃到)。
const INSTRUMENT_TRAITS = {
  '猫': { dmg: 3, poetic: 0.4, note: '猫爪乱挠——猫对此很不满' },
  '明月': { dmg: 2, poetic: 0.5, note: '月光为刃' },
  '椅子': { dmg: 4, poetic: 0.2, note: '抡起家具' },
  '影子': { dmg: 2, poetic: 0.4, note: '以影缚敌' },
  '骨': { dmg: 3, poetic: 0.3, note: '以骨为刀' },
  '灰烬': { dmg: 2, poetic: 0.4, note: '扬灰迷眼' },
};
const DEFAULT_INSTRUMENT_TRAIT = { dmg: 2, poetic: 0.3, note: '万物皆兵·无理而妙' };
export const resolveInstrumentTrait = (word) =>
  INSTRUMENT_TRAITS[word] || DEFAULT_INSTRUMENT_TRAIT;

export function applyConstructions(ctx) {
  ctx.constructions = [];
  for (const con of CONSTRUCTIONS) {
    const m = con.detect(ctx);
    if (!m) continue;
    ctx.constructions.push({ id: con.id, match: m });
    con.apply(ctx, m);
  }
}
