import assert from 'node:assert/strict';
import {
  applyJudgeToEvaluation,
  gradeForScore,
  heuristicJudge,
  normalizeJudgeResult,
  normalizeJudgeSentence,
  scaleSummonValue,
} from '../src/game/sentenceJudgeCore.js';
import {
  noveltyBonusFor,
  persistJudgment,
  sentenceFingerprint,
} from '../api/sentence-cache.js';

assert.equal(normalizeJudgeSentence(`\u0000  月亮   走进广播室  `), '月亮 走进广播室');
assert.equal(normalizeJudgeSentence('字'.repeat(100)).length, 80);
assert.deepEqual(gradeForScore(90), { min: 90, grade: 'S', multiplier: 1.6, label: '惊鸿' });
assert.equal(gradeForScore(39).grade, 'D');
assert.equal(sentenceFingerprint('月亮走进教室', 'deepseek-v4-flash').length, 64);
assert.equal(
  sentenceFingerprint('月亮走进教室', 'deepseek-v4-flash'),
  sentenceFingerprint('月亮走进教室', 'deepseek-v4-flash'),
);
assert.equal(noveltyBonusFor(60, true), 3);
assert.equal(noveltyBonusFor(59, true), 0);
assert.equal(noveltyBonusFor(90, false), 0);

// Persistent writes use PostgREST's atomic ignore-duplicates response: one
// represented row means this caller inserted it, while [] means it was known.
const previousSupabaseUrl = process.env.SUPABASE_URL;
const previousSupabaseSecret = process.env.SUPABASE_SECRET_KEY;
const previousFetch = globalThis.fetch;
process.env.SUPABASE_URL = 'https://cache.test';
process.env.SUPABASE_SECRET_KEY = 'server-test-secret';
const insertResponses = [[{ fingerprint: 'new' }], []];
globalThis.fetch = async (_url, options) => {
  assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=representation');
  return { ok: true, async json() { return insertResponses.shift(); } };
};
const persistedInput = {
  fingerprint: 'a'.repeat(64), sentence: '月亮走进广播室', model: 'test-model',
  result: { score: 80, feedback: '有画面', tags: ['画面感'] },
};
assert.equal(await persistJudgment(persistedInput), true);
assert.equal(await persistJudgment(persistedInput), false);
globalThis.fetch = previousFetch;
if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
else process.env.SUPABASE_URL = previousSupabaseUrl;
if (previousSupabaseSecret === undefined) delete process.env.SUPABASE_SECRET_KEY;
else process.env.SUPABASE_SECRET_KEY = previousSupabaseSecret;

const dream = heuristicJudge('走廊尽头的月亮，在广播里醒来。');
const flat = heuristicJudge('我我我我我');
assert.ok(dream.score > flat.score, `${dream.score} should exceed ${flat.score}`);
assert.deepEqual(heuristicJudge('月亮走进教室'), heuristicJudge('月亮走进教室'));

const hostile = normalizeJudgeResult({
  score: 999,
  grade: 'GOD',
  multiplier: 99,
  feedback: '<script>赢</script>',
  tags: ['意象鲜明', '<img>', '不存在'],
}, flat);
assert.equal(hostile.score, 100);
assert.equal(hostile.grade, 'S');
assert.equal(hostile.multiplier, 1.6);
assert.ok(!hostile.feedback.includes('<'));
assert.deepEqual(hostile.tags, ['意象鲜明']);

const evaluation = {
  text: '月亮保护我', totalMult: 1.2, literaryNotes: [],
  effects: {
    damage: 10, block: 5, heal: 4, draw: 2, selfHarmDmg: 3,
    _coActors: [{ damage: 4, block: 0, heal: 0 }],
  },
};
applyJudgeToEvaluation(evaluation, { score: 90, feedback: '好', tags: ['画面感'] });
assert.equal(evaluation.effects.damage, 16);
assert.equal(evaluation.effects.block, 8);
assert.equal(evaluation.effects.heal, 6);
assert.equal(evaluation.effects.draw, 2, 'discrete draw effect must stay stable');
assert.equal(evaluation.effects.selfHarmDmg, 3, 'penalties must not be amplified');
assert.equal(evaluation.effects._coActors[0].damage, 6);
assert.equal(evaluation.totalMult, 1.92);
assert.equal(scaleSummonValue(10, { score: 30, feedback: '', tags: [] }), 8);

const novelEvaluation = {
  text: '影子推开月亮', totalMult: 1, literaryNotes: [],
  effects: { damage: 100 },
};
applyJudgeToEvaluation(novelEvaluation, {
  score: 60, feedback: '第一次见', tags: ['搭配新鲜'],
  isNovel: true, noveltyBonus: 3,
});
assert.equal(novelEvaluation.effects.damage, 118, 'B grade ×1.15 and novelty ×1.03');
assert.ok(novelEvaluation.literaryNotes.at(-1).includes('首见 +3%'));

// Vercel Function must remain playable when no secret exists (plain Vite dev,
// Preview without env, or quota incident).
const previousKey = process.env.DEEPSEEK_API_KEY;
delete process.env.DEEPSEEK_API_KEY;
const { default: judgeHandler } = await import('../api/judge-sentence.js');
const responseState = { status: 0, body: null, headers: {} };
const fakeResponse = {
  setHeader(key, value) { responseState.headers[key] = value; },
  status(value) { responseState.status = value; return this; },
  json(value) { responseState.body = value; return value; },
};
await judgeHandler({
  method: 'POST',
  headers: { 'content-length': '40', 'x-real-ip': 'test-runner' },
  body: { sentence: '月亮走进广播室' },
}, fakeResponse);
if (previousKey !== undefined) process.env.DEEPSEEK_API_KEY = previousKey;
assert.equal(responseState.status, 200);
assert.equal(responseState.body.source, 'server-fallback-no-key');
assert.ok(Number.isFinite(responseState.body.score));

console.log('sentence judge assertions passed');
