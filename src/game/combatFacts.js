import { G } from './state.js';

function blankEnemyFact() {
  return {
    damageTaken: 0,
    damageDealt: 0,
    blocked: 0,
    defended: 0,
    buffed: false,
    lastIntent: null,
  };
}

function blankRound() {
  return {
    player: {
      damageDealt: 0,
      damageTaken: 0,
      blockGained: 0,
      damageBlocked: 0,
      healed: 0,
      summons: [],
      coActors: [],
      identities: [],
      sentences: [],
    },
    enemies: {},
  };
}

function state() {
  if (!G.combatFacts) G.combatFacts = { current: blankRound(), previous: null };
  return G.combatFacts;
}

function enemyIndex(enemy) {
  return (G.enemies || []).indexOf(enemy);
}

function enemyFact(index) {
  const facts = state().current.enemies;
  if (!facts[index]) facts[index] = blankEnemyFact();
  return facts[index];
}

export function resetCombatFacts() {
  G.combatFacts = { current: blankRound(), previous: null };
  G.lastRoundSummary = null;
}

// Called once when a new player selection phase begins. Everything accumulated
// since the previous selection becomes the dialogue summary for this turn.
export function beginSelectionFacts(turn) {
  const facts = state();
  if ((turn || 0) > 1) facts.previous = facts.current;
  else facts.previous = null;
  facts.current = blankRound();
  G.lastRoundSummary = facts.previous;
  return facts.previous;
}

export function snapshotCombatVitals() {
  return {
    hp: G.hp,
    block: G.block,
    enemyHp: (G.enemies || []).map((enemy) => enemy?.hp || 0),
    enemyBlock: (G.enemies || []).map((enemy) => enemy?.block || 0),
  };
}

export function recordResolvedPlayerAction({ before, effects, summon, sentence } = {}) {
  const round = state().current;
  const after = snapshotCombatVitals();
  const prior = before || after;
  const player = round.player;

  (G.enemies || []).forEach((enemy, index) => {
    const damage = Math.max(0, (prior.enemyHp[index] || 0) - (after.enemyHp[index] || 0));
    if (!damage) return;
    player.damageDealt += damage;
    enemyFact(index).damageTaken += damage;
  });
  player.blockGained += Math.max(0, after.block - (prior.block || 0));
  player.healed += Math.max(0, after.hp - (prior.hp || 0));
  if (sentence) player.sentences.push(sentence);

  if (summon?.summonName && !player.summons.includes(summon.summonName)) {
    player.summons.push(summon.summonName);
  }
  for (const actor of effects?._coActors || []) {
    if (actor?.name && !player.coActors.includes(actor.name)) player.coActors.push(actor.name);
  }
  for (const predicate of effects?._predicates || []) {
    if (predicate?.kind !== 'identity') continue;
    if (predicate.target === 'self' && predicate.identityWord) {
      player.identities.push({ actor: '我', identity: predicate.identityWord });
    } else if (predicate.target === 'coactor' && predicate.subjectWord && predicate.identityWord) {
      player.identities.push({ actor: predicate.subjectWord, identity: predicate.identityWord });
    }
  }
}

export function recordEnemyDamage(enemy, { hpDamage = 0, blocked = 0, intent } = {}) {
  const index = enemyIndex(enemy);
  if (index < 0) return;
  const fact = enemyFact(index);
  fact.damageDealt += Math.max(0, hpDamage);
  fact.blocked += Math.max(0, blocked);
  fact.lastIntent = intent || enemy.nextIntent || fact.lastIntent;
  const player = state().current.player;
  player.damageTaken += Math.max(0, hpDamage);
  player.damageBlocked += Math.max(0, blocked);
}

export function recordEnemyAction(enemy, before = {}) {
  const index = enemyIndex(enemy);
  if (index < 0) return;
  const fact = enemyFact(index);
  fact.defended += Math.max(0, (enemy.block || 0) - (before.block || 0));
  fact.buffed = fact.buffed || (enemy.strength || 0) > (before.strength || 0);
  fact.lastIntent = enemy.nextIntent || fact.lastIntent;
}

export function rememberActorIdentity(actor, identity) {
  if (!actor || !identity) return;
  if (!G.actorIdentities) G.actorIdentities = {};
  G.actorIdentities[actor] = identity;
}

export function actorIdentity(actor) {
  return G.actorIdentities?.[actor] || null;
}
