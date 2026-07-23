import fs from 'node:fs';
import assert from 'node:assert/strict';
import {
  STARTER_DECK_KEYS,
  draftRewardKeys,
  lessonRewardKeys,
  nextSyntaxLesson,
} from '../src/data/deckProgression.js';
import { getSentenceValidity } from '../src/game/sentenceValidity.js';
import { G } from '../src/game/state.js';

const WORD_DEFS = JSON.parse(
  fs.readFileSync(new URL('../src/data/cards.json', import.meta.url), 'utf8'),
);
const card = (key) => ({ ...WORD_DEFS[key], key });
const me = () => ({ word: '我', pos: 'subject', _isFixedWo: true });
const enemy = () => ({ word: '纸鬼', pos: 'object', _isEnemyTarget: true, _enemyIdx: 0 });
const self = () => ({ word: '我', pos: 'object', _isSelfTarget: true });

G.enemies = [{ name: '纸鬼', hp: 30, maxHp: 30 }];

const CAPABILITIES = [
  ['基础主谓宾', [], () => [me(), card('zhan'), enemy()]],
  ['判断身份', ['shi_copula'], () => [me(), card('shi_copula'), card('mao')]],
  ['万物皆兵', ['yong'], () => [me(), card('yong'), card('mao'), card('cu'), enemy()]],
  ['呼名召唤', ['comma', 'hatsunemiku'], () => [card('oh'), card('comma'), card('hatsunemiku')]],
  ['祈使命令', ['gei'], () => [enemy(), card('gei'), me(), card('cu')]],
  ['移步换景', ['qu_verb', 'haibian'], () => [me(), card('qu_verb'), card('haibian')]],
  ['结伴行动', ['he'], () => [card('mao'), card('he'), card('yingzi'), card('shou'), self()]],
  ['个体互助', ['bang'], () => [card('mao'), card('bang'), me(), card('cu'), enemy()]],
  ['兼语改写', ['rang'], () => [me(), card('rang'), enemy(), card('cu')]],
  ['疑问反转', ['question'], () => [me(), card('cu'), enemy(), card('question')]],
  ['顺承复句', ['ranhou', 'comma'], () => [
    me(), card('shou'), card('comma'), card('ranhou'), card('yingzi'), card('cu'), enemy(),
  ]],
];

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function unlockedCapabilities(deckKeys) {
  const owned = new Set(deckKeys);
  return CAPABILITIES.filter(([, requirements, build]) => {
    if (!requirements.every((key) => owned.has(key))) return false;
    return getSentenceValidity(build()).ok;
  }).map(([name]) => name);
}

const strategies = ['syntax-first', 'alternating', 'curious'];
const summaries = [];
for (let run = 0; run < 9; run++) {
  const strategy = strategies[run % strategies.length];
  const rng = seeded(1001 + run);
  const deck = STARTER_DECK_KEYS.map(card);
  const curve = [];

  for (let floor = 1; floor <= 10; floor++) {
    const deckKeys = deck.map((item) => item.key);
    const lesson = nextSyntaxLesson(deckKeys, floor);
    const lessonKeys = lessonRewardKeys(lesson);
    const draft = draftRewardKeys({
      definitions: WORD_DEFS,
      deck,
      floor,
      count: lesson ? 2 : 3,
      excludeKeys: lessonKeys,
      rng,
    });

    const takeLesson = Boolean(lesson) && (
      strategy === 'syntax-first'
      || (strategy === 'alternating' && floor % 2 === 1)
      || (strategy === 'curious' && floor % 3 === 0)
    );
    if (takeLesson) {
      lessonKeys.forEach((key) => deck.push(card(key)));
    } else {
      const pick = strategy === 'curious' ? draft.at(-1) : draft[0];
      if (pick) deck.push(card(pick.key));
    }

    const capabilities = unlockedCapabilities(deck.map((item) => item.key));
    curve.push({
      floor,
      choice: takeLesson ? `新句式:${lesson.title}` : `词牌:${deck.at(-1).word}`,
      capabilityCount: capabilities.length,
      latest: capabilities.at(-1),
      uniqueWords: new Set(deck.map((item) => item.key)).size,
    });
  }

  assert(
    curve.at(-1).capabilityCount > curve[0].capabilityCount,
    `${strategy} run must gain expressive capabilities`,
  );
  assert(
    curve.every((point, index) => index === 0 || point.uniqueWords >= curve[index - 1].uniqueWords),
    `${strategy} run must never lose vocabulary`,
  );
  summaries.push({ run: run + 1, strategy, curve });
}

for (const summary of summaries) {
  const milestones = summary.curve
    .filter((point, index, curve) => index === 0 || point.capabilityCount > curve[index - 1].capabilityCount)
    .map((point) => `F${point.floor}:${point.capabilityCount}式`)
    .join(' → ');
  console.log(
    `run ${summary.run} [${summary.strategy}] ${milestones}；`
    + `终局${summary.curve.at(-1).uniqueWords}个不同词`,
  );
}
console.log('progression-loop-ok');
