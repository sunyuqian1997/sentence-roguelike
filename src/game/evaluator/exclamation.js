// Exclamation cards (感叹词): per-type multipliers, rider effects, and the
// placement legality check (phrase exclamations need comma separation).
// Writes ctx.exc.* and ctx.excNotes; may touch ctx.effects / ctx.literaryMult.

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

export function applyExclamations(ctx) {
  const { effects, exc } = ctx;

  ctx.exclamationCards.forEach(c => {
    const m = c.excMult || 1.2;
    if (c.excType === 'attack') { exc.attackMult *= m; ctx.excNotes.push(`🔥「${c.word}」伤害×${m}`); }
    else if (c.excType === 'defense') { exc.defenseMult *= m; ctx.excNotes.push(`🔥「${c.word}」格挡×${m}`); }
    else { exc.attackMult *= m; exc.defenseMult *= m; exc.healMult *= m; ctx.excNotes.push(`🔥「${c.word}」全效×${m}`); }
    if (c.excDraw) { exc.extraDraw += c.excDraw; ctx.excNotes.push(`📜「${c.word}」抽${c.excDraw}牌`); }
    if (c.excHeal) { exc.extraHeal += c.excHeal; ctx.excNotes.push(`♥「${c.word}」回血${c.excHeal}`); }
    if (c.excEnergy) { exc.extraEnergy += c.excEnergy; ctx.excNotes.push(`⚡「${c.word}」下回合+${c.excEnergy}能量`); }
    if (c.excWeaken) { effects.applyWeak = Math.max(effects.applyWeak, c.excWeaken); ctx.excNotes.push(`😑「${c.word}」敌攻击-${c.excWeaken}`); }
    if (c.excSkipChance) { effects._excSkipChance = (effects._excSkipChance || 0) + c.excSkipChance; ctx.excNotes.push(`😂「${c.word}」${Math.round(c.excSkipChance * 100)}%敌跳过`); }
    if (c.excDrawNext) { effects._drawNextTurn = (effects._drawNextTurn || 0) + c.excDrawNext; ctx.excNotes.push(`🧬「${c.word}」下回合抽牌+${c.excDrawNext}`); }
    if (c.excPenetrate) { effects.ignoreBlock = true; ctx.excNotes.push(`💥「${c.word}」穿透格挡`); }
    if (c.excStripBlock) { effects._stripTargetBlock = true; ctx.excNotes.push(`🛡️💥「${c.word}」扒光目标格挡`); }
    if (c.excBlockDebuff) { effects._blockDebuffNext = c.excBlockDebuff; ctx.excNotes.push(`🔥「${c.word}」下回合格挡-50%`); }
    if (c.excReverseNeg) { effects._reverseNeg = true; ctx.excNotes.push(`🔄「${c.word}」负面变正面`); }
    if (c.excSelfDmg) { effects.selfHarm = true; effects.selfHarmDmg = (effects.selfHarmDmg || 0) + c.excSelfDmg; ctx.excNotes.push(`💀「${c.word}」自伤${c.excSelfDmg}`); }
    if (c.excPoetry) { ctx.literaryMult += c.excPoetry; ctx.literaryNotes.push(`✨「${c.word}」诗意+${c.excPoetry}`); }
  });

  // Position legality uses the ORIGINAL card order, not the normalized one.
  exc.posResult = checkExclamationPosition(ctx.rawCards);
  if (exc.posResult.note) ctx.excNotes.push(exc.posResult.note);
}
