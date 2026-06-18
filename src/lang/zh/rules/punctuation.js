// Punctuation scoring + 对仗 (parallel couplet) detection.
// Writes ctx.punctMult + ctx.punctNotes + ctx.duizhangResult.

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

  const result = { text1, text2, len1, len2, matched: false, type: 'none', multiplier: 1.1 };

  if (len1 !== len2) {
    result.label = '✗ 对仗不全（字数不齐）';
    return result;
  }

  result.matched = true;

  // 对仗的灵魂是「工对」—— 字数相等 + 词性对称。五言/七言的高倍率必须同时满足
  // 词性对称(struct1===struct2),否则只是凑字数的伪对仗,降级到 ×1.5。
  // (修复:旧版只看字数,"残句怪是给，守戳挡我猫"两边各5字就吃满 ×2.5。)
  const symmetric = struct1 === struct2;

  if (len1 === 5 && len2 === 5 && symmetric) {
    result.type = 'lushi'; result.multiplier = 2.5;
    result.label = '✓ 律诗对仗！五言工整 ×2.5';
    return result;
  }
  if (len1 === 7 && len2 === 7 && symmetric) {
    result.type = 'jueju'; result.multiplier = 3.0;
    result.label = '✓ 绝句对仗！七言工整 ×3.0';
    return result;
  }
  if (symmetric) {
    result.type = 'perfect'; result.multiplier = 2.0;
    result.label = '✓ 完美对仗！结构对称 ×2.0';
    return result;
  }

  // 字数相等但词性不对称 —— 伪对仗, 给个基础奖励即可。
  result.type = 'basic'; result.multiplier = 1.5;
  result.label = '✓ 对仗工整（字数相同）×1.5';
  return result;
}

export function applyPunctuation(ctx) {
  if (ctx.hasPeriod) { ctx.punctMult *= 1.15; ctx.punctNotes.push('句号「。」完句 ×1.15'); }
  if (ctx.hasExclamation) { ctx.punctMult *= 1.3; ctx.punctNotes.push('感叹号「！」爆发 ×1.3'); }
  if (ctx.hasQuestion) { ctx.punctNotes.push('问号「？」→ 削弱敌人2回合'); }

  if (ctx.hasComma) {
    const dz = detectDuizhang(ctx.cards);
    ctx.duizhangResult = dz;
    if (dz) { ctx.punctMult *= dz.multiplier; ctx.punctNotes.push(dz.label); }
    else { ctx.punctMult *= 1.1; ctx.punctNotes.push('逗号「，」复句 ×1.1'); }
  }
}
