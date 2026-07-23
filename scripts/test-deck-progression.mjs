import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  STARTER_DECK_KEYS,
  SYNTAX_LESSONS,
  draftRewardKeys,
  isCardAvailableAtFloor,
  lessonRewardKeys,
  nextSyntaxLesson,
} from '../src/data/deckProgression.js';
import { getSentenceValidity } from '../src/game/sentenceValidity.js';
import { evaluateSentence } from '../src/game/evaluator/index.js';
import { G } from '../src/game/state.js';
import { auditEffectEntries } from '../src/game/effectAudit.js';

const WORD_DEFS = JSON.parse(fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'));
const card = (key) => ({ ...WORD_DEFS[key], key });
const me = () => ({ word: '我', pos: 'subject', _isFixedWo: true });
const enemy = (index) => ({
  word: G.enemies[index].name,
  pos: 'object',
  _isEnemyTarget: true,
  _enemyIdx: index,
});
const selfTarget = () => ({ word: '我', pos: 'object', _isSelfTarget: true });

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
  ['结伴主语', [card('mao'), card('he'), card('yingzi'), card('shou'), selfTarget()], 'sentence'],
  ['关系句', [card('mao'), card('bang'), me(), card('cu'), enemy(0)], 'sentence'],
  ['兼语命令', [me(), card('rang'), enemy(0), card('cu')], 'sentence'],
  ['疑问反转', [me(), card('cu'), enemy(0), card('question')], 'sentence'],
  ['顺承复句', [me(), card('shou'), card('comma'), card('ranhou'), card('yingzi'), card('cu'), enemy(0)], 'sentence'],
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

const enemyRest = evaluateSentence([enemy(0), card('tangping')]);
assert.equal(enemyRest.effects.block, 0, 'enemy-subject defense must not block for the player');
assert.equal(enemyRest.effects.heal, 0, 'enemy-subject heal rider must not heal the player');
assert.equal(enemyRest.effects._enemyBlock?.enemyIdx, 0, 'paper ghost receives its own block');
assert(enemyRest.effects._enemyBlock?.amount > 0, 'paper ghost block has a real value');
assert.equal(enemyRest.effects._enemyHeal?.enemyIdx, 0, 'paper ghost receives its own heal');
assert.equal(enemyRest.effects._enemyRest?.enemyIdx, 0, 'paper ghost skips its own attack');

const correctlyLoggedRest = {
  n: 1,
  kind: 'sentence',
  text: '纸鬼躺平',
  cards: [
    { word: '纸鬼', role: 'enemy-target', idx: 0 },
    { word: '躺平', pos: 'verb', combatType: 'defense', enemyRestVerb: true, ruleType: 'generic' },
  ],
  effects: {
    enemyBlock: enemyRest.effects._enemyBlock,
    enemyHeal: enemyRest.effects._enemyHeal,
    enemyRest: enemyRest.effects._enemyRest,
  },
};
assert.deepEqual(auditEffectEntries([correctlyLoggedRest]), [], 'effect audit accepts correctly directed rest');
assert.equal(
  auditEffectEntries([{ ...correctlyLoggedRest, effects: { block: 6, heal: 2 } }]).length,
  2,
  'effect audit catches both wrong block direction and missing rest',
);

const catGuardsMeCards = [card('mao'), card('shou'), selfTarget()];
assert.equal(getSentenceValidity(catGuardsMeCards).ok, true, '猫守我 is a valid transitive defense');
const catGuardsMe = evaluateSentence(catGuardsMeCards);
const guardianCat = catGuardsMe.effects._coActors?.find((actor) => actor.name === '猫');
assert(guardianCat?.block > 0, '猫 provides its own block');
assert.equal(guardianCat.patient, 'self', '猫守我 records 我 as the protected patient');
assert.equal(catGuardsMe.effects.block, 0, '猫守我 does not duplicate the block as a player action');

const shatterTarget = evaluateSentence([me(), card('sui'), enemy(0)]);
assert(shatterTarget.effects.damage > 0, '我碎X damages X');
assert.equal(shatterTarget.effects.targetEnemyIdx, 0);
const targetShatters = evaluateSentence([enemy(0), card('sui')]);
assert(targetShatters.effects.damage > 0, 'X碎 damages X');
assert.equal(targetShatters.effects._enemySelfAction?.enemyIdx, 0, 'X碎 is presented as X shattering itself');

const shatterBoneCards = [me(), card('sui'), enemy(1), card('guge')];
assert.equal(getSentenceValidity(shatterBoneCards).ok, true, '我碎X骨 treats 骨 as X body part');
const shatterBone = evaluateSentence(shatterBoneCards);
assert.equal(shatterBone.effects.targetEnemyIdx, 1, 'body-part phrase keeps X as combat target');
assert(shatterBone.effects.damage > shatterTarget.effects.damage, '骨 still supplies its critical modifier');

const periodCompoundCards = [me(), card('cu'), enemy(0), card('period'), card('wuming'), card('cu')];
assert.equal(getSentenceValidity(periodCompoundCards).ok, true, '句号 separates two complete combat clauses');
const periodCompound = evaluateSentence(periodCompoundCards);
const nameless = periodCompound.effects._coActors?.find((actor) => actor.name === '无名者');
assert(nameless?.damage > 0, '无名者 performs the second-clause verb');
assert.equal(nameless.targetEnemyIdx, 0, 'second clause inherits the established enemy target');

const rewardDeck = STARTER_DECK_KEYS.map(card);
const rewardDraft = draftRewardKeys({
  definitions: WORD_DEFS,
  deck: rewardDeck,
  floor: 5,
  count: 3,
  excludeKeys: ['shi_copula'],
  rng: () => 0,
});
assert.equal(rewardDraft.length, 3, 'reward draft fills all non-lesson slots');
assert.equal(new Set(rewardDraft.map(choice => choice.key)).size, 3, 'reward choices have distinct keys');
assert(rewardDraft.every(choice => !STARTER_DECK_KEYS.includes(choice.key)), 'reward draft favors genuinely new words');
assert.deepEqual(
  rewardDraft.map(choice => choice.label),
  ['新词入句', '补全搭配', '风格变奏'],
  'every reward slot communicates a distinct expressive direction',
);
assert(rewardDraft.every(choice => choice.example && choice.note), 'every reward explains how it changes a sentence');

console.log('deck-progression-ok');
