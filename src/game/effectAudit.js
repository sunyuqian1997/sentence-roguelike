// Pure audit rules for recorded chants. Keeping this module browser-agnostic
// lets the game check localStorage entries and the CLI check chantlog.ndjson
// with the exact same expectations.

const isEnemyReference = (card) => card && (
  card.role === 'enemy-target'
  || card.word === '敌人'
  || card.word === '你'
  || card.word === '尔'
  || card.word === '汝'
);

function clauses(cards) {
  const out = [];
  let current = [];
  for (const card of cards || []) {
    if (card?.pos === 'punctuation' && card?.punctType === 'comma') {
      out.push(current);
      current = [];
    } else current.push(card);
  }
  out.push(current);
  return out;
}

export function auditEffectEntries(entries = []) {
  const issues = [];
  for (const entry of entries) {
    if (!entry || entry.kind !== 'sentence' || !Array.isArray(entry.cards)) continue;
    const effects = entry.effects || {};
    for (const clause of clauses(entry.cards)) {
      clause.forEach((card, verbIndex) => {
        if (card?.pos !== 'verb' || card?.ruleType === 'special') return;
        const subjectIsEnemy = clause.slice(0, verbIndex).some(isEnemyReference);
        if (!subjectIsEnemy) return;

        const prefix = `#${entry.n ?? '?'}「${entry.text || ''}」`;
        if (card.combatType === 'defense' && !(effects.enemyBlock?.amount > 0)) {
          issues.push(`${prefix}: 敌方主语“${card.word}”没有获得敌方格挡`);
        }
        if (card.combatType === 'heal' && !(effects.enemyHeal?.amount > 0)) {
          issues.push(`${prefix}: 敌方主语“${card.word}”没有获得敌方治疗`);
        }
        if (card.combatType === 'buff' && !(effects.enemyStrength?.amount > 0)) {
          issues.push(`${prefix}: 敌方主语“${card.word}”没有获得敌方力量`);
        }
        if (card.enemyRestVerb && !effects.enemyRest) {
          issues.push(`${prefix}: “${card.word}”没有让敌方停止攻击`);
        }
      });
    }
  }
  return issues;
}
