// Shared, dependency-free judge contract. Both the browser fallback and the
// Vercel Function import this file so grades can never drift between runtimes.

export const JUDGE_LIMITS = Object.freeze({
  maxSentenceChars: 80,
  minMultiplier: 0.8,
  maxMultiplier: 1.6,
});

export const JUDGE_GRADES = Object.freeze([
  Object.freeze({ min: 90, grade: 'S', multiplier: 1.6, label: '惊鸿' }),
  Object.freeze({ min: 75, grade: 'A', multiplier: 1.35, label: '妙句' }),
  Object.freeze({ min: 60, grade: 'B', multiplier: 1.15, label: '有味' }),
  Object.freeze({ min: 40, grade: 'C', multiplier: 1.0, label: '成句' }),
  Object.freeze({ min: 0, grade: 'D', multiplier: 0.8, label: '平句' }),
]);

const TAG_ALLOWLIST = new Set([
  '意象鲜明', '意外联想', '画面感', '节奏自然', '语意连贯',
  '梦核余韵', '搭配新鲜', '表达平直', '语意松散', '重复偏多',
]);

const IMAGERY_WORDS = [
  '月', '雨', '风', '云', '海', '夜', '梦', '影', '灯', '钟', '花', '雪',
  '门', '窗', '走廊', '教室', '操场', '广播', '星', '镜', '雾', '纸', '墨',
];
const MOTION_WORDS = [
  '走', '跑', '飞', '落', '开', '关', '唱', '听', '看', '追', '守', '斩',
  '刺', '抱', '治', '照', '醒', '睡', '变', '穿', '游', '等',
];

export function normalizeJudgeSentence(input) {
  if (typeof input !== 'string') return '';
  const normalized = input
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return [...normalized].slice(0, JUDGE_LIMITS.maxSentenceChars).join('');
}

export function gradeForScore(rawScore) {
  const score = Math.max(0, Math.min(100, Math.round(Number(rawScore) || 0)));
  return JUDGE_GRADES.find((entry) => score >= entry.min) || JUDGE_GRADES.at(-1);
}

function cleanFeedback(value, fallback) {
  const text = typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim()
    : '';
  return (text || fallback).slice(0, 48);
}

function cleanTags(value, fallback = []) {
  const tags = Array.isArray(value) ? value : fallback;
  const accepted = [];
  for (const raw of tags) {
    const tag = String(raw || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 8);
    if (TAG_ALLOWLIST.has(tag) && !accepted.includes(tag)) accepted.push(tag);
    if (accepted.length === 4) break;
  }
  return accepted.length ? accepted : ['表达平直'];
}

export function normalizeJudgeResult(candidate, fallbackResult = null) {
  const fallback = fallbackResult || heuristicJudge('');
  const numericScore = Number(candidate?.score);
  if (!Number.isFinite(numericScore)) return { ...fallback };
  const score = Math.max(0, Math.min(100, Math.round(numericScore)));
  const band = gradeForScore(score);
  const noveltyBonus = candidate?.isNovel
    ? Math.max(0, Math.min(3, Math.round(Number(candidate?.noveltyBonus) || 0)))
    : 0;
  return {
    score,
    grade: band.grade,
    gradeLabel: band.label,
    // Deliberately derive combat values from score. The model may suggest a
    // multiplier, but it never gets authority over game balance.
    multiplier: band.multiplier,
    feedback: cleanFeedback(candidate?.feedback, fallback.feedback),
    tags: cleanTags(candidate?.tags, fallback.tags),
    source: typeof candidate?.source === 'string' ? candidate.source.slice(0, 24) : 'deepseek',
    isNovel: noveltyBonus > 0,
    noveltyBonus,
    noveltyMultiplier: noveltyBonus > 0 ? 1 + noveltyBonus / 100 : 1,
  };
}

export function heuristicJudge(input) {
  const sentence = normalizeJudgeSentence(input);
  const visible = [...sentence.replace(/[，。！？、,.!?\s]/g, '')];
  const length = visible.length;
  let score = 42;
  const tags = [];

  if (length >= 5 && length <= 18) score += 12;
  else if (length >= 3 && length <= 26) score += 6;
  else score -= 8;

  const uniqueRatio = length ? new Set(visible).size / length : 0;
  if (uniqueRatio >= 0.78) { score += 8; tags.push('搭配新鲜'); }
  else if (uniqueRatio < 0.5) { score -= 10; tags.push('重复偏多'); }

  const imageryHits = IMAGERY_WORDS.filter((word) => sentence.includes(word)).length;
  if (imageryHits >= 2) { score += 14; tags.push('意象鲜明', '画面感'); }
  else if (imageryHits === 1) { score += 7; tags.push('画面感'); }

  const motionHits = MOTION_WORDS.filter((word) => sentence.includes(word)).length;
  if (motionHits >= 1) { score += 7; tags.push('语意连贯'); }
  else { score -= 4; tags.push('表达平直'); }

  if (/[，、]/.test(sentence) && /[。！？!?]?$/.test(sentence)) {
    score += 5;
    tags.push('节奏自然');
  }
  if (/(梦|影|镜|广播|走廊|雾).*(月|灯|门|窗|钟|海)|(?:月|灯|门|窗|钟|海).*(?:梦|影|镜|广播|走廊|雾)/.test(sentence)) {
    score += 8;
    tags.push('梦核余韵', '意外联想');
  }

  score = Math.max(20, Math.min(92, Math.round(score)));
  const band = gradeForScore(score);
  const feedbackByGrade = {
    S: '像从梦里捞出的句子，落点又准。',
    A: '画面与动作彼此照应，很有余韵。',
    B: '句子有画面，再添一点意外会更亮。',
    C: '意思清楚，但联想还可以更大胆。',
    D: '词语还没有牵起彼此，试着补出画面。',
  };
  return {
    score,
    grade: band.grade,
    gradeLabel: band.label,
    multiplier: band.multiplier,
    feedback: feedbackByGrade[band.grade],
    tags: cleanTags(tags),
    source: 'local-fallback',
  };
}

const SCALABLE_EFFECT_FIELDS = Object.freeze([
  'damage', 'block', 'heal', 'strengthGain', 'goldGain', 'thorns', '_reflectDmg',
]);

function scalePositive(value, multiplier) {
  if (!Number.isFinite(value) || value <= 0) return value;
  return Math.max(1, Math.round(value * multiplier));
}

export function applyJudgeToEvaluation(result, judgeInput) {
  if (!result?.effects) return result;
  const judge = normalizeJudgeResult(judgeInput, heuristicJudge(result.text || ''));
  const effectiveMultiplier = judge.multiplier * judge.noveltyMultiplier;
  const effects = result.effects;
  for (const field of SCALABLE_EFFECT_FIELDS) {
    if (Number.isFinite(effects[field]) && effects[field] > 0) {
      effects[field] = scalePositive(effects[field], effectiveMultiplier);
    }
  }
  if (Array.isArray(effects._coActors)) {
    effects._coActors.forEach((actor) => {
      actor.damage = scalePositive(actor.damage, effectiveMultiplier);
      actor.block = scalePositive(actor.block, effectiveMultiplier);
      actor.heal = scalePositive(actor.heal, effectiveMultiplier);
    });
  }
  result.totalMult = Number(((result.totalMult || 1) * effectiveMultiplier).toFixed(2));
  result.judge = judge;
  result.literaryNotes = [
    ...(result.literaryNotes || []),
    `判句 ${judge.grade}·${judge.gradeLabel} ${judge.score}分 ×${effectiveMultiplier.toFixed(2)}${judge.isNovel ? ` · 首见 +${judge.noveltyBonus}%` : ''}`,
  ];
  return result;
}

export function scaleSummonValue(base, judgeInput) {
  const judge = typeof judgeInput === 'number'
    ? null
    : normalizeJudgeResult(judgeInput, heuristicJudge(''));
  const multiplier = judge
    ? judge.multiplier * judge.noveltyMultiplier
    : judgeInput;
  const maxWithNovelty = JUDGE_LIMITS.maxMultiplier * (1 + 3 / 100);
  return scalePositive(base, Math.max(JUDGE_LIMITS.minMultiplier, Math.min(maxWithNovelty, multiplier)));
}
