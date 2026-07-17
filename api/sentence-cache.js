import { createHash } from 'node:crypto';

export const JUDGE_VERSION = 'sentence-judge-2026-07-v1';
export const NOVELTY_MIN_SCORE = 60;
export const NOVELTY_BONUS_PERCENT = 3;
const SUPABASE_READ_TIMEOUT_MS = 650;
const SUPABASE_WRITE_TIMEOUT_MS = 900;

function cacheConfig() {
  const url = String(process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  ).trim();
  return url && key ? { url, key } : null;
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function timedFetch(url, options = {}, timeoutMs = SUPABASE_READ_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function sentenceFingerprint(sentence, model) {
  return createHash('sha256')
    .update(`${JUDGE_VERSION}\0${model}\0${sentence}`, 'utf8')
    .digest('hex');
}

export function noveltyBonusFor(score, inserted) {
  return inserted && Number(score) >= NOVELTY_MIN_SCORE ? NOVELTY_BONUS_PERCENT : 0;
}

export function isSupabaseCacheConfigured() {
  return Boolean(cacheConfig());
}

export async function readPersistentJudgment(fingerprint) {
  const config = cacheConfig();
  if (!config) return null;
  try {
    const query = new URL(`${config.url}/rest/v1/sentence_judgments`);
    query.searchParams.set('fingerprint', `eq.${fingerprint}`);
    query.searchParams.set('select', 'score,feedback,tags');
    query.searchParams.set('limit', '1');
    const response = await timedFetch(query, {
      method: 'GET',
      headers: headers(config.key, { Accept: 'application/json' }),
    });
    if (!response.ok) return null;
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row || !Number.isFinite(Number(row.score))) return null;
    return {
      score: Number(row.score),
      feedback: row.feedback,
      tags: Array.isArray(row.tags) ? row.tags : [],
      source: 'supabase-cache',
      isNovel: false,
      noveltyBonus: 0,
      noveltyMultiplier: 1,
    };
  } catch (_error) {
    return null;
  }
}

export async function persistJudgment({ fingerprint, sentence, model, result }) {
  const config = cacheConfig();
  if (!config) return false;
  try {
    const response = await timedFetch(`${config.url}/rest/v1/rpc/cache_sentence_judgment`, {
      method: 'POST',
      headers: headers(config.key, { Accept: 'application/json' }),
      body: JSON.stringify({
        p_fingerprint: fingerprint,
        p_sentence_text: sentence,
        p_judge_version: JUDGE_VERSION,
        p_model: model,
        p_score: result.score,
        p_feedback: result.feedback,
        p_tags: result.tags,
      }),
    }, SUPABASE_WRITE_TIMEOUT_MS);
    if (!response.ok) return false;
    return (await response.json()) === true;
  } catch (_error) {
    return false;
  }
}
