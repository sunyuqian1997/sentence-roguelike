import { heuristicJudge, normalizeJudgeResult, normalizeJudgeSentence } from './sentenceJudgeCore.js';

const responseCache = new Map();
const DEFAULT_TIMEOUT_MS = 2500;
const MIN_JUDGE_BEAT_MS = 420;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export async function judgeSentence(sentence, options = {}) {
  const normalized = normalizeJudgeSentence(sentence);
  const fallback = heuristicJudge(normalized);
  if (!normalized) return fallback;

  const cached = responseCache.get(normalized);
  if (cached) {
    await wait(Math.min(MIN_JUDGE_BEAT_MS, 160));
    return { ...cached, source: 'client-cache' };
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Math.min(3000, options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let result = fallback;

  try {
    const response = await fetch('/api/judge-sentence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence: normalized }),
      signal: controller.signal,
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`judge ${response.status}`);
    const body = await response.json();
    result = normalizeJudgeResult(body, fallback);
  } catch (_error) {
    // A missing local Function, timeout, quota error, or offline session must
    // never block combat. The deterministic evaluator keeps the run playable.
    result = fallback;
  } finally {
    window.clearTimeout(timeout);
  }

  const elapsed = performance.now() - startedAt;
  if (elapsed < MIN_JUDGE_BEAT_MS) await wait(MIN_JUDGE_BEAT_MS - elapsed);
  responseCache.set(normalized, result);
  if (responseCache.size > 64) responseCache.delete(responseCache.keys().next().value);
  return { ...result };
}
