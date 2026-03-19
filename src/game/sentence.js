import { G } from './state.js';
import { showFloatingText } from '../utils.js';
import { playSFX } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { dealDamageToEnemy } from './damage.js';
import { drawCards } from './combat.js';

// ============================================================
// DUIZHANG (对仗) SYSTEM
// ============================================================
export function detectDuizhang(cards) {
  const commaIdx = cards.findIndex(c => c.pos === 'punctuation' && c.punctType === 'comma');
  if (commaIdx < 0) return null;

  const firstHalf = cards.slice(0, commaIdx).filter(c => c.pos !== 'punctuation');
  const secondHalf = cards.slice(commaIdx + 1).filter(c => c.pos !== 'punctuation' && !c._isEnemyTarget && !c._isSelfTarget);

  if (firstHalf.length === 0 || secondHalf.length === 0) return null;

  const text1 = firstHalf.map(c => c.word).join('');
  const text2 = secondHalf.map(c => c.word).join('');
  const len1 = text1.length;
  const len2 = text2.length;

  const struct1 = firstHalf.map(c => c.pos).join('+');
  const struct2 = secondHalf.map(c => c.pos).join('+');

  const sameLength = len1 === len2;
  const sameStructure = struct1 === struct2;

  let result = { text1, text2, len1, len2, matched: false, type: 'none', multiplier: 1.1 };

  if (!sameLength) {
    result.label = '✗ 对仗不全（字数不齐）';
    result.multiplier = 1.1;
    return result;
  }

  result.matched = true;

  if (len1 === 5 && len2 === 5) {
    result.type = 'lushi'; result.multiplier = 2.5;
    result.label = '✓ 律诗对仗！五言工整 ×2.5';
    return result;
  }
  if (len1 === 7 && len2 === 7) {
    result.type = 'jueju'; result.multiplier = 3.0;
    result.label = '✓ 绝句对仗！七言工整 ×3.0';
    return result;
  }
  if (sameStructure) {
    result.type = 'perfect'; result.multiplier = 2.0;
    result.label = '✓ 完美对仗！结构对称 ×2.0';
    return result;
  }

  result.type = 'basic'; result.multiplier = 1.5;
  result.label = '✓ 对仗工整（字数相同）×1.5';
  return result;
}

// ============================================================
// SUMMON SYSTEM (感叹词 + 逗号 + 人名)
// ============================================================
export const SUMMON_EFFECTS = {
  '初音未来': {
    name: '初音唱歌', emoji: '🎤', desc: '音波伤害全体敌人4点',
    apply() {
      G.enemies.forEach((e, i) => {
        if (e.hp > 0) dealDamageToEnemy(i, 4, false);
      });
      showFloatingText(document.querySelector('#enemy-area'), '🎤 音波攻击！', '#3A7B8C');
    }
  },
  '李清照': {
    name: '李清照吟诗', emoji: '📜', desc: '下回合所有句子质量+0.5',
    apply() {
      G.poeticAuraNext = true;
      showFloatingText(document.querySelector('#combat-top'), '📜 诗意加持！下回合+0.5', '#c9a84c');
    }
  },
  '猫': {
    name: '猫出来了', emoji: '🐱', desc: '50%全体伤害6，50%啥也不干',
    apply() {
      if (Math.random() < 0.5) {
        G.enemies.forEach((e, i) => { if (e.hp > 0) dealDamageToEnemy(i, 6, false); });
        showFloatingText(document.querySelector('#enemy-area'), '🐱 猫猫发威！全体6伤害', '#e8873a');
      } else {
        showFloatingText(document.querySelector('#combat-top'), '🐱 喵？（啥也没干）', '#7A7872');
      }
    }
  },
  '僧人': {
    name: '僧人念经', emoji: '🙏', desc: '回血8',
    apply() {
      G.hp = Math.min(G.maxHp, G.hp + 8);
      playSFX('heal');
      VFX.damageNum(document.getElementById('player-status-bar'), '+8♥', '#4A7C6B', 2.5);
      VFX.rollHp(document.getElementById('combat-hp'));
    }
  },
  '女侠': {
    name: '女侠出场', emoji: '⚔️', desc: '随机敌人穿透攻击10',
    apply() {
      const alive = G.enemies.map((e,i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        dealDamageToEnemy(t, 10, true);
        showFloatingText(G.enemies[t].element, '⚔️ 女侠穿透！', '#C54B3C');
      }
    }
  },
  '剑客': {
    name: '剑客砍一刀', emoji: '🗡️', desc: '单体伤害12',
    apply() {
      const alive = G.enemies.map((e,i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        dealDamageToEnemy(t, 12, false);
        showFloatingText(G.enemies[t].element, '🗡️ 剑客一刀！', '#B8862B');
      }
    }
  },
  '酒仙': {
    name: '酒仙上场', emoji: '🍶', desc: '随机+1~3力量',
    apply() {
      const gain = Math.floor(Math.random() * 3) + 1;
      G.strength += gain;
      showFloatingText(document.querySelector('#combat-top'), `🍶 酒仙+${gain}力量`, '#70d490');
    }
  },
  '月兔': {
    name: '月兔祝福', emoji: '🐰', desc: '回血5+下回合+1能量',
    apply() {
      G.hp = Math.min(G.maxHp, G.hp + 5);
      G._bonusEnergyNext = (G._bonusEnergyNext || 0) + 1;
      playSFX('heal');
      VFX.damageNum(document.getElementById('player-status-bar'), '+5♥', '#4A7C6B', 2.2);
      showFloatingText(document.querySelector('#combat-top'), '🐰 下回合+1能量', '#c9a84c');
      VFX.rollHp(document.getElementById('combat-hp'));
    }
  },
  '狐仙': {
    name: '狐仙魅惑', emoji: '🦊', desc: '敌人全体易伤2回合',
    apply() {
      G.enemies.forEach(e => { if (e.hp > 0) e.vulnerable = (e.vulnerable||0) + 2; });
      showFloatingText(document.querySelector('#enemy-area'), '🦊 全体易伤！', '#6B4C6E');
    }
  },
  '书生': {
    name: '书生献策', emoji: '📚', desc: '抽2张牌',
    apply() {
      drawCards(2);
      showFloatingText(document.querySelector('#combat-top'), '📚 抽2牌！', '#7090d4');
    }
  },
};

/**
 * Detect summon pattern: exclamation + comma + subject(non-我), no verb
 * Returns { summonName, exclamationCards } or null
 */
export function detectSummon(cards) {
  const hasVerb = cards.some(c => c.pos === 'verb');
  if (hasVerb) return null;

  const hasExclamation = cards.some(c => c.pos === 'exclamation');
  const hasComma = cards.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  const subjects = cards.filter(c => c.pos === 'subject' && c.word !== '我');

  if (!hasExclamation || !hasComma || subjects.length === 0) return null;

  const summonName = subjects[0].word;
  if (!SUMMON_EFFECTS[summonName]) return null;

  return {
    summonName,
    exclamationCards: cards.filter(c => c.pos === 'exclamation'),
    text: cards.map(c => c.word).join(''),
  };
}

// ============================================================
// SENTENCE EVALUATION SYSTEM
// ============================================================
export function normalizeSentence(cards) {
  const endPuncts = [];
  const exclamations = [];
  const rest = [];
  cards.forEach(c => {
    if (c.pos === 'punctuation' && c.punctType !== 'comma') endPuncts.push(c);
    else if (c.pos === 'exclamation') exclamations.push(c);
    else rest.push(c);
  });
  return [...rest, ...exclamations, ...endPuncts];
}

function checkClauseOrder(clauseCards) {
  const phaseMap = { modifier: [0, 2, 4], subject: [1, 3], connector: [1, 2], verb: [3], object: [5], special: [3] };
  let phase = 0, violations = 0;
  for (const c of clauseCards) {
    const allowed = phaseMap[c.pos] || [phase];
    const min = Math.min(...allowed);
    if (min >= phase) phase = min;
    else violations++;
  }
  return violations;
}

export function checkWordOrder(cards) {
  const hasComma = cards.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  const notes = [];

  if (hasComma) {
    const commaIdx = cards.findIndex(c => c.pos === 'punctuation' && c.punctType === 'comma');
    const clause1 = cards.slice(0, commaIdx).filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');
    const clause2 = cards.slice(commaIdx + 1).filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');

    const v1 = checkClauseOrder(clause1);
    const v2 = checkClauseOrder(clause2);
    const totalV = v1 + v2;

    const sub1 = clause1.filter(c => c.pos === 'subject').length;
    const sub2 = clause2.filter(c => c.pos === 'subject' || c._isEnemyTarget).length;
    const verb1 = clause1.filter(c => c.pos === 'verb').length;
    const verb2 = clause2.filter(c => c.pos === 'verb').length;

    let bonus = 0;
    if (sub1 >= 1 && sub2 >= 1 && verb1 >= 1 && verb2 >= 1) {
      bonus = 0.1;
      notes.push('复合句（双主语双谓语）+10%');
    } else if (sub1 >= 1 && verb1 >= 1 && verb2 >= 1) {
      notes.push('复合句（承前省略）');
    }

    let score;
    if (totalV === 0) { score = 1.0 + bonus; if (notes.length === 0) notes.push('语序正确'); }
    else if (totalV <= 2) { score = 0.85 + bonus; notes.push('语序小错 ×0.85'); }
    else { score = 0.65; notes.push('语序混乱 ×0.65'); }
    return { score, notes };
  }

  const nonPunct = cards.filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation' && !c._isEnemyTarget && !c._isSelfTarget);
  if (nonPunct.length === 0) return { score: 1.0, notes: [] };

  const violations = checkClauseOrder(nonPunct);
  const posCounts = {};
  nonPunct.forEach(c => { posCounts[c.pos] = (posCounts[c.pos] || 0) + 1; });
  let dupPenalty = 0;
  if ((posCounts['subject'] || 0) > 2) {
    dupPenalty += (posCounts['subject'] - 2) * 0.05;
    notes.push(`主语过多 -${((posCounts['subject'] - 2) * 5)}%`);
  }
  if ((posCounts['verb'] || 0) > 2) {
    dupPenalty += (posCounts['verb'] - 2) * 0.05;
    notes.push(`谓语过多 -${((posCounts['verb'] - 2) * 5)}%`);
  }

  let score;
  if (violations === 0) { score = 1.0; if (notes.length === 0) notes.push('语序正确'); }
  else if (violations === 1) { score = 0.8; notes.push('语序小错 ×0.8'); }
  else { score = 0.6; notes.push('语序混乱 ×0.6'); }

  score = Math.max(0.4, score - dupPenalty);
  return { score, notes };
}

/**
 * Check exclamation position legality.
 * freePos exclamations (语气词: 啊、卧槽、我去、救命、666、麻了、寄) can go anywhere.
 * Phrase exclamations (绝了、牛逼、妙啊 etc.) need comma separation from the body.
 */
export function checkExclamationPosition(cards) {
  const exclamations = cards.filter(c => c.pos === 'exclamation');
  if (exclamations.length === 0) return { legal: true, penalty: 1.0, note: '' };

  const allFree = exclamations.every(c => c.freePos);
  if (allFree) return { legal: true, penalty: 1.0, note: '' };

  const isBodyCard = c => c.pos !== 'exclamation' && c.pos !== 'punctuation';
  const bodyIndices = cards.map((c, i) => isBodyCard(c) ? i : -1).filter(i => i >= 0);
  if (bodyIndices.length === 0) return { legal: true, penalty: 1.0, note: '' };

  const firstBodyIdx = bodyIndices[0];
  const lastBodyIdx = bodyIndices[bodyIndices.length - 1];

  for (let ei = 0; ei < cards.length; ei++) {
    const card = cards[ei];
    if (card.pos !== 'exclamation') continue;
    if (card.freePos) continue;

    const atStart = ei < firstBodyIdx;
    const atEnd = ei > lastBodyIdx;

    if (!atStart && !atEnd) {
      const commaBefore = ei > 0 && cards[ei - 1].pos === 'punctuation' && cards[ei - 1].punctType === 'comma';
      const commaAfter = ei < cards.length - 1 && cards[ei + 1].pos === 'punctuation' && cards[ei + 1].punctType === 'comma';
      if (!commaBefore && !commaAfter) {
        return { legal: false, penalty: 0.5, note: `⚠「${card.word}」需要逗号分隔 ×0.5` };
      }
    }

    if (atStart) {
      let hasComma = false;
      for (let i = ei + 1; i < firstBodyIdx; i++) {
        if (cards[i].pos === 'punctuation' && cards[i].punctType === 'comma') { hasComma = true; break; }
        if (cards[i].pos === 'exclamation' && !cards[i].freePos) continue;
      }
      if (!hasComma) {
        const nextIsPunct = ei + 1 < cards.length && cards[ei + 1].pos === 'punctuation';
        if (!nextIsPunct) return { legal: false, penalty: 0.6, note: `⚠「${card.word}」与正文间需要逗号 ×0.6` };
      }
    }

    if (atEnd) {
      let hasComma = false;
      for (let i = lastBodyIdx + 1; i < ei; i++) {
        if (cards[i].pos === 'punctuation' && cards[i].punctType === 'comma') { hasComma = true; break; }
      }
      const prevIsPunct = ei > 0 && cards[ei - 1].pos === 'punctuation';
      if (!hasComma && !prevIsPunct) {
        return { legal: false, penalty: 0.6, note: `⚠「${card.word}」与正文间需要标点 ×0.6` };
      }
    }
  }

  return { legal: true, penalty: 1.0, note: '' };
}

export function evaluateSentence(rawCards) {
  if (rawCards.length === 0) return null;

  const cards = normalizeSentence(rawCards);
  const punctCards = cards.filter(c => c.pos === 'punctuation');
  const nonPunctCards = cards.filter(c => c.pos !== 'punctuation' && c.pos !== 'exclamation');

  const exclamationCards = cards.filter(c => c.pos === 'exclamation');
  const subjects = nonPunctCards.filter(c => c.pos === 'subject');
  const verbs = nonPunctCards.filter(c => c.pos === 'verb' || c.pos === 'special');
  const realVerbs = nonPunctCards.filter(c => c.pos === 'verb');
  const objects = nonPunctCards.filter(c => c.pos === 'object');
  const modifiers = nonPunctCards.filter(c => c.pos === 'modifier');
  const connectors = nonPunctCards.filter(c => c.pos === 'connector');

  const sentenceText = cards.map(c => c.word).join('');
  const totalChars = nonPunctCards.map(c => c.word).join('').length;

  const hasSelfTarget = cards.some(c => c._isSelfTarget);
  const enemyObjCards = cards.filter(c => c._isEnemyTarget);
  const hasEnemyTarget = enemyObjCards.length > 0;
  let targetEnemyIdx = -1;
  if (hasEnemyTarget) targetEnemyIdx = enemyObjCards[0]._enemyIdx;

  const handObjects = objects.filter(c => !c._isEnemyTarget && !c._isSelfTarget);

  const hasPeriod = punctCards.some(c => c.punctType === 'period');
  const hasQuestion = punctCards.some(c => c.punctType === 'question' || c.punctType === 'interrobang');
  const hasExclamation = punctCards.some(c => c.punctType === 'exclamation' || c.punctType === 'interrobang');
  const hasComma = punctCards.some(c => c.punctType === 'comma');
  const hasInterrobang = punctCards.some(c => c.punctType === 'interrobang');

  const hasMultiTarget = (connectors.some(c => c.multiTarget) || hasComma) && enemyObjCards.length > 1;
  const multiTargetIndices = hasMultiTarget ? enemyObjCards.map(c => c._enemyIdx) : [];

  const hasVerb = realVerbs.length > 0 || verbs.length > 0;
  const isDeclaration = !hasVerb && exclamationCards.length > 0 && subjects.length > 0;
  let baseMult = hasVerb ? 1.0 : isDeclaration ? 0.8 : 0.3;
  let grammarNotes = [];
  if (!hasVerb && !isDeclaration) grammarNotes.push('⚠ 没有谓语！废句 ×0.3');
  else if (isDeclaration) grammarNotes.push('✓ 宣言句（主语+感叹）×0.8');
  else grammarNotes.push('✓ 有谓语');

  let structMult = 0.7;
  const hasSubject = subjects.length > 0;
  const hasObject = handObjects.length > 0 || hasEnemyTarget || hasSelfTarget;
  const hasModifier = modifiers.length > 0;

  const isCompound = hasComma && subjects.length > 1 && realVerbs.length > 1;
  if (hasVerb) {
    if (isCompound) { structMult = 1.35; grammarNotes.push('复合句（多主多谓）×1.35'); }
    else if (hasSubject && hasObject && hasModifier) { structMult = 1.25; grammarNotes.push('修+主+谓+宾 ×1.25'); }
    else if (hasSubject && hasObject) { structMult = 1.0; grammarNotes.push('主+谓+宾 ×1.0'); }
    else if (hasSubject) { structMult = 0.85; grammarNotes.push('主+谓 ×0.85'); }
    else { structMult = 0.7; grammarNotes.push('仅谓语 ×0.7'); }
  } else if (isDeclaration) {
    structMult = subjects.length > 1 ? 1.0 : 0.85;
    grammarNotes.push(subjects.length > 1 ? '主+主+感叹 ×1.0' : '主+感叹 ×0.85');
  }

  const orderResult = checkWordOrder(cards);
  const orderMult = orderResult.score;
  orderResult.notes.forEach(n => grammarNotes.push(n));

  let connBonus = 0;
  connectors.forEach(c => { connBonus += (c.grammarBonus || 0.05); });
  if (connectors.length > 0) grammarNotes.push(`连词 +${(connBonus*100).toFixed(0)}%`);

  let grammarMult = baseMult * structMult * orderMult + connBonus;

  let punctMult = 1.0;
  let punctNotes = [];
  if (hasPeriod) { punctMult *= 1.15; punctNotes.push('句号「。」完句 ×1.15'); }
  if (hasExclamation) { punctMult *= 1.3; punctNotes.push('感叹号「！」爆发 ×1.3'); }
  if (hasQuestion) { punctNotes.push('问号「？」→ 削弱敌人2回合'); }

  let duizhangResult = null;
  if (hasComma) {
    duizhangResult = detectDuizhang(cards);
    if (duizhangResult) { punctMult *= duizhangResult.multiplier; punctNotes.push(duizhangResult.label); }
    else { punctMult *= 1.1; punctNotes.push('逗号「，」复句 ×1.1'); }
  }

  let literaryMult = 1.0;
  let literaryNotes = [];
  if (totalChars === 5) { literaryMult *= 1.3; literaryNotes.push('五言诗意 ×1.3！'); }
  else if (totalChars === 7) { literaryMult *= 1.5; literaryNotes.push('七言诗意 ×1.5！'); }

  subjects.forEach(s => {
    if (s.poetryBonus) { literaryMult += s.poetryBonus; literaryNotes.push(`${s.word}诗意 +${s.poetryBonus}`); }
  });
  modifiers.forEach(m => {
    if (m.poetryBonusMod) { literaryMult += m.poetryBonusMod; literaryNotes.push(`${m.word}诗意 +${m.poetryBonusMod}`); }
  });

  let verbPoetryMult = 1.0;
  realVerbs.forEach(v => {
    if (v.poeticMultVerb) { verbPoetryMult *= v.poeticMultVerb; literaryNotes.push(`${v.word} 诗意×${v.poeticMultVerb}`); }
  });
  literaryMult *= verbPoetryMult;

  // POETIC COMBO DETECTION
  const allWords = cards.filter(c => c.pos !== 'punctuation').map(c => c.word).join('');
  const poeticCombos = [
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
  for (const combo of poeticCombos) {
    if (combo.pattern.test(allWords)) {
      literaryMult += combo.bonus;
      literaryNotes.push(combo.label);
    }
  }

  if (G.poeticAura) { literaryMult += 0.5; literaryNotes.push('诗仙附体！'); }
  if (cards.length >= 5) { literaryMult += 0.2; literaryNotes.push('长句加成 +0.2'); }

  // COMBAT EFFECTS — declared before exclamation loop so exc properties can write into it
  const effects = {
    damage: 0, block: 0, heal: 0, strengthGain: 0, draw: 0,
    aoe: false, applyVuln: 0, zeroCost: false,
    selfHarm: false, selfHarmDmg: 0, selfHarmBuff: 0,
    targetEnemyIdx: targetEnemyIdx,
    applyWeak: 0, isQuestion: hasQuestion, ignoreBlock: false,
    goldGain: 0, thorns: 0, drawLessNext: 0,
  };

  if (hasQuestion) { effects.applyWeak = 2; }

  // EXCLAMATION MULTIPLIERS
  let excAttackMult = 1, excDefenseMult = 1, excHealMult = 1;
  let excNotes = [];
  let excExtraDraw = 0, excExtraHeal = 0, excExtraEnergy = 0;
  exclamationCards.forEach(exc => {
    const m = exc.excMult || 1.2;
    if (exc.excType === 'attack') { excAttackMult *= m; excNotes.push(`🔥「${exc.word}」伤害×${m}`); }
    else if (exc.excType === 'defense') { excDefenseMult *= m; excNotes.push(`🔥「${exc.word}」格挡×${m}`); }
    else { excAttackMult *= m; excDefenseMult *= m; excHealMult *= m; excNotes.push(`🔥「${exc.word}」全效×${m}`); }
    if (exc.excDraw) { excExtraDraw += exc.excDraw; excNotes.push(`📜「${exc.word}」抽${exc.excDraw}牌`); }
    if (exc.excHeal) { excExtraHeal += exc.excHeal; excNotes.push(`♥「${exc.word}」回血${exc.excHeal}`); }
    if (exc.excEnergy) { excExtraEnergy += exc.excEnergy; excNotes.push(`⚡「${exc.word}」下回合+${exc.excEnergy}能量`); }
    if (exc.excWeaken) { effects.applyWeak = Math.max(effects.applyWeak, exc.excWeaken); excNotes.push(`😑「${exc.word}」敌攻击-${exc.excWeaken}`); }
    if (exc.excSkipChance) { effects._excSkipChance = (effects._excSkipChance||0) + exc.excSkipChance; excNotes.push(`😂「${exc.word}」${Math.round(exc.excSkipChance*100)}%敌跳过`); }
    if (exc.excDrawNext) { effects._drawNextTurn = (effects._drawNextTurn||0) + exc.excDrawNext; excNotes.push(`🧬「${exc.word}」下回合抽牌+${exc.excDrawNext}`); }
    if (exc.excPenetrate) { effects.ignoreBlock = true; excNotes.push(`💥「${exc.word}」穿透格挡`); }
    if (exc.excBlockDebuff) { effects._blockDebuffNext = exc.excBlockDebuff; excNotes.push(`🔥「${exc.word}」下回合格挡-50%`); }
    if (exc.excReverseNeg) { effects._reverseNeg = true; excNotes.push(`🔄「${exc.word}」负面变正面`); }
    if (exc.excSelfDmg) { effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg||0) + exc.excSelfDmg; excNotes.push(`💀「${exc.word}」自伤${exc.excSelfDmg}`); }
    if (exc.excPoetry) { literaryMult += exc.excPoetry; literaryNotes.push(`✨「${exc.word}」诗意+${exc.excPoetry}`); }
  });

  // EXCLAMATION POSITION CHECK
  const excPosResult = checkExclamationPosition(rawCards);
  let excPosPenalty = excPosResult.penalty;
  if (excPosResult.note) {
    excNotes.push(excPosResult.note);
  }

  let subjectAttackBonus = 0, subjectDefenseBonus = 0, subjectHealBonus = 0;
  subjects.forEach(s => {
    const b = s.powerBonus || 0;
    const ub = s.upgraded ? Math.ceil(b * 1.5) : b;
    if (s.bonusType === 'attack') subjectAttackBonus += ub;
    else if (s.bonusType === 'defense') subjectDefenseBonus += ub;
    else if (s.bonusType === 'heal') subjectHealBonus += ub;
    else if (s.bonusType === 'all') { subjectAttackBonus += ub; subjectDefenseBonus += ub; subjectHealBonus += ub; }
    if (s.defenseBonus) subjectDefenseBonus += (s.upgraded ? Math.ceil(s.defenseBonus*1.5) : s.defenseBonus);
    if (s.draw) effects.draw += (s.upgraded ? s.draw+1 : s.draw);
    if (s.thorns) effects.thorns += s.thorns;
    if (s.doubleStrength) effects.strengthGain += G.strength;
    if (s.discardRandom && G.hand.length > 0) effects._discardRandom = s.discardRandom;
    if (s.healBonusSub) subjectHealBonus += (s.upgraded ? Math.ceil(s.healBonusSub*1.5) : s.healBonusSub);
    if (s.drunkRandom) {
      const roll = Math.floor(Math.random() * 5) + 1;
      subjectAttackBonus += roll;
      grammarNotes.push(`🍶 酒仙·攻击+${roll}(随机1-5)`);
    }
    if (s.forceAoeSub) effects.aoe = true;
    if (s.stealthSub) effects.ignoreBlock = true;
    if (s.halfPenetrate) effects._halfPenetrate = true;
    if (s.randomEffect) {
      const roll = Math.random();
      if (roll < 0.33) { subjectAttackBonus += 4; grammarNotes.push('🐱 猫·攻击+4'); }
      else if (roll < 0.66) { subjectDefenseBonus += 4; grammarNotes.push('🐱 猫·格挡+4'); }
      else { effects.draw += 1; grammarNotes.push('🐱 猫·摸鱼+1牌'); }
    }
  });

  let objAttackBonus = 0, objDefenseBonus = 0, objHealBonus = 0;
  handObjects.forEach(o => {
    const b = o.effectBonus || 0;
    if (o.bonusType === 'attack') objAttackBonus += b;
    else if (o.bonusType === 'defense') objDefenseBonus += b;
    else if (o.bonusType === 'heal') objHealBonus += b;
    else if (o.bonusType === 'all') { objAttackBonus += b; objDefenseBonus += b; objHealBonus += b; }
    if (o.aoe) effects.aoe = true;
    if (o.draw) effects.draw += o.draw;
    if (o.applyVuln) effects.applyVuln += o.applyVuln;
    if (o.goldGain) effects.goldGain += o.goldGain;
    if (o.randomObjBonus) {
      const roll = Math.floor(Math.random() * 6) + 2;
      const types = ['attack','defense','heal'];
      const t = types[Math.floor(Math.random()*3)];
      if (t === 'attack') objAttackBonus += roll;
      else if (t === 'defense') objDefenseBonus += roll;
      else objHealBonus += roll;
      grammarNotes.push(`🎲 命运→${t==='attack'?'攻击':t==='defense'?'格挡':'治疗'}+${roll}`);
    }
    if (o.removeBuffs) effects._removeBuffs = true;
    if (o.bugEffect) {
      const bugRoll = Math.random();
      if (bugRoll < 0.3) {
        effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg||0) + 5;
        grammarNotes.push('🐛 bug→打到自己了！');
      } else {
        objAttackBonus += 10; grammarNotes.push('🐛 bug→伤害翻倍效果！');
      }
    }
    if (o.critObj) {
      effects._crit = true;
      grammarNotes.push('🎯 要害→暴击+50%伤害');
    }
    if (o.selfTargetObj) {
      effects._selfTargetFromObj = true;
    }
    if (o.critChanceBonus) {
      if (Math.random() < o.critChanceBonus) { effects._crit = true; grammarNotes.push('👋 打脸→暴击！'); }
    }
    if (o.confuseObj) { effects._confuse = true; grammarNotes.push('🌀 节奏→敌人混乱'); }
    if (o.xintaiDebuff) { effects.applyWeak += 3; effects.applyVuln += 3; grammarNotes.push('💔 心态崩了→敌全属性降'); }
    if (o.poetryObjBonus) { literaryMult += o.poetryObjBonus; literaryNotes.push(`${o.word}诗意 +${o.poetryObjBonus}`); }
    if (o.windPenetrate) { effects.ignoreBlock = true; grammarNotes.push('🌬️ 长风穿透格挡'); }
  });

  let attackMod = 1, defenseMod = 1, healMod = 1;
  let modSelfDmg = 0, modHealBonus = 0;
  let hasStealth = false, hasIgnoreAllLimits = false;
  modifiers.forEach(m => {
    const mult = m.multiplier || 1;
    if (m.bonusType === 'attack') attackMod *= mult;
    else if (m.bonusType === 'defense') defenseMod *= mult;
    else if (m.bonusType === 'heal') healMod *= mult;
    else if (m.bonusType === 'all') { attackMod *= mult; defenseMod *= mult; healMod *= mult; }
    if (m.draw) effects.draw += m.draw;
    if (m.selfDmgMod) modSelfDmg += m.selfDmgMod;
    if (m.healBonusMod) modHealBonus += m.healBonusMod;
    if (m.stealthMod) hasStealth = true;
    if (m.ignoreAllLimits) hasIgnoreAllLimits = true;
    if (m.drawLessNextMod) effects.drawLessNext += m.drawLessNextMod;
    if (m.fullPenetrateMod) effects.ignoreBlock = true;
    if (m.doubleExecute) effects._doubleExecute = true;
    if (m.partialPenetrate) effects._partialPenetrate = Math.max(effects._partialPenetrate||0, m.partialPenetrate);
    if (m.ignoreBuffsMod) effects._ignoreBuffs = true;
    if (m.noCounterMod) effects._noCounter = true;
    if (m.healOnAttackMod) effects._healOnAttack = (effects._healOnAttack||0) + m.healOnAttackMod;
    if (m.forceAoeMod) effects.aoe = true;
    if (m.ignoreSelfDmg) effects._ignoreSelfDmg = true;
    if (m.flatBonus) effects._flatAttackBonus = (effects._flatAttackBonus||0) + m.flatBonus;
    if (m.weakenMod) effects.applyWeak = Math.max(effects.applyWeak, m.weakenMod);
  });

  if (hasStealth) effects.ignoreBlock = true;

  let splitAttackToBlock = false;
  let orRandomMult = false;
  let doubleExecuteConn = false;
  connectors.forEach(c => {
    if (c.draw) effects.draw += c.draw;
    if (c.splitAttackToBlock) splitAttackToBlock = true;
    if (c.orRandom) orRandomMult = true;
    if (c.doubleExecuteConn) doubleExecuteConn = true;
    if (c.helpConnector) {
      const helpers = subjects.filter(s => s.word !== '我');
      helpers.forEach(h => {
        if (h.randomEffect) {
          const roll = Math.random();
          if (roll < 0.33) { subjectAttackBonus += 4; grammarNotes.push(`🤝 帮·${h.word}→攻击+4`); }
          else if (roll < 0.66) { subjectDefenseBonus += 4; grammarNotes.push(`🤝 帮·${h.word}→格挡+4`); }
          else { effects.draw += 1; grammarNotes.push(`🤝 帮·${h.word}→抽1牌`); }
        } else if (h.drunkRandom) {
          const roll = Math.floor(Math.random() * 5) + 1;
          subjectAttackBonus += roll; grammarNotes.push(`🤝 帮·${h.word}→攻击+${roll}`);
        } else {
          const b = h.powerBonus || 0;
          if (b > 0) {
            subjectAttackBonus += b; grammarNotes.push(`🤝 帮·${h.word}→+${b}`);
          }
        }
      });
    }
  });

  for (let vi = 0; vi < realVerbs.length; vi++) {
    const v = realVerbs[vi];
    let power = v.upgraded ? (v.upgPower || v.basePower) : v.basePower;
    if (v.spendGold) {
      if (G.gold >= v.spendGold) {
        effects._spendGold = (effects._spendGold || 0) + v.spendGold;
      } else {
        power = Math.floor(power * 0.3);
        grammarNotes.push('💸 金币不足，氪金减弱');
      }
    }

    const subjectIsWo = subjects.some(s => s.word === '我') || subjects.length === 0;
    const subjectIsEnemy = hasEnemyTarget || subjects.some(s => {
      const w = s.word;
      return w === '敌人' || G.enemies.some(e => e.name === w);
    });

    if (v.moyuSpecial) {
      if (subjectIsEnemy) {
        effects.applyVuln += (v.upgraded ? 4 : 3);
        grammarNotes.push(`🐟 摸鱼→敌人易伤${v.upgraded?4:3}回合`);
      } else {
        effects.heal += Math.floor(((v.upgraded ? v.upgPower : v.basePower) + subjectHealBonus + objHealBonus) * healMod);
        grammarNotes.push(`🐟 摸鱼→我方回血${v.upgraded ? v.upgPower : v.basePower}`);
      }
      continue;
    }
    if (v.bailanSpecial) {
      if (subjectIsEnemy) {
        effects._stunEnemy = true;
        grammarNotes.push('🦥 摆烂→敌人跳过下次攻击');
      } else {
        effects.block += Math.floor(((v.upgraded ? v.upgPower : v.basePower) + subjectDefenseBonus + objDefenseBonus) * defenseMod);
        effects.drawLessNext += v.drawLessNext || 1;
        grammarNotes.push(`🦥 摆烂→格挡${v.upgraded ? v.upgPower : v.basePower}，少抽1`);
      }
      continue;
    }
    if (v.liuleSpecial) {
      if (subjectIsEnemy) {
        effects.applyWeak += 2;
        grammarNotes.push('🏃 溜了→敌人降攻击2回合');
      } else {
        effects.block += Math.floor(((v.upgraded ? v.upgPower : v.basePower) + subjectDefenseBonus + objDefenseBonus) * defenseMod);
        grammarNotes.push(`🏃 溜了→格挡${v.upgraded ? v.upgPower : v.basePower}`);
      }
      continue;
    }
    if (v.huashuiSpecial) {
      if (subjectIsEnemy) {
        effects.applyWeak += 2;
        grammarNotes.push('🏊 划水→敌人降攻击2回合');
      } else {
        effects.heal += Math.floor(((v.upgraded ? v.upgPower : v.basePower) + subjectHealBonus + objHealBonus) * healMod);
        grammarNotes.push(`🏊 划水→回血${v.upgraded ? v.upgPower : v.basePower}`);
      }
      continue;
    }
    if (v.pengciSpecial) {
      effects._reflectDmg = 0.5;
      grammarNotes.push('🤕 碰瓷→本回合反弹50%伤害');
      continue;
    }
    if (v.tiredSpecial) {
      if (subjectIsEnemy) {
        effects._stunEnemy = true;
        grammarNotes.push('😴 累了→敌人跳过下次攻击');
      } else {
        effects.heal += 4;
        effects.drawLessNext += 2;
        grammarNotes.push('😴 累了→回血4，少抽2');
      }
      continue;
    }
    if (v.sleepSpecial) {
      if (subjectIsEnemy) {
        effects._stunEnemy = true;
        effects._stunEnemy2 = true;
        grammarNotes.push('💤 沉睡→敌人眩晕2回合');
      } else {
        effects.heal += G.maxHp;
        effects._skipNextTurn = true;
        grammarNotes.push('💤 沉睡→全回血但跳过下回合');
      }
      continue;
    }
    if (v.fallenSpecial) {
      if (subjectIsEnemy) {
        effects._reduceStrength = 3;
        grammarNotes.push('🕳️ 堕落→敌人-3力量');
      } else {
        effects.strengthGain += 3;
        effects._vulnSelfNext = true;
        grammarNotes.push('🕳️ 堕落→+3力量但易伤2回合');
      }
      continue;
    }
    if (v.shuaiguoSpecial) {
      effects._transferDebuffs = true;
      grammarNotes.push('🍳 甩锅→debuff转给敌人');
      continue;
    }
    if (v.tangyingSpecial) {
      effects.block += Math.floor(((v.upgraded ? v.upgPower : v.basePower) + subjectDefenseBonus + objDefenseBonus) * defenseMod);
      effects._goldOnKill = (effects._goldOnKill || 0) + 10;
      grammarNotes.push(`😴 躺赢→格挡${v.upgraded ? v.upgPower : v.basePower}+击杀+10金币`);
      continue;
    }
    if (v.kaibaiSpecial) {
      effects.block += 99;
      effects.damage = 0;
      effects._noAttack = true;
      grammarNotes.push('🫠 开摆→无敌但无法攻击');
      continue;
    }
    if (v.puaSpecial) {
      effects.applyWeak += 3;
      grammarNotes.push('😈 PUA→敌人攻击-3持续2回合');
      continue;
    }
    if (v.stealStrength) {
      let dmg = (power + subjectAttackBonus + objAttackBonus + G.strength) * attackMod;
      if (G.weak > 0 && !hasIgnoreAllLimits) dmg *= 0.75;
      effects.damage += Math.floor(dmg);
      effects.strengthGain += v.stealStrength;
      effects._stealStrength = v.stealStrength;
      grammarNotes.push(`🦶 拉踩→偷${v.stealStrength}力量`);
      continue;
    }
    if (v.poisonVerb) {
      effects._poison = { dmg: v.upgraded ? v.upgPower : v.basePower, turns: v.poisonDuration || 3 };
      grammarNotes.push(`🌱 种草→中毒${v.poisonDuration}回合`);
      continue;
    }
    if (v.dodgeNext) {
      effects.block += 99;
      grammarNotes.push('🏃 溜了→闪避(格挡99)');
      continue;
    }
    if (v.executeVerb) {
      effects._execute = {
        threshold: v.executeThreshold || 0.3,
        percent: v.executePercent || 0.3,
      };
      if (v.selfDmgVerb) { effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg || 0) + v.selfDmgVerb; }
      grammarNotes.push(`💀 斩杀(≤${Math.round((v.executeThreshold||0.3)*100)}%击杀/否则扣${Math.round((v.executePercent||0.3)*100)}%血)，自伤${v.selfDmgVerb||0}`);
      continue;
    }
    if (v.combatType === 'attack') {
      let dmg = (power + subjectAttackBonus + objAttackBonus + G.strength) * attackMod;
      if (G.weak > 0 && !hasIgnoreAllLimits) dmg *= 0.75;
      const hits = v.hits || 1;
      effects.damage += Math.floor(dmg) * hits;
      if (v.forceAoe) effects.aoe = true;
      if (v.ignoreBlock) effects.ignoreBlock = true;
      if (v.applyWeakVerb) effects.applyWeak = Math.max(effects.applyWeak, v.applyWeakVerb);
      if (v.kickbackVerb) effects._kickback = true;
      if (v.reduceBlockVerb) effects._reduceEnemyBlock = (effects._reduceEnemyBlock||0) + v.reduceBlockVerb;
      if (v.selfDmgVerb) { effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg||0) + v.selfDmgVerb; }
      if (v.bounceVerb) effects._bounce = true;
      if (v.tauntVerb) effects._taunt = true;
      if (v.confuseVerb) effects._confuse = true;
    } else if (v.combatType === 'defense') {
      effects.block += Math.floor((power + subjectDefenseBonus + objDefenseBonus) * defenseMod);
      if (v.drawLessNext) effects.drawLessNext += v.drawLessNext;
      if (v.healAlsoVerb) effects.heal += v.healAlsoVerb;
      if (v.vulnSelfNext) effects._vulnSelfNext = true;
    } else if (v.combatType === 'heal') {
      effects.heal += Math.floor((power + subjectHealBonus + objHealBonus) * healMod);
      if (v.blockAlso) effects.block += Math.floor((v.upgraded ? Math.ceil(v.blockAlso*1.5) : v.blockAlso) * defenseMod);
    } else if (v.combatType === 'buff') {
      effects.strengthGain += v.upgraded ? (v.upgPower||v.basePower) : v.basePower;
      if (v.blockAlso) effects.block += Math.floor((v.upgraded ? Math.ceil(v.blockAlso*1.5) : v.blockAlso) * defenseMod);
    } else if (v.combatType === 'special') {
      if (v.special === 'zeroCost') effects.zeroCost = true;
    }
    if (v.draw) effects.draw += (v.upgraded && v.draw ? v.draw + 1 : v.draw);
    if (v.exhaust) v._shouldExhaust = true;
  }

  if (modHealBonus > 0) effects.heal += modHealBonus;
  if (modSelfDmg > 0) { effects.selfHarm = true; effects.selfHarmDmg = modSelfDmg; effects.selfHarmBuff = 0; }

  if (hasSelfTarget && effects.damage > 0) {
    effects.selfHarm = true;
    effects.selfHarmDmg = (effects.selfHarmDmg || 0) + effects.damage;
    effects.selfHarmBuff = 2;
    effects.damage = 0;
    grammarNotes.push('自伤：伤害自身，+2力量');
  }

  if (hasQuestion && effects.damage > 0 && !effects.selfHarm) {
    effects.damage = 0;
  }

  if (splitAttackToBlock && effects.damage > 0) {
    const half = Math.floor(effects.damage / 2);
    effects.damage -= half;
    effects.block += half;
    grammarNotes.push('「但是」攻守兼备');
  }

  const totalMult = grammarMult * literaryMult * punctMult * excPosPenalty;

  const excPosScale = excPosResult.legal ? 1.0 : 0.5;
  const finalExcAttack = 1 + (excAttackMult - 1) * excPosScale;
  const finalExcDefense = 1 + (excDefenseMult - 1) * excPosScale;
  const finalExcHeal = 1 + (excHealMult - 1) * excPosScale;

  if (effects._flatAttackBonus) effects.damage += effects._flatAttackBonus;
  if (effects._healOnAttack && effects.damage > 0) effects.heal += effects._healOnAttack;
  if (effects._ignoreSelfDmg && effects.selfHarm) { effects.selfHarm = false; effects.selfHarmDmg = 0; }
  if (effects._reverseNeg) {
    if (effects.selfHarm) { effects.heal += effects.selfHarmDmg; effects.selfHarm = false; effects.selfHarmDmg = 0; }
    if (effects.drawLessNext > 0) { effects.draw += effects.drawLessNext; effects.drawLessNext = 0; }
  }

  effects.damage = Math.floor(effects.damage * totalMult * finalExcAttack);
  if (effects._crit) effects.damage = Math.floor(effects.damage * 1.5);
  effects.block = Math.floor(effects.block * totalMult * finalExcDefense);
  effects.heal = Math.floor(effects.heal * totalMult * finalExcHeal);
  if (effects.selfHarm) effects.selfHarmDmg = Math.floor(effects.selfHarmDmg * totalMult);
  effects.draw += excExtraDraw;
  effects.heal += excExtraHeal;
  if (excExtraEnergy > 0) effects._bonusEnergy = excExtraEnergy;

  effects._poetryLevel = literaryMult;

  if (orRandomMult && effects.damage > 0) {
    effects.damage = Math.floor(effects.damage * 1.5);
    if (G.enemies.filter(e => e.hp > 0).length > 0) {
      const alive = G.enemies.map((e,i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      effects.targetEnemyIdx = alive[Math.floor(Math.random() * alive.length)];
      effects.aoe = false;
      effects.multiTargetIndices = null;
      grammarNotes.push(`🎲「或」→随机目标×1.5`);
    }
  }

  if (doubleExecuteConn || effects._doubleExecute) {
    effects.damage = Math.floor(effects.damage * 2);
    effects.block = Math.floor(effects.block * 2);
    effects.heal = Math.floor(effects.heal * 2);
    grammarNotes.push('🔁 效果×2！');
  }

  if (realVerbs.some(v => v.combatType === 'attack') && !effects.selfHarm && !hasQuestion && effects.damage < 1) effects.damage = 1;

  if (hasMultiTarget) {
    effects.multiTargetIndices = multiTargetIndices;
    grammarNotes.push(`🎯 多目标×${multiTargetIndices.length}`);
  }

  return {
    text: sentenceText,
    grammarMult, grammarNotes,
    literaryMult, literaryNotes,
    punctMult, punctNotes,
    excNotes, excAttackMult, excDefenseMult, excHealMult,
    totalMult,
    effects,
    cards,
    duizhangResult,
  };
}
