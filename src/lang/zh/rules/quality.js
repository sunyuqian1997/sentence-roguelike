// Sentence-quality rules (文学性评估) — the pluggable heart of the evaluator.
//
// Each rule is { id, apply(ctx) } and may bump ctx.literaryMult, push
// ctx.literaryNotes, or write structured payloads into ctx.effects
// (_motifTriggers / _rhymeInfo / _predicates). Rules run in array order.
//
// To add a new quality check (e.g. a future LLM-based "creative intent" judge
// that awards a fallback bonus when regex rules miss the joke), push a rule
// into QUALITY_RULES — nothing else in the pipeline needs to change. An async
// judge should pre-compute its verdict before chantSentence and surface it
// through G so its rule can stay synchronous.
import { G } from '../../../game/state.js';
import { detectMotifs, getRhymeKey, checkRhyme, detectPredicates, resolveIdentityTrait } from '../../../game/poetics.js';
import { textRepeatCount, skeletonRepeatCount, newWordsIn, continuityLinks } from '../../../game/creativity.js';
import { SCENES, SCENERY, detectSceneryWords } from '../../../game/scenes.js';
import { isEn } from '../../../i18n.js';

const POETIC_COMBOS = [
  { pattern: /山.*海/, bonus: 0.5, label: '🏔️ 山海意象 +0.5' },
  { pattern: /风.*月/, bonus: 0.4, label: '🌙 风月意象 +0.4' },
  { pattern: /明月/, bonus: 0.3, label: '🌕 明月意象 +0.3' },
  { pattern: /天.*地/, bonus: 0.4, label: '🌍 天地意象 +0.4' },
  { pattern: /生.*死/, bonus: 0.5, label: '💀 生死意象 +0.5' },
  { pattern: /猛.*斩|猛.*砍|猛.*锤/, bonus: 0.3, label: '⚔️ 猛攻组合 +0.3' },
  { pattern: /横眉|怒吼/, bonus: 0.3, label: '😤 怒气冲天 +0.3' },
  { pattern: /远方|家乡/, bonus: 0.3, label: '🏡 思乡意象 +0.3' },
  { pattern: /萤火|光/, bonus: 0.3, label: '✨ 微光意象 +0.3' },
  { pattern: /铁屋|荆棘/, bonus: 0.3, label: '🔥 抗争意象 +0.3' },
];

const bodyText = (ctx) => ctx.cards.filter(c => c.pos !== 'punctuation').map(c => c.word).join('');

export const QUALITY_RULES = [
  {
    id: 'poem_length',
    apply(ctx) {
      if (ctx.totalChars === 5) { ctx.literaryMult *= 1.3; ctx.literaryNotes.push('五言诗意 ×1.3！'); }
      else if (ctx.totalChars === 7) { ctx.literaryMult *= 1.5; ctx.literaryNotes.push('七言诗意 ×1.5！'); }
    },
  },
  {
    id: 'subject_poetry',
    apply(ctx) {
      ctx.subjects.forEach(s => {
        if (s.poetryBonus) { ctx.literaryMult += s.poetryBonus; ctx.literaryNotes.push(`${s.word}诗意 +${s.poetryBonus}`); }
      });
    },
  },
  {
    id: 'modifier_poetry',
    apply(ctx) {
      ctx.modifiers.forEach(m => {
        if (m.poetryBonusMod) { ctx.literaryMult += m.poetryBonusMod; ctx.literaryNotes.push(`${m.word}诗意 +${m.poetryBonusMod}`); }
      });
    },
  },
  {
    id: 'verb_poetry_mult',
    apply(ctx) {
      let mult = 1.0;
      ctx.realVerbs.forEach(v => {
        if (v.poeticMultVerb) { mult *= v.poeticMultVerb; ctx.literaryNotes.push(`${v.word} 诗意×${v.poeticMultVerb}`); }
      });
      ctx.literaryMult *= mult;
    },
  },
  {
    id: 'poetic_combos',
    apply(ctx) {
      const allWords = bodyText(ctx);
      for (const combo of POETIC_COMBOS) {
        if (combo.pattern.test(allWords)) {
          ctx.literaryMult += combo.bonus;
          ctx.literaryNotes.push(combo.label);
        }
      }
    },
  },
  {
    id: 'poetic_aura',
    apply(ctx) {
      if (G.poeticAura) { ctx.literaryMult += 0.5; ctx.literaryNotes.push('诗仙附体！'); }
      if (ctx.cards.length >= 5) { ctx.literaryMult += 0.2; ctx.literaryNotes.push('长句加成 +0.2'); }
    },
  },
  {
    id: 'rhyme',
    apply(ctx) {
      // Compares this sentence's last character with the previous sentence's
      // rhyme key. Single +0.4, streak×2 +0.6, streak×3+ +0.8.
      const key = getRhymeKey(ctx.nonPunctCards.map(c => c.word).join(''));
      const info = { rhymes: false, key, prevKey: G.lastRhymeKey || null, streak: 0 };
      if (key && G.lastRhymeKey && checkRhyme(key, G.lastRhymeKey).rhymes) {
        const streak = (G.rhymeStreak || 0) + 1;
        info.rhymes = true;
        info.streak = streak;
        if (streak >= 3) { ctx.literaryMult += 0.8; ctx.literaryNotes.push(`🎵 三连押韵！+0.8 (×${streak})`); }
        else if (streak >= 2) { ctx.literaryMult += 0.6; ctx.literaryNotes.push(`🎵 连押 +0.6 (×${streak})`); }
        else { ctx.literaryMult += 0.4; ctx.literaryNotes.push(`🎵 押韵 +0.4`); }
      }
      ctx.effects._rhymeInfo = info;
    },
  },
  {
    id: 'motifs',
    apply(ctx) {
      // Thematic effects against tagged enemies — e.g. 纸鬼沉海
      const motifs = detectMotifs(bodyText(ctx), G.enemies);
      if (motifs.length === 0) return;
      ctx.effects._motifTriggers = motifs;
      let bonus = 0;
      motifs.forEach(t => {
        ctx.literaryNotes.push(`${t.motif.label}：${t.motif.flavor}`);
        bonus += (t.motif.effect.bonusDmgPct || 0);
      });
      if (bonus > 0) ctx.literaryMult += bonus;
    },
  },
  {
    id: 'predicates',
    apply(ctx) {
      // "A 是 B" clauses: puns AND identity rewrites (Baba-is-you style).
      // Payload goes to effects._predicates; combat.js#applyEffects applies it.
      const preds = detectPredicates(ctx.cards);
      if (preds.length === 0) return;
      ctx.effects._predicates = preds;
      preds.forEach(p => {
        let tgtLabel;
        if (p.subjectKind === 'enemy') {
          tgtLabel = (G.enemies[p.subjectEnemyIdx] ? G.enemies[p.subjectEnemyIdx].name : '敌人');
        } else if (p.subjectKind === 'self') {
          tgtLabel = '我';
        } else {
          tgtLabel = p.subjectWord || '它';
        }
        if (p.kind === 'pun') {
          ctx.literaryNotes.push(`${p.pun.label}：${tgtLabel}${p.copulaWord}${p.srcWord} — ${p.pun.flavor}`);
          ctx.literaryMult += 0.3;
        } else if (p.kind === 'identity') {
          const trait = resolveIdentityTrait(p.identityWord, p.identityIsEnemyName);
          const traitLabel = p.target === 'self' ? trait.selfLabel : trait.enemyLabel;
          ctx.literaryNotes.push(`${trait.emoji} ${tgtLabel}${p.copulaWord}${p.srcWord} → ${traitLabel}`);
          ctx.literaryMult += 0.25;
        } else if (p.kind === 'forbidden') {
          ctx.literaryNotes.push(`✗ 僭越！${tgtLabel}不能${p.copulaWord}我`);
          ctx.literaryMult = Math.max(0.1, ctx.literaryMult - 0.3);
        } else if (p.kind === 'tautology') {
          ctx.literaryNotes.push(`🪞 我${p.copulaWord}我 — 同义反复，但有禅意 +0.1`);
          ctx.literaryMult += 0.1;
        }
      });
    },
  },
  {
    id: 'question_weaken',
    apply(ctx) {
      if (ctx.hasQuestion) ctx.effects.applyWeak = 2;
    },
  },
  {
    // 承接链(P2):上一句的内容词(主/宾,除我你)在本句复现 → 上下文延续。
    // 链式 streak 存 G._continuityStreak(chantSentence 在吟诵后按 _continuity 更新,
    // 与押韵连击同一模式)。与新意奖励天然互斥形成取舍:承上=沿用旧词,新意=全新词。
    id: 'continuity',
    apply(ctx) {
      const links = continuityLinks(ctx.cards);
      if (!links.length) return;
      const streak = (G._continuityStreak || 0) + 1;
      const bonus = streak >= 3 ? 0.4 : streak >= 2 ? 0.3 : 0.2;
      ctx.literaryMult += bonus;
      ctx.literaryNotes.push(`🔗 承上「${links[0]}」+${bonus.toFixed(1)}${streak > 1 ? ` (×${streak})` : ''}`);
      ctx.effects._continuity = { words: links, streak, bonus };
    },
  },
  {
    // 创造力经济·衰减半边:本场原句重复 ×0.6^n(词穷),同骨架(词性序列+动词)
    // 重复 ×0.85^n(句式疲劳)。计数只在真吟诵后推进(creativity.js 时序契约),
    // 所以预览实时显示"再念一遍会掉到多少"。
    id: 'repetition_decay',
    apply(ctx) {
      const n = textRepeatCount(ctx.cards);
      if (n > 0) {
        const f = Math.pow(0.6, n);
        ctx.literaryMult = Math.max(0.1, ctx.literaryMult * f);
        ctx.literaryNotes.push(`😮‍💨 词穷:原句已念${n}遍 ×${f.toFixed(2)}`);
        ctx.effects._repetition = { kind: 'exact', n };
        return;
      }
      const m = skeletonRepeatCount(ctx.cards);
      if (m > 0) {
        const f = Math.pow(0.85, m);
        ctx.literaryMult = Math.max(0.1, ctx.literaryMult * f);
        ctx.literaryNotes.push(`🥱 句式重复×${m} ×${f.toFixed(2)}`);
        ctx.effects._repetition = { kind: 'skeleton', n: m };
      }
    },
  },
  {
    // 创造力经济·奖励半边:本场首次使用的词 +0.06/个,封顶 +0.3。
    // 首句没有"新"的基准,不给(否则开局白送膨胀基线)。
    id: 'novelty',
    apply(ctx) {
      const fresh = newWordsIn(ctx.cards);
      if (!fresh.length) return;
      const bonus = Math.min(0.3, fresh.length * 0.06);
      ctx.literaryMult += bonus;
      ctx.literaryNotes.push(`✨ 新词「${fresh.slice(0, 3).join('、')}${fresh.length > 3 ? '…' : ''}」+${bonus.toFixed(2)}`);
      ctx.effects._novelty = { words: fresh, bonus };
    },
  },
  {
    // 场景光环(P5): G.currentScene 的逐句全局 buff——月下诗意+0.2 / 战场攻击句+2伤。
    // 回合类(海边/酒馆)在 combat.js#startPlayerTurn 走 scenes.js#sceneTurnStartEffects。
    // G.currentScene 为空时零效果(golden 安全)。
    id: 'scene_aura',
    apply(ctx) {
      const sc = G.currentScene && SCENES[G.currentScene.id];
      if (!sc) return;
      if (sc.literaryBonus) {
        ctx.literaryMult += sc.literaryBonus;
        ctx.literaryNotes.push(isEn() ? (sc.auraNoteEn || sc.auraNote) : sc.auraNote);
      }
      if (sc.attackBonus && ctx.realVerbs.some(v => v.combatType === 'attack')) {
        // 平伤走 _flatAttackBonus(settle 既有管道,与器物之利同为倍率前平加)。
        ctx.effects._flatAttackBonus = (ctx.effects._flatAttackBonus || 0) + sc.attackBonus;
        ctx.literaryNotes.push(isEn() ? (sc.auraNoteEn || sc.auraNote) : sc.auraNote);
      }
    },
  },
  {
    // 景物道具(P5): 句中景物词(明月/椅子…,非敌方目标)→ effects._sceneryAdd
    // (combat.js#applyEffects 消费,上限3/重复不叠加);已在场的景物给小光环。
    // blockPerTurn 类光环在 startPlayerTurn 生效,这里只算 literary。
    id: 'scenery_detect',
    apply(ctx) {
      const words = detectSceneryWords(ctx.cards);
      if (words.length) ctx.effects._sceneryAdd = words;
      (G.sceneryProps || []).forEach(p => {
        const def = SCENERY[p.id];
        if (def && def.aura && def.aura.literary) {
          ctx.literaryMult += def.aura.literary;
          ctx.literaryNotes.push(isEn() ? (def.noteEn || def.note) : def.note);
        }
      });
    },
  },
  {
    // 必须放在 QUALITY_RULES 末尾 —— 读取其他规则累计后的 literaryMult。
    // 阈值 3.0:明显高于 2.0 回血线,需七言/对仗类高倍才够,是真·神来之笔。
    id: 'poetic_crit',
    apply(ctx) {
      if (ctx.literaryMult >= 3.0) {
        ctx.effects._crit = true;        // finalize() 已消费 _crit → ×1.5
        ctx.effects._poeticCrit = true;  // banner 用
        ctx.literaryNotes.push('⚡ 诗成泣鬼神！×1.5暴击');
      }
    },
  },
  {
    // 怕某字的敌人:句中出现敌人 fearWord → 本回合给该敌 weak。复用 motif 落地风格。
    id: 'fear_words',
    apply(ctx) {
      const body = bodyText(ctx);
      const hits = [];
      G.enemies.forEach((e, i) => {
        if (!e || e.hp <= 0 || !e.fearWord) return;
        if (body.includes(e.fearWord)) {
          hits.push({ enemyIdx: i, word: e.fearWord, weak: e.fearWeak || 2 });
          ctx.literaryNotes.push(`😱 ${e.name}怕「${e.fearWord}」——虚弱${e.fearWeak || 2}`);
        }
      });
      if (hits.length) ctx.effects._fearTriggers = hits;
    },
  },
];

export function applyQuality(ctx) {
  for (const rule of QUALITY_RULES) rule.apply(ctx);
}
