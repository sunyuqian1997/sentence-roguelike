import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STARTER_DECK_KEYS,
  SYNTAX_LESSONS,
  isCardAvailableAtFloor,
  lessonRewardKeys,
  nextSyntaxLesson,
} from '../src/data/deckProgression.js';
import { getSentenceValidity } from '../src/game/sentenceValidity.js';
import { evaluateSentence } from '../src/game/evaluator/index.js';
import { G } from '../src/game/state.js';

const WORD_DEFS = JSON.parse(fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const card = (key) => ({ ...WORD_DEFS[key], key });
const me = () => ({ word: '我', pos: 'subject', _isFixedWo: true });
const enemy = (index) => ({
  word: G.enemies[index].name,
  pos: 'object',
  _isEnemyTarget: true,
  _enemyIdx: index,
});

assert.equal(new Set(STARTER_DECK_KEYS).size, STARTER_DECK_KEYS.length, 'starter deck has no duplicates');
assert.equal(STARTER_DECK_KEYS.length, 15, 'starter deck stays compact enough to learn');
SYNTAX_LESSONS.forEach((lesson) => {
  assert(!STARTER_DECK_KEYS.includes(lesson.key), `${lesson.id} is a real unlock, not starter noise`);
  assert.equal(isCardAvailableAtFloor(lesson.key, lesson.minFloor - 1), false);
  assert.equal(isCardAvailableAtFloor(lesson.key, lesson.minFloor), true);
});

let owned = [...STARTER_DECK_KEYS];
for (const lesson of SYNTAX_LESSONS) {
  const offered = nextSyntaxLesson(owned, lesson.minFloor);
  assert.equal(offered?.id, lesson.id, `floor ${lesson.minFloor} offers ${lesson.id}`);
  owned.push(...lessonRewardKeys(offered));
}
assert.equal(nextSyntaxLesson(owned, 99), null, 'completed curriculum has no stale lesson');

G.enemies = [
  { name: '纸鬼', hp: 30, maxHp: 30 },
  { name: '墨妖', hp: 30, maxHp: 30 },
];

const examples = [
  ['基础攻击', [me(), card('zhan'), enemy(0)], 'sentence'],
  ['判断句', [me(), card('shi_copula'), card('mao')], 'sentence'],
  ['万物皆兵', [me(), card('yong'), card('mao'), card('cu'), enemy(0)], 'sentence'],
  ['呼名登场', [card('oh'), card('comma'), card('hatsunemiku')], 'summon'],
  ['祈使命令', [enemy(0), card('gei'), me(), card('cu')], 'sentence'],
  ['移步换景', [me(), card('qu_verb'), card('haibian')], 'sentence'],
];
for (const [label, cards, code] of examples) {
  const validity = getSentenceValidity(cards);
  assert.equal(validity.ok, true, `${label} should be chantable: ${validity.reason || ''}`);
  assert.equal(validity.code, code, `${label} reaches the intended resolver`);
}

const instrument = evaluateSentence(examples[2][1]);
assert.equal(instrument.effects._coActors, undefined, 'an instrument must not also become a summon');
assert.equal(instrument.effects._instrument?.word, '猫');

const compound = evaluateSentence([
  me(), card('zhan'), enemy(0), card('comma'), card('yingzi'), card('sui'), enemy(1),
]);
const shadow = compound.effects._coActors?.find((actor) => actor.name === '影子');
assert(shadow, 'named subject in second clause acts independently');
assert.equal(shadow.targetEnemyIdx, 1, 'co-actor follows its own clause target');
assert.deepEqual(compound.effects.multiTargetIndices, [0, 1]);
assert(compound.effects.damage < 20, 'compound main damage is split instead of duplicated per enemy');

console.log('deck-progression-ok');
