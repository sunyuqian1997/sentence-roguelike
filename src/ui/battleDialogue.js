import { G, META, saveMeta } from '../game/state.js';
import { isEn } from '../i18n.js';
import { PLAYER_MASTERY_HINTS, quotePoolFor } from '../data/battleDialogue.js';

const CHANNELS = ['player', 'enemy'];
const state = {
  player: { current: null, queue: [], timer: 0, serial: 0 },
  enemy: { current: null, queue: [], timer: 0, serial: 0 },
};
const quoteCursor = new Map();
let root = null;

function ensureRoot() {
  const combat = document.getElementById('combat-screen');
  if (!combat) return null;
  if (root?.isConnected) return root;
  root = document.createElement('div');
  root.id = 'battle-aside-dialogue';
  root.setAttribute('aria-live', 'polite');
  root.innerHTML = `
    <aside class="portrait-dialogue portrait-dialogue-player" data-dialogue-channel="player" aria-hidden="true">
      <div class="portrait-dialogue-title"><span class="portrait-dialogue-kind">心声</span><b>林夕</b></div>
      <p></p>
    </aside>
    <aside class="portrait-dialogue portrait-dialogue-enemy" data-dialogue-channel="enemy" aria-hidden="true">
      <div class="portrait-dialogue-title"><span class="portrait-dialogue-kind">来音</span><b>回声</b></div>
      <p></p>
    </aside>`;
  combat.appendChild(root);
  return root;
}

function channelElement(channel) {
  return ensureRoot()?.querySelector(`[data-dialogue-channel="${channel}"]`) || null;
}

function hide(channel, serial) {
  const lane = state[channel];
  if (!lane || (serial != null && serial !== lane.serial)) return;
  const el = channelElement(channel);
  if (el) {
    el.classList.remove('is-visible');
    el.setAttribute('aria-hidden', 'true');
  }
  lane.current = null;
  window.clearTimeout(lane.timer);
  lane.timer = window.setTimeout(() => showNext(channel), 180);
}

function showNext(channel) {
  const lane = state[channel];
  if (!lane || lane.current || lane.queue.length === 0) return;
  const next = lane.queue.shift();
  const el = channelElement(channel);
  if (!el) return;
  lane.current = next;
  lane.serial += 1;
  const serial = lane.serial;
  el.querySelector('b').textContent = next.speaker;
  el.querySelector('p').textContent = next.text;
  el.dataset.dialogueKind = next.kind || 'line';
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
  el.setAttribute('aria-hidden', 'false');
  window.clearTimeout(lane.timer);
  lane.timer = window.setTimeout(() => hide(channel, serial), next.duration);
}

function enqueue(channel, entry) {
  const lane = state[channel];
  if (!lane) return;
  const normalized = {
    duration: channel === 'enemy' ? 980 : 3600,
    priority: 0,
    ...entry,
  };

  // A higher-priority line may replace a low-value ambient line. Otherwise it
  // waits; this keeps multi-effect sentences from flashing several hints.
  if (lane.current && normalized.priority > lane.current.priority) {
    lane.queue.unshift(normalized);
    hide(channel, lane.serial);
    return;
  }
  lane.queue.push(normalized);
  lane.queue.sort((a, b) => b.priority - a.priority);
  showNext(channel);
}

function mastery() {
  if (!META.battleMastery || typeof META.battleMastery !== 'object') META.battleMastery = {};
  return META.battleMastery;
}

function hasMastered(key) {
  return mastery()[key] === true;
}

function markMastered(key) {
  mastery()[key] = true;
  saveMeta();
}

function showMasteryHint(key, context = {}) {
  const copy = PLAYER_MASTERY_HINTS[key];
  if (!copy) return false;
  const text = (isEn() ? copy.en : copy.zh)(context);
  enqueue('player', {
    kind: `mastery-${key}`,
    speaker: isEn() ? 'Lin Xi · thought' : `林夕 · ${copy.title}`,
    text,
    duration: 3900,
    priority: 80,
  });
  return true;
}

function firstUnmasteredEvidence({ summon, effects } = {}) {
  if (summon?.summonName && !hasMastered('namedAlly')) {
    return { key: 'namedAlly', context: { actor: summon.summonName, mode: 'summon' } };
  }
  const coActor = effects?._coActors?.find((actor) => actor?.name);
  if (coActor && !hasMastered('namedAlly')) {
    return { key: 'namedAlly', context: { actor: coActor.name, mode: 'actor' } };
  }
  const identity = effects?._predicates?.find((predicate) =>
    predicate?.kind === 'identity' && predicate.target === 'self' && predicate.identityWord);
  if (identity && !hasMastered('identity')) {
    return { key: 'identity', context: { actor: identity.identityWord } };
  }
  if ((effects?.heal || 0) > 0 && !hasMastered('heal')) {
    return { key: 'heal', context: {} };
  }
  if ((effects?.block || 0) > 0 && !hasMastered('defend')) {
    return { key: 'defend', context: {} };
  }
  return null;
}

// Call only after the resolved effect is applied. This is deliberately not a
// preview hook: the game never explains a construction before the player has
// actually discovered it.
export function notifyResolvedPlayerAction(payload = {}) {
  if (G.isTutorial) return;
  const evidence = firstUnmasteredEvidence(payload);
  if (!evidence) return;
  markMastered(evidence.key);
  showMasteryHint(evidence.key, evidence.context);
}

export function showEnemyTurnQuote(enemy, intent) {
  if (G.isTutorial || !enemy || enemy.hp <= 0) return;
  const pool = quotePoolFor(enemy, intent);
  if (!pool?.length) return;
  const key = `${enemy.name}|${intent?.type || 'special'}|${enemy.hp / Math.max(1, enemy.maxHp) <= 0.4 ? 'low' : 'normal'}`;
  const previous = quoteCursor.get(key) ?? -1;
  const next = (previous + 1) % pool.length;
  quoteCursor.set(key, next);
  enqueue('enemy', {
    kind: `enemy-${intent?.type || 'special'}`,
    speaker: (isEn() ? (enemy.nameEn || enemy.name) : enemy.name) || (isEn() ? 'Echo' : '回声'),
    text: pool[next],
    duration: 1020,
    priority: 30,
  });
}

export function resetBattleDialogueForCombat() {
  CHANNELS.forEach((channel) => {
    const lane = state[channel];
    window.clearTimeout(lane.timer);
    lane.current = null;
    lane.queue = [];
    lane.serial += 1;
    const el = channelElement(channel);
    el?.classList.remove('is-visible');
    el?.setAttribute('aria-hidden', 'true');
  });
  quoteCursor.clear();
}

export function resetBattleMastery() {
  META.battleMastery = {};
  saveMeta();
  return { ...META.battleMastery };
}

export function initBattleDialogue() {
  ensureRoot();
  if (import.meta.env.DEV) {
    window.__battleDialogue = {
      getMastery: () => ({ ...mastery() }),
      resetMastery: resetBattleMastery,
      previewPlayerHint: (key = 'identity', context = { actor: '猫' }) => showMasteryHint(key, context),
      previewEnemyQuote: (name = '纸鬼', type = 'attack') => showEnemyTurnQuote({ name, hp: 10, maxHp: 20 }, { type }),
      clear: resetBattleDialogueForCombat,
    };
  }
}
