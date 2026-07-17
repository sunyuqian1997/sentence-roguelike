import assert from 'node:assert/strict';
import { getSentenceValidity } from '../src/game/sentenceValidity.js';
import { detectPredicates } from '../src/game/poetics.js';
import { G } from '../src/game/state.js';
import {
  actorIdentity,
  beginSelectionFacts,
  recordEnemyDamage,
  recordResolvedPlayerAction,
  rememberActorIdentity,
  resetCombatFacts,
  snapshotCombatVitals,
} from '../src/game/combatFacts.js';

const subject = (word) => ({ word, pos: 'subject' });
const target = (word = '纸鬼', index = 0) => ({ word, pos: 'object', _isEnemyTarget: true, _enemyIdx: index });
const verb = (word = '斩') => ({ word, pos: 'verb', combatType: 'attack', valence: 'trans' });
const copula = () => ({ word: '是', pos: 'connector', copulaConn: true });
const comma = () => ({ word: '，', pos: 'punctuation', punctType: 'comma' });
const period = () => ({ word: '。', pos: 'punctuation', punctType: 'period' });

assert.equal(getSentenceValidity([]).code, 'empty');
assert.equal(getSentenceValidity([subject('猫')]).ok, false, 'single named actor is previewable but not chantable');
assert.equal(getSentenceValidity([period()]).ok, false, 'punctuation-only fragment is invalid');
assert.equal(getSentenceValidity([subject('我'), verb(), comma()]).ok, false, 'trailing comma exposes empty clause');
assert.equal(getSentenceValidity([comma(), subject('我'), verb(), target()]).ok, false, 'leading comma exposes empty clause');
assert.equal(getSentenceValidity([subject('我'), verb(), target(), period()]).ok, true, 'complete SVO sentence remains valid');

const selfIdentity = detectPredicates([subject('我'), copula(), subject('猫')])[0];
assert.equal(selfIdentity.target, 'self');
assert.equal(selfIdentity.identityWord, '猫');

const actorIdentityPredicate = detectPredicates([subject('皇帝'), copula(), subject('儿子')])[0];
assert.equal(actorIdentityPredicate.target, 'coactor', 'named subject identity must not broadcast onto enemies');
assert.equal(actorIdentityPredicate.subjectWord, '皇帝');
assert.equal(actorIdentityPredicate.identityWord, '儿子');

G.hp = 40; G.block = 0;
G.enemies = [{ name: '纸鬼', hp: 20, maxHp: 20 }];
resetCombatFacts();
beginSelectionFacts(1);
const before = snapshotCombatVitals();
G.enemies[0].hp = 13;
G.block = 5;
recordResolvedPlayerAction({ before, effects: { block: 5 }, sentence: '我守' });
recordEnemyDamage(G.enemies[0], { hpDamage: 3, blocked: 2 });
const summary = beginSelectionFacts(2);
assert.equal(summary.player.damageDealt, 7);
assert.equal(summary.player.blockGained, 5);
assert.equal(summary.player.damageTaken, 3);
assert.equal(summary.enemies[0].damageTaken, 7);

rememberActorIdentity('皇帝', '儿子');
assert.equal(actorIdentity('皇帝'), '儿子');

console.log('battle-rules-ok');
