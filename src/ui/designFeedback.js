// Exact dynamic component/timing port from
// design-ref/战斗原型 3D 水色OS.dc.html.
// This layer owns presentation only; combat.js remains the sole state settler.
import { toGameRect } from './uiScale.js';

export const REFERENCE_ENEMY_TIMING = Object.freeze({
  TELEGRAPH: 200,
  DASH: 480,
  IMPACT: 680,
  RECOVER: 960,
  COMPLETE: 1200,
});

export function referencePlayerTiming(wordCount, effects = {}) {
  const count = Math.max(1, wordCount | 0);
  const verdictAt = 40 + count * 95 + 60;
  const actionStart = verdictAt + 300;
  const isPlayerHit = !!effects._enemyAttacksPlayer;
  const isAttack = !!(effects.damage > 0 || effects.aoe || isPlayerHit);
  if (!isAttack) {
    return Object.freeze({
      confirmFirst: 40,
      confirmStep: 95,
      verdictAt,
      verdictOff: verdictAt + 200,
      actionStart,
      dashAt: actionStart + 120,
      impactAt: actionStart + 240,
      sealAt: actionStart + 240,
      shakeOff: actionStart + 240,
      releaseAt: actionStart + 780,
      completeAt: actionStart + 1000,
      isAttack: false,
      isPlayerHit: false,
      puppet: Object.freeze({ dashMs: 120, impactMs: 240, recoverMs: 780, releaseMs: 1000 }),
    });
  }
  return Object.freeze({
    confirmFirst: 40,
    confirmStep: 95,
    verdictAt,
    verdictOff: verdictAt + 200,
    actionStart,
    dashAt: actionStart + 260,
    impactAt: actionStart + 480,
    sealAt: actionStart + 860,
    shakeOff: actionStart + 1160,
    releaseAt: actionStart + 1350,
    completeAt: actionStart + 1500,
    isAttack: true,
    isPlayerHit,
    puppet: Object.freeze({ dashMs: 260, impactMs: 480, recoverMs: 860, releaseMs: 1500 }),
  });
}

let layer = null;
let token = 0;
const timers = new Set();

function later(ms, fn) {
  const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
  timers.add(id);
}
function clearTimers() { timers.forEach(window.clearTimeout); timers.clear(); }
const screen = () => document.getElementById('combat-screen');
const enemyAnchorSelector = (index) => Number.isInteger(index) && index >= 0
  ? `.puppet-enemy-unit[data-enemy-index="${index}"]`
  : '#puppet-enemy';

function ensureLayer() {
  const host = screen();
  if (!host) return null;
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.id = 'design-feedback-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = `
    <div class="df-focus-dim"></div>
    <div class="df-impact-flash"></div>
    <div class="df-bubble df-bubble-player"></div>
    <div class="df-bubble df-bubble-enemy"></div>
    <div class="df-splash df-splash-player"></div>
    <div class="df-splash df-splash-enemy"></div>
    <div class="df-seal df-seal-player">守</div>
    <div class="df-seal df-seal-enemy">中</div>
    <div class="df-center-seal">妙极</div>
  `;
  host.appendChild(layer);
  return layer;
}

function setPhase(value) {
  const host = screen();
  if (host) host.dataset.feedbackPhase = value || 'idle';
}
function setBusy(value) {
  const host = screen();
  if (!host) return;
  host.classList.toggle('df-busy', !!value);
  host.querySelectorAll('#chant-btn, #end-turn-btn').forEach((el) =>
    el.setAttribute('aria-busy', value ? 'true' : 'false'));
}
function setShake(size) {
  const host = screen();
  if (!host) return;
  host.classList.remove('df-shake-small', 'df-shake-big');
  if (size) {
    void host.offsetWidth;
    host.classList.add(`df-shake-${size}`);
  }
}
function anchorPart(el, hostSelector, kind) {
  const root = ensureLayer();
  const host = document.querySelector(hostSelector);
  if (!root || !host) return;
  // The fixed sprite viewport is the visual anchor. The puppet host can be
  // wider/shorter and is animated independently, which previously put bubbles
  // over stale coordinates after the 3D-stage scale pass.
  const visualHost = host.querySelector('.sprite-frame') || host;
  const rootRect = toGameRect(root.getBoundingClientRect());
  const hostRect = toGameRect(visualHost.getBoundingClientRect());
  const centerX = hostRect.left + hostRect.width / 2 - rootRect.left;
  if (kind === 'bubble') {
    el.style.left = `${centerX - el.offsetWidth / 2}px`;
    el.style.top = `${hostRect.top - rootRect.top - el.offsetHeight - 6}px`;
    return;
  }
  const centerY = hostRect.top + hostRect.height * 0.36 - rootRect.top;
  el.style.left = `${centerX - el.offsetWidth / 2}px`;
  el.style.top = `${centerY - el.offsetHeight / 2}px`;
}

function trackAnchor(el, anchor) {
  window.cancelAnimationFrame(el._dfAnchorRaf || 0);
  const tick = () => {
    if (!el.isConnected || !el.classList.contains('is-visible')) return;
    anchorPart(el, anchor.host, anchor.kind);
    el._dfAnchorRaf = window.requestAnimationFrame(tick);
  };
  tick();
}

function showPart(selector, text, anchor) {
  const root = ensureLayer();
  const el = root && root.querySelector(selector);
  if (!el) return;
  if (text !== undefined) el.textContent = text;
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
  if (anchor) trackAnchor(el, anchor);
}
function hidePart(selector) {
  const root = ensureLayer();
  const el = root && root.querySelector(selector);
  if (el) {
    window.cancelAnimationFrame(el._dfAnchorRaf || 0);
    el.classList.remove('is-visible');
  }
}
function clearParts() {
  const root = ensureLayer();
  if (!root) return;
  root.querySelectorAll('.is-visible').forEach((el) => {
    window.cancelAnimationFrame(el._dfAnchorRaf || 0);
    el.classList.remove('is-visible');
  });
  root.classList.remove('df-impact', 'df-impact-heavy');
}

function splitChantedLine(words) {
  const line = document.querySelector('#sentence-slots-container .chanted-line');
  if (!line || line.dataset.feedbackSplit === '1') return [];
  line.textContent = '';
  line.dataset.feedbackSplit = '1';
  const open = document.createElement('span'); open.textContent = '「'; line.appendChild(open);
  const wordEls = words.map((value) => {
    const el = document.createElement('span');
    el.className = 'df-chant-char';
    el.textContent = value;
    line.appendChild(el);
    return el;
  });
  const close = document.createElement('span'); close.textContent = '」'; line.appendChild(close);
  return wordEls;
}

// renderCombat() updates HP/status at the impact frame. It also rebuilds the
// sentence dock, so combat.js immediately redraws the spoken line and calls
// this helper to keep the already-confirmed reference component on screen
// until the later seal/gone beat.
export function restoreChantedFeedback(cards) {
  const words = (cards || []).map((card) => card._isSelfTarget ? '我' : (card.word || ''));
  splitChantedLine(words).forEach((el) => el.classList.add('is-confirmed'));
}

function impact(heavy) {
  const root = ensureLayer();
  if (!root) return;
  root.classList.remove('df-impact', 'df-impact-heavy');
  void root.offsetWidth;
  root.classList.add('df-impact');
  if (heavy) root.classList.add('df-impact-heavy');
  later(500, () => root.classList.remove('df-impact', 'df-impact-heavy'));
}

function enemyIntentText(intent) {
  if (!intent) return '动作未明';
  if (intent.type === 'attack') {
    const hits = (intent.hits | 0) > 1 ? `×${intent.hits}` : '';
    return `「${intent.label || '攻击'} ${intent.value || 0}${hits}！」`;
  }
  return `「${intent.label || ({ defend: '防守', buff: '强化', debuff: '干扰', special: '异动' }[intent.type] || '动作')}！」`;
}

export function initDesignFeedback() {
  ensureLayer();
  setPhase('idle');
}

// The remote judge runs before the reference combat cadence begins. Reuse the
// same seal/bubble layer so the network wait reads as an intentional AVG beat
// instead of a frozen button. beginPlayerFeedback() clears these parts.
export function beginJudgingFeedback(sentenceText) {
  clearTimers(); clearParts();
  ++token;
  setBusy(true); setPhase('judging');
  const root = ensureLayer();
  const seal = root?.querySelector('.df-center-seal');
  if (seal) seal.textContent = '判';
  showPart('.df-center-seal');
  showPart('.df-bubble-player', '「判句中……」', { host: '#puppet-player', kind: 'bubble' });
  const preview = document.getElementById('sentence-score-preview');
  if (preview) {
    preview.innerHTML = `<span class="judge-pending"><span class="judge-pending-mark">判</span> 句意回响中……</span>`;
  }
}

export function showJudgeVerdict(judge) {
  const preview = document.getElementById('sentence-score-preview');
  if (!preview || !judge) return;
  const safeFeedback = String(judge.feedback || '').replace(/[<>]/g, '');
  const tags = Array.isArray(judge.tags) ? judge.tags.slice(0, 3) : [];
  const source = judge.sourceOrigin || judge.source || 'local-fallback';
  const sourceLabel = source === 'deepseek'
    ? (judge.source === 'deepseek' ? 'AI判句' : 'AI结果复用')
    : source === 'supabase-cache'
      ? 'Supabase复用'
      : source.startsWith('server-fallback') || source === 'local-fallback'
        ? '本地判句'
        : judge.source === 'client-cache' || judge.source === 'server-cache'
          ? '缓存复用'
          : '判句';
  preview.innerHTML = `
    <span class="judge-verdict judge-grade-${judge.grade || 'C'}">
      <b>${judge.grade || 'C'}·${judge.gradeLabel || '成句'}</b>
      <em>${judge.score || 0}分</em>
      <strong>×${Number(judge.multiplier || 1).toFixed(2)}</strong>
      <i class="judge-source">${sourceLabel}</i>
      <span>${safeFeedback}</span>
      ${tags.map((tag) => `<i>${String(tag).replace(/[<>]/g, '')}</i>`).join('')}
    </span>`;
}

export function beginPlayerFeedback(cardsOrCount, sentenceText, effects = {}) {
  clearTimers(); clearParts();
  const centerSeal = ensureLayer()?.querySelector('.df-center-seal');
  if (centerSeal) centerSeal.textContent = '妙极';
  const run = ++token;
  const words = Array.isArray(cardsOrCount)
    ? cardsOrCount.map((card) => card._isSelfTarget ? '我' : (card.word || ''))
    : Array.from({ length: Math.max(1, cardsOrCount | 0) }, () => '');
  const timing = referencePlayerTiming(words.length, effects);
  const enemyAnchor = enemyAnchorSelector(effects.targetEnemyIdx);
  const host = screen();
  if (host) host.dataset.feedbackMode = timing.isAttack ? 'attack' : 'support';
  setBusy(true); setPhase('confirm');
  const chars = splitChantedLine(words);
  chars.forEach((char, index) => later(timing.confirmFirst + index * timing.confirmStep, () => {
    if (run !== token) return;
    chars.forEach((el, i) => {
      el.classList.toggle('is-active', i === index);
      if (i < index) el.classList.add('is-confirmed');
    });
  }));
  later(timing.verdictAt, () => {
    if (run !== token) return;
    chars.forEach((el) => { el.classList.remove('is-active'); el.classList.add('is-confirmed'); });
    setPhase('verdict');
    setShake('small');
    document.getElementById('sentence-score-preview')?.classList.add('df-verdict-pulse');
  });
  later(timing.verdictOff, () => {
    document.getElementById('sentence-score-preview')?.classList.remove('df-verdict-pulse');
    setShake(null);
  });
  later(timing.actionStart, () => {
    if (run !== token) return;
    setPhase('charge');
    if (!timing.isAttack) setShake('small');
    showPart('.df-bubble-player', `「${sentenceText || ''}！」`, { host: '#puppet-player', kind: 'bubble' });
  });
  later(timing.dashAt, () => { if (run === token) setPhase('dash'); });
  later(timing.impactAt, () => {
    if (run !== token) return;
    setPhase('impact');
    const impactPlayer = timing.isPlayerHit;
    showPart(
      impactPlayer ? '.df-splash-player' : (timing.isAttack ? '.df-splash-enemy' : '.df-seal-player'),
      undefined,
      impactPlayer
        ? { host: '#puppet-player', kind: 'impact' }
        : (timing.isAttack
          ? { host: enemyAnchor, kind: 'impact' }
          : { host: '#puppet-player', kind: 'impact' }),
    );
    setShake(timing.isAttack ? 'big' : null);
    impact(false);
  });
  later(timing.sealAt, () => {
    if (run !== token) return;
    setPhase('seal');
    if (timing.isPlayerHit) {
      hidePart('.df-splash-player');
      document.querySelector('.chanted-line')?.classList.add('df-line-gone');
    } else if (timing.isAttack) {
      hidePart('.df-splash-enemy');
      showPart('.df-seal-enemy', undefined, { host: enemyAnchor, kind: 'impact' });
      showPart('.df-center-seal');
      document.querySelector('.chanted-line')?.classList.add('df-line-gone');
    }
    hidePart('.df-bubble-player');
  });
  later(timing.shakeOff, () => { if (run === token) { setShake(null); setPhase('settle'); } });
  later(timing.releaseAt, () => {
    if (run !== token) return;
    hidePart('.df-seal-enemy'); hidePart('.df-seal-player'); hidePart('.df-center-seal');
    setPhase('recover');
  });
  return timing;
}

export function playerImpactFeedback(effects = {}) {
  impact((effects.damage || 0) >= 20 || !!effects.aoe || !!effects.ignoreBlock);
}

export function finishPlayerFeedback() {
  ++token; clearTimers(); clearParts(); setShake(null); setBusy(false); setPhase('idle');
  const host = screen(); if (host) delete host.dataset.feedbackMode;
}

export function queueEnemyTurnFeedback() {
  ++token; clearTimers(); clearParts(); setBusy(true); setPhase('enemy-wait');
}

export function beginEnemyFeedback(intent, enemyIndex = -1) {
  clearTimers(); clearParts();
  const run = ++token;
  setBusy(true); setPhase('enemy-wait');
  later(REFERENCE_ENEMY_TIMING.TELEGRAPH, () => {
    if (run !== token) return;
    setPhase('enemy-telegraph');
    showPart('.df-bubble-enemy', enemyIntentText(intent), { host: enemyAnchorSelector(enemyIndex), kind: 'bubble' });
  });
  later(REFERENCE_ENEMY_TIMING.DASH, () => {
    if (run !== token) return;
    hidePart('.df-bubble-enemy'); setPhase('enemy-dash');
  });
  later(REFERENCE_ENEMY_TIMING.IMPACT, () => {
    if (run !== token) return;
    setPhase('enemy-impact');
    showPart('.df-splash-player', undefined, { host: '#puppet-player', kind: 'impact' });
    setShake('big');
    impact((intent?.value || 0) >= 12 || (intent?.hits || 1) > 1);
  });
  later(REFERENCE_ENEMY_TIMING.RECOVER, () => {
    if (run !== token) return;
    hidePart('.df-splash-player'); setShake(null); setPhase('enemy-recover');
  });
  later(REFERENCE_ENEMY_TIMING.COMPLETE, () => {
    if (run !== token) return;
    clearParts(); setPhase('enemy-complete');
  });
  return REFERENCE_ENEMY_TIMING;
}

export function enemyImpactFeedback(intent) {
  impact((intent?.value || 0) >= 12 || (intent?.hits || 1) > 1);
}

export function playerTurnReadyFeedback(turn) {
  ++token; clearTimers(); clearParts(); setShake(null); setBusy(false);
  setPhase((turn || 0) > 1 ? 'player-ready' : 'idle');
  later(350, () => setPhase('idle'));
}
