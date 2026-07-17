// Puppet theatre (棍人剧场) — the two ink-brush figures above the sentence
// area that act out what the player is writing.
//
// Contract with the rest of the game:
//   - Poses are pure CSS: we only flip [data-pose] and let transitions run,
//     so rapid re-renders while composing never flicker the stage.
//   - While a battle animation runs, dataset.chanting === '1' and
//     updatePuppets() must not override poses.
//   - Impact lands at IMPACT_MS into an attack animation; combat.js applies
//     the actual damage at the same offset so numbers pop when the hit lands.
import { G } from '../game/state.js';
import { applyMeaningsToSentence } from '../game/meanings.js';
import { detectPredicates, resolveIdentityTrait, isCopulaPredicate, isYouCard } from '../game/poetics.js';
import { detectSummon } from '../game/sentence.js';
import { playSFX } from '../game/audio.js';
import { uiScale, toGameRect } from './uiScale.js';
import { SCENERY } from '../game/scenes.js';
import { isEn } from '../i18n.js';
import { ensureSpriteAnimator, initPuppetSprites, makeSpriteMarkup } from './spriteAnimator.js';

export const IMPACT_MS = 420;

// Enemy pose → the audio cue played ONCE when the puppet first enters it.
// Keyed by data-pose so preview + chant share one source of truth.
const POSE_SFX = {
  charmed: 'charm', doomed: 'doom', dazed: 'daze', old: 'old',
};
// Remember the last cue we played per puppet so a state we're already in
// doesn't re-fire on every re-render while composing.
const _lastCue = { player: '', enemy: '' };
function cuePose(which, pose) {
  const sfx = POSE_SFX[pose];
  const key = sfx || pose || '';
  if (_lastCue[which] === key) return;
  _lastCue[which] = key;
  if (sfx) playSFX(sfx);
}

// How each pun tag shows on the enemy puppet (pose + floating emoji).
export const PUN_TO_POSE = {
  gay: { pose: 'charmed', emoji: '❤️' },
  doomed: { pose: 'doomed', emoji: '💀' },
  old: { pose: 'old', emoji: '👴' },
  juan: { pose: 'juan', emoji: '💦' },
  lying: { pose: 'lying', emoji: '' },
  numb: { pose: 'dazed', emoji: '😵' },
  sad: { pose: 'doomed', emoji: '😞' },
  fleeing: { pose: 'dazed', emoji: '💨' },
  daylight: { pose: 'charmed', emoji: '☀️' },
};

const els = () => ({
  player: document.getElementById('puppet-player'),
  enemy: document.getElementById('puppet-enemy'),
});

function setEmoji(el, emoji) {
  const t = el && el.querySelector('.puppet-emoji');
  if (t && t.textContent !== emoji) t.textContent = emoji;
}

function setPose(el, pose) {
  if (el && el.dataset.pose !== pose) el.dataset.pose = pose;
}

// Identity body-size scales only the fixed sprite viewport; feet stay anchored.
function setBodyScale(el, scale) {
  if (!el) return;
  const sprite = el.querySelector('.sprite-frame');
  if (!sprite) return;
  if (scale && scale !== 1) sprite.style.setProperty('--sprite-body-scale', String(scale));
  else sprite.style.removeProperty('--sprite-body-scale');
}

function impactFlash(el) {
  el.classList.remove('puppet-impact');
  void el.offsetWidth;
  el.classList.add('puppet-impact');
}

// Horizontal center-to-center distance, so the dash actually reaches the
// opponent regardless of stage width.
// 返回设计坐标距离(÷uiScale):它被用作缩放画布内的 transform 值。
function gapX(from, to) {
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  return ((b.left + b.width / 2) - (a.left + a.width / 2)) / uiScale();
}

// A named subject's signature icon (shown over its summoned puppet).
const COACTOR_EMOJI = {
  '猫': '🐱', '影子': '🌑', '无名者': '👤', '初音未来': '🎤', '剑客': '🗡️',
  '书生': '📚', '月兔': '🐰', '僧人': '🙏', '女侠': '⚔️', '酒仙': '🍶',
  '狐仙': '🦊', '将军': '🎖️', '皇帝': '👑', '李清照': '📜', '日': '☀️',
  '大哥': '🕶️',
};
const coActorEmoji = (name) => COACTOR_EMOJI[name] || '🥷';

const COACTOR_SPRITE_KEYS = Object.freeze({
  '猫': 'cat',
  '初音未来': 'miku',
  '影子': 'shadow',
  '皇帝': 'emperor',
  '儿子': 'son',
});
const coActorSpriteKey = (name) => COACTOR_SPRITE_KEYS[name] || 'coactor';

// Identity sentences visibly recast the player into an available pixel body.
// First-act atlases cover this pass; later identities reuse the nearest shape.
const IDENTITY_SPRITES = Object.freeze({
  '猫': { key: 'cat', scale: 0.72 },
  '儿子': { key: 'son', scale: 0.62 },
  '影子': { key: 'shadow', scale: 0.92 },
  '大哥': { key: 'moyao', scale: 1.08 },
  '初音未来': { key: 'miku', scale: 0.88 },
  '剑客': { key: 'wenqu', scale: 1.0 },
  '女侠': { key: 'wenqu', scale: 1.0 },
  '将军': { key: 'wenqu', scale: 1.12 },
  '皇帝': { key: 'emperor', scale: 1.12 },
  '巨人': { key: 'cangjie', scale: 1.38 },
  '无名者': { key: 'cangjie', scale: 0.96 },
  '李清照': { key: 'wenqu', scale: 0.94 },
  '书生': { key: 'wenqu', scale: 0.92 },
  '月兔': { key: 'zhigui', scale: 0.78 },
  '僧人': { key: 'wenqu', scale: 1.0 },
});

// Where co-actors stand: in the open band BETWEEN the poet (far left) and the
// VS marker (center), so they never overlap the poet. Each is ~62% scale.
const COACTOR_BASE_LEFT = 30; // % from stage left — sits in the gap, poet→center
const COACTOR_STEP = 10;      // % between successive co-actors, fanning rightward
const COACTOR_SCALE = 0.6;

// ---- Per-character SVG bodies ----
// Each co-actor gets its OWN ink figure (not a recolored poet clone). They share
// the poet's viewBox (0 0 80 100) and class names (head/body/arm-l/arm-r/leg-*)
// so the existing [data-pose] CSS animates them for free. Distinct silhouettes:
// 猫 has ears+tail+whiskers, 初音 twin-tails+headset, 影子 a filled shadow, etc.
const _shared = `
  <ellipse class="ground" cx="40" cy="97" rx="14" ry="2.5"/>
  <g class="arm arm-l"><path d="M37,42 Q28,48 23,58"/></g>
  <g class="arm arm-r"><path d="M43,42 Q52,48 57,58"/></g>
  <line class="leg leg-l" x1="34" y1="86" x2="32" y2="95"/>
  <line class="leg leg-r" x1="46" y1="86" x2="48" y2="95"/>
  <text class="puppet-emoji" x="40" y="7" text-anchor="middle"></text>`;
const _body = `<path class="body" d="M40,34 C33,40 30,50 28,62 C27,71 26,80 25,88 L55,88 C54,80 53,71 52,62 C50,50 47,40 40,34 Z"/>`;
const _face = `<g class="face"><circle cx="36" cy="23" r="1.2"/><circle cx="44" cy="23" r="1.2"/></g>`;

const COACTOR_SVG = {
  // 🐱 猫 — a real SITTING cat (not a human in ears). Big round head low on a
  // crouched oval body, upright triangle ears, whiskers, two front paws and a
  // fat curling tail. Deliberately skips _body/_shared limbs so it doesn't read
  // as a person. Pose transforms (attack/heal lean) still apply to the whole svg.
  '猫': `
    <ellipse class="ground" cx="40" cy="95" rx="18" ry="3"/>
    <path class="ca-tail" d="M58,86 Q74,82 72,66 Q71,54 60,56 Q67,60 66,68 Q65,77 58,80 Z"/>
    <path class="ca-cbody body" d="M26,92 Q22,66 40,58 Q58,66 54,92 Z"/>
    <g class="ca-ears"><path d="M27,40 L22,24 L37,35 Z"/><path d="M53,40 L58,24 L43,35 Z"/></g>
    <circle class="head ca-chead" cx="40" cy="44" r="17"/>
    <g class="ca-eyes"><path d="M30,43 Q33,39 36,43"/><path d="M44,43 Q47,39 50,43"/></g>
    <path class="ca-nose" d="M38,49 L42,49 L40,52 Z"/>
    <path class="ca-mouth" d="M40,52 Q37,55 34,53 M40,52 Q43,55 46,53"/>
    <g class="ca-whisk"><line x1="33" y1="50" x2="16" y2="46"/><line x1="33" y1="52" x2="16" y2="53"/><line x1="47" y1="50" x2="64" y2="46"/><line x1="47" y1="52" x2="64" y2="53"/></g>
    <g class="ca-paws"><ellipse cx="34" cy="91" rx="4" ry="3"/><ellipse cx="46" cy="91" rx="4" ry="3"/></g>
    <text class="puppet-emoji" x="40" y="18" text-anchor="middle"></text>`,
  // 🎤 初音未来 — twin tails + headset mic
  '初音未来': `
    <g class="hm-tails"><path d="M29,16 Q18,30 20,60 Q21,72 26,78"/><path d="M51,16 Q62,30 60,60 Q59,72 54,78"/></g>
    <circle class="head" cx="40" cy="22" r="11"/>
    ${_face}
    <g class="hm-set"><path d="M29,22 Q40,12 51,22"/><circle cx="29" cy="23" r="2.2"/><line x1="29" y1="25" x2="33" y2="30"/></g>
    ${_body}
    ${_shared}`,
  // 🌑 影子 — a filled dark silhouette, wispy bottom
  '影子': `
    <circle class="sh-head" cx="40" cy="22" r="11"/>
    <path class="sh-body" d="M40,33 C32,39 29,50 28,62 C27,71 26,80 26,88 Q31,82 35,88 Q40,93 45,88 Q49,82 54,88 C54,80 53,71 52,62 C51,50 48,39 40,33 Z"/>
    <g class="face"><circle cx="36" cy="22" r="1.4" fill="#F2EAD8"/><circle cx="44" cy="22" r="1.4" fill="#F2EAD8"/></g>
    ${_shared}`,
  // 🗡️ 剑客/女侠/将军 — topknot + a sword line
  '剑客': `
    <circle class="kn-bun" cx="40" cy="9" r="3.5"/>
    <circle class="head" cx="40" cy="23" r="11"/>
    ${_face}
    ${_body}
    <g class="kn-sword"><line x1="55" y1="56" x2="70" y2="34"/><line x1="66" y1="40" x2="73" y2="44"/></g>
    ${_shared}`,
};
COACTOR_SVG['女侠'] = COACTOR_SVG['剑客'];
COACTOR_SVG['将军'] = COACTOR_SVG['剑客'];

// 🕶️ 大哥 — broad shoulders, slicked hair, dark shades. The streetwise protector.
COACTOR_SVG['大哥'] = `
    <path class="dg-hair" d="M29,18 Q40,6 51,18 Q48,14 40,13 Q32,14 29,18 Z"/>
    <circle class="head" cx="40" cy="23" r="11"/>
    <g class="dg-shades"><rect x="30" y="20" width="8" height="4" rx="1"/><rect x="42" y="20" width="8" height="4" rx="1"/><line x1="38" y1="22" x2="42" y2="22"/></g>
    <path class="body" d="M40,34 C30,40 26,50 24,62 C23,71 22,80 22,88 L58,88 C58,80 57,71 56,62 C54,50 50,40 40,34 Z"/>
    ${_shared}`;

// 📚 generic scholar/spirit — plain ink figure with a topknot, used for any
// named subject without a bespoke design (无名者/书生/酒仙/月兔/狐仙/日…).
function genericCoActorSVG() {
  return `
    <circle class="gn-bun" cx="40" cy="10" r="3"/>
    <circle class="head" cx="40" cy="23" r="11"/>
    ${_face}
    ${_body}
    ${_shared}`;
}

function coActorSprite(name) {
  return makeSpriteMarkup(coActorSpriteKey(name), name, coActorEmoji(name));
}

// Build one standby co-actor with the shared pixel co-actor atlas. The label and
// emoji preserve identity while the animation remains a stable fixed grid.
function makeStandby(name, indexFromZero) {
  const clone = document.createElement('div');
  clone.className = 'puppet puppet-coactor standby';
  clone.dataset.spriteSide = 'ally';
  clone.dataset.spriteKey = coActorSpriteKey(name);
  clone.dataset.pose = 'idle';
  clone.dataset.coactor = name;
  clone.innerHTML = coActorSprite(name);
  const label = clone.querySelector('.puppet-label');
  if (label) { label.style.opacity = '0.7'; label.style.display = 'block'; }
  setEmoji(clone, coActorEmoji(name));
  clone.style.position = 'absolute';
  clone.style.left = (COACTOR_BASE_LEFT + indexFromZero * COACTOR_STEP) + '%';
  clone.style.bottom = '4%';
  clone.style.zIndex = String(3 - indexFromZero);
  clone.style.opacity = '1';
  clone.style.transformOrigin = 'bottom center';
  clone.style.transform = `scale(${COACTOR_SCALE})`;
  clone.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1), left 0.3s';
  ensureSpriteAnimator(clone);
  return clone;
}

// Live preview: reconcile the standby co-actors on stage with the named
// subjects currently in the sentence. Called every render while composing, so
// summoning a subject card makes its puppet appear immediately (and removing
// the card dismisses it) — instant feedback before chanting.
export function syncStandbyCoActors(names) {
  const stage = document.getElementById('puppet-stage');
  if (!stage) return;
  // Don't reshuffle mid-battle-animation.
  const player = document.getElementById('puppet-player');
  if (player && player.dataset.chanting === '1') return;

  const existing = [...stage.querySelectorAll('.puppet-coactor.standby')];
  const want = names || [];

  // Direct removal: sprites never fade or dissolve.
  existing.forEach(el => {
    if (!want.includes(el.dataset.coactor)) {
      el.remove();
    }
  });

  // Add missing standbys, fanned out by their order of appearance.
  want.forEach((name, i) => {
    const live = existing.find(e => e.dataset.coactor === name && e.isConnected);
    if (live) {
      live.style.left = (COACTOR_BASE_LEFT + i * COACTOR_STEP) + '%';
      return;
    }
    const el = makeStandby(name, i);
    stage.appendChild(el);
    playSFX('summon'); // a new ally just stepped onto the stage
  });
}

// On chant: each standby co-actor dashes out, strikes the enemy, returns, then
// the standbys are cleared (the sentence is consumed). Reuses the puppets that
// were already standing by during composition.
export function playCoActors(coActors) {
  const stage = document.getElementById('puppet-stage');
  const enemy = document.getElementById('puppet-enemy');
  if (!stage || !enemy) return;
  const standbys = [...stage.querySelectorAll('.puppet-coactor.standby')];
  const verbOf = (name) => {
    const a = (coActors || []).find(c => c.name === name);
    return a ? (a.verbType || 'attack') : 'attack';
  };
  standbys.forEach((el, i) => {
    const vt = verbOf(el.dataset.coactor);
    const dx = gapX(el, enemy);
    if (vt === 'attack') {
      setTimeout(() => { el.dataset.pose = 'attack'; el.style.transform = `translateX(${Math.max(40, dx - 30)}px) scale(0.95)`; }, 300 * i + 120);
      setTimeout(() => { enemy.dataset.pose = 'hit'; impactFlash(enemy); }, 300 * i + 400);
    } else {
      // defend/heal: act in place (no dash at enemy) — 守/挡/治 are for 我.
      const pose = vt === 'heal' ? 'heal' : 'defend';
      setTimeout(() => { el.dataset.pose = pose; el.style.transform = `translateY(-4px) scale(0.98)`; }, 300 * i + 120);
    }
    setTimeout(() => { el.dataset.pose = 'idle'; el.style.transform = `scale(${COACTOR_SCALE})`; }, 300 * i + 620);
    setTimeout(() => el.remove(), 300 * i + 900);
  });
}

// ============================================================
// REACTION BUBBLES (吐槽气泡) — presentation-only quips that pop over the
// puppets' heads WHILE COMPOSING (never during chant resolution).
//
// Anti-flicker contract (renderCombat runs on every card click):
//   - A bubble is keyed by a "signature" (trigger id + sentence text / actor).
//     Same signature on a re-render → the existing DOM node is left untouched.
//   - A bubble fades out after BUBBLE_TTL and its signature is marked spent —
//     it never replays for the same sentence state.
//   - playChantPuppetAnim() clears the stage; bubbles read preview state only.
// ============================================================
const BUBBLE_TTL = 2200;
const BUBBLE_FADE_MS = 300;

// Data-driven trigger table. ctx = { sentence(G.sentence), eval(G._previewEval,
// may be null), targetEnemy, standbyNames, newStandby }. For each side
// (player/enemy/coactor) the highest-priority hit wins; sides are independent
// so poet and foe may quip at the same time, but never two per side.
const BUBBLE_TRIGGERS = [
  { id: 'lethal', who: 'enemy', priority: 100,
    when: (ctx) => {
      const ef = ctx.eval && ctx.eval.effects;
      return !!(ef && ef.damage > 0 && ctx.targetEnemy && ef.damage >= ctx.targetEnemy.hp);
    },
    pool: { zh: ['等等！', '有话好说'], en: ['Wait!!', "Let's talk!"] } },
  { id: 'self_harm', who: 'player', priority: 95,
    when: (ctx) => !!(ctx.eval && ctx.eval.effects && ctx.eval.effects.selfHarm),
    pool: { zh: ['这不好吧……'], en: ['Maybe not…'] } },
  { id: 'high_mult', who: 'player', priority: 90,
    when: (ctx) => !!(ctx.eval && ctx.eval.totalMult >= 3),
    pool: { zh: ['这也行？', '妙啊——'], en: ['That works??', 'Now THAT sings—'] } },
  { id: 'pun_hit', who: 'enemy', priority: 70,
    when: (ctx) => {
      const preds = ctx.eval && ctx.eval.effects && ctx.eval.effects._predicates;
      return !!(preds && preds.some(p => p && p.subjectKind === 'enemy' && p.pun));
    },
    pool: { zh: ['你礼貌吗'], en: ['How rude!'] } },
  { id: 'high_mult_enemy', who: 'enemy', priority: 60,
    when: (ctx) => !!(ctx.eval && ctx.eval.totalMult >= 3),
    pool: { zh: ['？？'], en: ['??'] } },
  { id: 'targeted_no_verb', who: 'enemy', priority: 50,
    when: (ctx) => ctx.sentence.some(c => c && c._isEnemyTarget)
      && !ctx.sentence.some(c => c && c.pos === 'verb'),
    pool: { zh: ['要干嘛'], en: ['What now?'] } },
  // Fires only the render a standby co-actor STEPS ON stage (newStandby) —
  // the spent-signature set keeps it from re-firing on every re-render.
  { id: 'coactor_ready', who: 'coactor', priority: 40,
    when: (ctx) => ctx.newStandby.length > 0,
    pool: { zh: ['我来！', '交给我'], en: ["I'm on it!", 'Leave it to me'] } },
];

const _bubbles = { player: null, enemy: null, coactor: null }; // who → {sig, el, timers}
const _spentBubbleSigs = new Set();  // faded once → never replay
let _lastStandbyNames = [];

function removeBubbleNow(who) {
  const b = _bubbles[who];
  if (!b) return;
  clearTimeout(b.fadeTimer);
  clearTimeout(b.removeTimer);
  if (b.el) b.el.remove();
  _bubbles[who] = null;
}

export function clearPuppetBubbles() {
  ['player', 'enemy', 'coactor'].forEach(removeBubbleNow);
}

// Keep the bubble over the anchor's head and clamped inside the stage box
// (the stage has overflow:hidden, so clamping = never clipped/off-viewport).
function positionBubble(el, anchor, stage) {
  const sr = stage.getBoundingClientRect();
  const ar = anchor.getBoundingClientRect();
  if (!sr.width || !ar.width) return;
  const bw = el.offsetWidth, bh = el.offsetHeight;
  let left = ar.left + ar.width / 2 - sr.left - bw / 2;
  left = Math.max(2, Math.min(left, sr.width - bw - 2));
  let top = ar.top - sr.top - bh - 8;
  if (top < 2) top = 2;
  el.style.left = Math.round(left) + 'px';
  el.style.top = Math.round(top) + 'px';
}

function showBubble(who, anchor, trig, sig, stage) {
  const cur = _bubbles[who];
  if (cur && cur.sig === sig) {                 // same signature → keep node
    positionBubble(cur.el, anchor, stage);      // (just track the puppet)
    return;
  }
  if (_spentBubbleSigs.has(sig)) return;        // already played once
  removeBubbleNow(who);
  const pool = trig.pool[isEn() ? 'en' : 'zh'] || trig.pool.zh;
  const el = document.createElement('div');
  el.className = 'puppet-bubble';
  el.dataset.bubbleWho = who;
  el.dataset.bubbleTrigger = trig.id;
  el.dataset.bubbleSig = sig;
  el.textContent = pool[Math.floor(Math.random() * pool.length)];
  stage.appendChild(el);
  positionBubble(el, anchor, stage);
  const rec = { sig, el, fadeTimer: null, removeTimer: null };
  rec.fadeTimer = setTimeout(() => {
    _spentBubbleSigs.add(sig);
    el.classList.add('bubble-out');
    rec.removeTimer = setTimeout(() => { if (_bubbles[who] === rec) removeBubbleNow(who); }, BUBBLE_FADE_MS);
  }, BUBBLE_TTL);
  _bubbles[who] = rec;
}

// Called at the end of every updatePuppets() (i.e. every renderCombat while
// composing). Purely additive juice: reads preview state, never mutates game.
function maybeShowBubbles() {
  const stage = document.getElementById('puppet-stage');
  const { player, enemy } = els();
  if (!stage || !player || !enemy) return;

  // Dialogue priority: tutorial AVG > resolved-action bubble > compose-time
  // quip. The first two own their own layers; compose quips must stay silent
  // while either is active instead of reappearing during a render at impact.
  if (G.isTutorial || G._chantResolving) {
    clearPuppetBubbles();
    return;
  }

  const sentence = G.sentence || [];
  // The preview eval is only trustworthy for a non-empty, non-summon sentence
  // (render.js writes it in exactly that branch, so anything else is stale).
  const eval_ = (sentence.length > 0 && !detectSummon(sentence)) ? (G._previewEval || null) : null;

  const tCard = sentence.find(c => c && c._isEnemyTarget);
  const targetEnemy = (tCard && G.enemies && G.enemies[tCard._enemyIdx]
    && G.enemies[tCard._enemyIdx].hp > 0) ? G.enemies[tCard._enemyIdx] : null;

  const standbyNames = [...stage.querySelectorAll('.puppet-coactor.standby')]
    .filter(e => e.dataset.removing !== '1')
    .map(e => e.dataset.coactor);
  const newStandby = standbyNames.filter(n => !_lastStandbyNames.includes(n));
  _lastStandbyNames = standbyNames;

  if (sentence.length === 0) return; // empty rack: keep any live bubble's TTL, add nothing

  const sentText = sentence.map(c => (c && c.word) || '').join('');
  const ctx = { sentence, eval: eval_, targetEnemy, standbyNames, newStandby };

  const anchors = { player, enemy };
  ['player', 'enemy', 'coactor'].forEach(who => {
    let hit = null;
    for (const trig of BUBBLE_TRIGGERS) {
      if (trig.who !== who) continue;
      if (!hit || trig.priority > hit.priority) {
        try { if (trig.when(ctx)) hit = trig; } catch (e) { /* juice must never throw */ }
      }
    }
    if (!hit) return; // no new hit: an existing bubble simply lives out its TTL
    if (who === 'coactor') {
      // Keyed by actor name (not sentence) so growing the sentence never re-pops it.
      const name = newStandby[0];
      const anchor = stage.querySelector(`.puppet-coactor.standby[data-coactor="${name}"]`);
      if (!anchor) return;
      const sig = `${hit.id}|${name}`;
      if (!_spentBubbleSigs.has(sig) && !_bubbles.coactor && Math.random() < 0.55) {
        _spentBubbleSigs.add(sig); // low-frequency: silently spend the chance
        return;
      }
      showBubble(who, anchor, hit, sig, stage);
    } else {
      showBubble(who, anchors[who], hit, `${hit.id}|${sentText}`, stage);
    }
  });
}

// ============================================================
// SCENERY PROPS (P5) — 景物词化作舞台简笔道具。挂在 #puppet-stage 的
// .scenery-layer(首个子节点,z-index 0),摆两侧/背景位,不挡棍人与气泡。
// 按 prop id reconcile:重复渲染不闪,消失的移除,新增的淡入(CSS animation)。
// ============================================================
export function syncScenery(props) {
  const stage = document.getElementById('puppet-stage');
  if (!stage) return;
  let layer = stage.querySelector('.scenery-layer');
  const want = props || [];
  if (!want.length) { if (layer) layer.remove(); return; }
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'scenery-layer';
    stage.insertBefore(layer, stage.firstChild);
  }
  [...layer.children].forEach(el => {
    if (!want.some(p => p.id === el.dataset.scenery)) el.remove();
  });
  want.forEach(p => {
    const def = SCENERY[p.id];
    if (!def) return;
    if (layer.querySelector(`[data-scenery="${p.id}"]`)) return;
    const el = document.createElement('div');
    el.className = 'scenery-prop';
    el.dataset.scenery = p.id;
    el.style.cssText = def.style;
    el.innerHTML = def.svg;
    el.title = isEn() ? def.en : def.label;
    layer.appendChild(el);
  });
}

// Live preview: derive both puppets' poses from the sentence being composed.
// Uses the SAME meaning-resolution as the evaluator so the preview can never
// disagree with what chanting will do.
export function updatePuppets() {
  const { player, enemy } = els();
  if (!player || !enemy) return;
  initPuppetSprites(document.getElementById('puppet-stage') || document);

  // 景物道具是持久布景,与姿态动画无关 — 放在 chanting 早退之前,吟诵中也同步。
  syncScenery(G.sceneryProps);

  const sentence = applyMeaningsToSentence(G.sentence || []);
  const hasEnemyTarget = sentence.some(c => c && c._isEnemyTarget);
  const verbs = sentence.filter(c => c && c.pos === 'verb');
  const lastVerb = verbs[verbs.length - 1];
  const stageEnemyIntent = (G.enemies || []).find(e => e && e.hp > 0)?.nextIntent || null;

  let playerPose = 'idle';
  let enemyPose = 'idle';
  let playerEmoji = '';
  let enemyEmoji = '';
  let playerScale = 1;   // identity body-size (我是儿子→0.6, 我是巨人→1.5…)
  let playerSpriteKey = 'lqz';
  let playerIdentity = '';
  let enemyScale = 1;
  let coActorIdentity = null;  // "初音未来是皇帝" → crown on the co-actor puppet
  let playerAiming = false;    // transitive verb + target → step toward the foe

  if (hasEnemyTarget) enemyPose = 'targeted';
  else if (stageEnemyIntent?.type === 'attack' || stageEnemyIntent?.type === 'special' || stageEnemyIntent?.type === 'debuff') enemyPose = 'ready';
  else if (stageEnemyIntent?.type === 'defend') enemyPose = 'defend';
  else if (stageEnemyIntent?.type === 'buff') enemyPose = 'heal';

  if (lastVerb) {
    if (lastVerb.combatType === 'attack') {
      playerPose = 'ready';
      if (hasEnemyTarget) enemyPose = 'targeted';
    } else if (lastVerb.combatType === 'defense') {
      playerPose = 'defend';
    } else if (lastVerb.combatType === 'heal') {
      playerPose = 'heal';
    }
    // 及物动词(valence trans/ditrans)+ 已选敌方目标 ⇒ 我方向前逼近,预告"即将把
    // 这个动作施加到目标身上"。不及物动词(摸鱼/逃)只在原地摆姿势,不前压。
    const isTransitive = lastVerb.valence === 'trans' || lastVerb.valence === 'ditrans';
    if (isTransitive && hasEnemyTarget && lastVerb.combatType !== 'defense' && lastVerb.combatType !== 'heal') {
      playerAiming = true;
    }
  }

  // Imperative preview — "给我V" active meaning anywhere in the sentence
  if (sentence.some(c => c && c._activeMeaning && c._activeMeaning.id === 'gei_imperative')) {
    playerPose = 'ready';
    playerEmoji = '🫵';
    enemyPose = 'targeted';
  }

  // "A 是 B" preview — the same detector the evaluator uses
  const pred = detectPredicates(sentence)[0];
  if (pred) {
    if (pred.kind === 'pun' && PUN_TO_POSE[pred.pun.tag]) {
      if (pred.target === 'self') {
        // "我是给" — the wisecrack buffs the poet, not the enemy
        playerPose = 'heal';
        playerEmoji = PUN_TO_POSE[pred.pun.tag].emoji;
      } else {
        enemyPose = PUN_TO_POSE[pred.pun.tag].pose;
        enemyEmoji = PUN_TO_POSE[pred.pun.tag].emoji;
      }
    } else if (pred.kind === 'identity') {
      const trait = resolveIdentityTrait(pred.identityWord, pred.identityIsEnemyName);
      const subjIsCoActor = sentence.some(c => c && c.pos === 'subject' && c.word === pred.subjectWord
        && c.word !== '我' && !isYouCard(c) && !c._isEnemyTarget);
      if (pred.target === 'self') {
        playerPose = 'heal'; playerEmoji = trait.emoji;
        const identitySprite = IDENTITY_SPRITES[pred.identityWord];
        if (identitySprite) {
          playerSpriteKey = identitySprite.key;
          playerIdentity = pred.identityWord;
          playerScale = identitySprite.scale;
        } else if (trait.bodyScale) playerScale = trait.bodyScale;
      } else if (subjIsCoActor) {
        // "初音未来是皇帝" — the crown belongs to the co-actor, not the enemy.
        coActorIdentity = { name: pred.subjectWord, emoji: trait.emoji, scale: trait.bodyScale || 1 };
      } else {
        // "敌人是大哥" 这类 enemyBuff 身份:敌人不是被削,而是气场全开 → 用攻击姿势
        // (前压)而非眩晕脸,免得视觉上误导成"敌人倒霉"。
        enemyPose = trait.enemyBuff ? 'attack' : 'dazed';
        enemyEmoji = trait.emoji;
        if (trait.bodyScale) enemyScale = trait.bodyScale;
      }
    } else if (pred.kind === 'forbidden') {
      enemyEmoji = '🚫';
    } else if (pred.kind === 'tautology') {
      playerEmoji = '🪞';
    }
  } else {
    // Fallback: a punned meaning active without a full A-是-B clause yet
    for (let i = 0; i < sentence.length; i++) {
      const c = sentence[i];
      if (!c) continue;
      const tag = (c._activeMeaning && c._activeMeaning.pun && c._activeMeaning.pun.tag)
        || (c.pun && !Array.isArray(c.meanings) && sentence.slice(0, i).some(p => p && p.copulaConn) ? c.pun.tag : null);
      if (tag && PUN_TO_POSE[tag]) {
        enemyPose = PUN_TO_POSE[tag].pose;
        enemyEmoji = PUN_TO_POSE[tag].emoji;
        break;
      }
    }
  }

  // Laughter motif — enemy giggles itself useless
  const motifText = sentence.map(c => (c && c.word) || '').join('');
  if (/欢笑|哈哈|沉溺|暂停|深度思考/.test(motifText)) {
    enemyPose = 'dazed';
    enemyEmoji = '😂';
  }

  // 身体状态覆盖句子驱动的姿态:全灭 → 倒地;濒死(≤30%) → 持续颤抖。
  // critical 类在 chanting 门之前同步——它是持续体征, 不该被吟诵动画冻结。
  const aliveEnemies = (G.enemies || []).filter(e => e && e.hp > 0);
  const stageEnemy = aliveEnemies[0];
  if ((G.enemies || []).length > 0 && aliveEnemies.length === 0) enemyPose = 'dying';
  enemy.classList.toggle('puppet-critical', !!(stageEnemy && stageEnemy.hp <= stageEnemy.maxHp * 0.3));
  player.classList.toggle('puppet-critical', G.hp > 0 && G.hp <= G.maxHp * 0.3);

  // Never override a running battle animation
  if (player.dataset.chanting === '1') return;
  player.dataset.spriteKey = playerSpriteKey;
  if (playerIdentity) player.dataset.identity = playerIdentity;
  else delete player.dataset.identity;
  setPose(player, playerPose);
  setPose(enemy, enemyPose);
  player.classList.toggle('puppet-aiming', playerAiming);
  setEmoji(player, playerEmoji);
  setEmoji(enemy, enemyEmoji);
  setBodyScale(player, playerScale);   // identity-driven size (我是儿子→小, 巨人→大)
  setBodyScale(enemy, enemyScale);
  // Play a one-shot cue when a puppet first enters a notable state.
  cuePose('enemy', enemyPose);
  cuePose('player', playerPose);

  // Standby co-actors: named subjects (not 我) take the stage as soon as they
  // join a sentence with ANY verb (attack/defend/heal) — instant "ally arrived"
  // feedback while composing. They act only on chant. Mirrors the evaluator's rule.
  const hasVerb = sentence.some(c => c && c.pos === 'verb');
  const standbyNames = hasVerb
    ? sentence.filter(c => c && c.pos === 'subject' && c.word !== '我'
        && !c._isEnemyTarget && !c._isSelfTarget
        && !isYouCard(c)                     // "你" = the enemy, not a友方 ally
        && !isCopulaPredicate(sentence, c))  // exclude "我是影子" identity B
        .map(c => c.word)
    : [];
  syncStandbyCoActors(standbyNames);

  // "初音未来是皇帝": put the crown (+ any body-scale) on that co-actor's puppet.
  if (coActorIdentity) {
    const el = document.querySelector(`.puppet-coactor.standby[data-coactor="${coActorIdentity.name}"]`);
    if (el) {
      setEmoji(el, coActorIdentity.emoji);
      if (coActorIdentity.scale !== 1) setBodyScale(el, coActorIdentity.scale);
    }
  }

  // Reaction bubbles — after standbys are synced so a co-actor can quip on entry.
  maybeShowBubbles();
}

// Chant sequence: anticipation → dash/pose → impact → recover.
// effects is the evaluator result.effects (may be a stub for summons).
export function playChantPuppetAnim(effects, timing) {
  const { player, enemy } = els();
  if (!player || !enemy) return;
  clearPuppetBubbles(); // compose-time quips must not linger over the chant
  player.dataset.chanting = '1';
  enemy.dataset.chanting = '1';
  // Drop the compose-time aim lean so the chant's own inline transform (a full
  // dash) isn't overridden by the !important aiming class.
  player.classList.remove('puppet-aiming');

  const isAttack = !!(effects && (effects.damage > 0 || effects.aoe));
  const isHeal = !!(effects && effects.heal > 0 && !isAttack);
  const isBlock = !!(effects && effects.block > 0 && !isAttack);
  // 祈使/驱虎吞狼:动手的不是诗人 —— 诗人只上前一步点将,不冲锋。
  const imperative = !!(effects && (effects._imperative || effects._enemyVsEnemy));
  const pred = (effects && effects._predicates && effects._predicates[0]) || null;
  const selfPun = pred && pred.kind === 'pun' && pred.target === 'self' ? pred.pun.tag : null;
  const punTag = pred && pred.kind === 'pun' && pred.target !== 'self' ? pred.pun.tag : null;
  const motif = (effects && effects._motifTriggers && effects._motifTriggers.length > 0)
    ? effects._motifTriggers[0].motif.id : null;
  const coActors = (effects && effects._coActors) || [];
  const clock = {
    dash: timing?.dashMs ?? 120,
    impact: timing?.impactMs ?? IMPACT_MS,
    recover: timing?.recoverMs ?? 720,
    release: timing?.releaseMs ?? (coActors.length ? 1000 + 300 * coActors.length + 1300 : 1000),
  };

  const seq = [
    // 0ms — anticipation crouch
    [0, () => {
      player.style.transition = 'transform 0.15s ease-out';
      player.style.transform = 'translateY(2px) scaleY(0.94)';
      enemy.style.transition = 'transform 0.15s ease-out';
    }],
    // 120ms — dash / pose
    [clock.dash, () => {
      player.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      const dx = gapX(player, enemy);
      if (imperative) {
        // Commander stays put — a short step and a pointed finger
        player.style.transform = 'translateX(14px)';
        player.dataset.pose = 'attack';
        setEmoji(player, '🫵');
      } else if (isAttack) {
        // 落点停在守方身前(留一个身位), 攻方冲、守方退、中间有缝——
        // 命中帧谁打谁一目了然, 不再叠成一团。
        player.style.transform = `translateX(${Math.max(40, dx - 72)}px)`;
        player.dataset.pose = 'attack';
      } else if (isBlock) {
        player.style.transform = 'translateY(0)';
        player.dataset.pose = 'defend';
      } else if (isHeal) {
        player.style.transform = 'translateY(-3px)';
        player.dataset.pose = 'heal';
      } else {
        player.style.transform = `translateX(${Math.max(24, dx * 0.45)}px)`;
        player.dataset.pose = 'attack';
      }
    }],
    // IMPACT — enemy reacts
    [clock.impact, () => {
      if (effects && effects._enemyVsEnemy) {
        // 驱虎吞狼:主敌人棍人(=被打的宾语敌)吃冲撞后仰;
        // 出手的"倒戈敌人"由 playEnemyVsEnemyAnim 的临时棍人演。
        enemy.style.transition = 'transform 0.25s ease-out';
        enemy.style.transform = 'translateX(18px) rotate(6deg) scale(0.97)';
        enemy.dataset.pose = 'hit';
        impactFlash(enemy);
      } else if (imperative) {
        // The enemy obeys and strikes itself
        enemy.style.transition = 'transform 0.2s ease-out';
        enemy.style.transform = 'rotate(8deg) scale(0.94)';
        enemy.dataset.pose = 'juan';
        impactFlash(enemy);
      } else if (isAttack) {
        // 守方后仰要接得住攻方的冲势(攻冲 40px+, 守退 18px 才有作用力感)。
        enemy.style.transition = 'transform 0.25s ease-out';
        enemy.style.transform = 'translateX(18px) rotate(6deg) scale(0.97)';
        enemy.dataset.pose = 'hit';
        impactFlash(enemy);
      }
      if (selfPun && PUN_TO_POSE[selfPun]) {
        player.dataset.pose = 'heal';
        setEmoji(player, PUN_TO_POSE[selfPun].emoji);
      } else if (pred && pred.kind === 'pun' && (pred.target === 'coactor' || pred.target === 'broadcast') && PUN_TO_POSE[pred.pun.tag]) {
        // "猫是给" — 双关落在具名主语自己的棍人上(魅惑的心冒在猫头顶,
        // 不再错冒到敌人头上)
        const coEl = document.querySelector(`.puppet-coactor[data-coactor="${pred.subjectWord}"]`);
        if (coEl) {
          coEl.dataset.pose = PUN_TO_POSE[pred.pun.tag].pose;
          setEmoji(coEl, PUN_TO_POSE[pred.pun.tag].emoji);
        }
      } else if (punTag && PUN_TO_POSE[punTag]) {
        enemy.dataset.pose = PUN_TO_POSE[punTag].pose;
        setEmoji(enemy, PUN_TO_POSE[punTag].emoji);
      } else if (pred && pred.kind === 'identity') {
        const trait = resolveIdentityTrait(pred.identityWord, pred.identityIsEnemyName);
        if (pred.target === 'self') {
          player.dataset.pose = 'heal';
          setEmoji(player, trait.emoji);
        } else {
          enemy.dataset.pose = trait.enemyBuff ? 'attack' : 'dazed';
          setEmoji(enemy, trait.emoji);
        }
      } else if (pred && pred.kind === 'forbidden') {
        setEmoji(enemy, '🚫');
      }
      if (motif === 'laughter_pause') {
        enemy.dataset.pose = 'dazed';
        setEmoji(enemy, '😂');
      }
    }],
    // Co-actors (猫/影子/初音…) get their OWN puppets summoned onto the stage
    // (see playCoActors below, fired right after this sequence starts).
    // 720ms — recover positions
    [clock.recover, () => {
      player.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      player.style.transform = '';
      enemy.style.transition = 'transform 0.3s ease-out';
      enemy.style.transform = '';
      player.dataset.pose = 'idle';
      if (enemy.dataset.pose === 'hit') enemy.dataset.pose = 'idle';
    }],
    // release the stage back to updatePuppets — after co-actors finish too
    [clock.release, () => {
      player.style.transform = '';
      enemy.style.transform = '';
      player.dataset.chanting = '';
      enemy.dataset.chanting = '';
      player.dataset.pose = 'idle';
      player.dataset.spriteKey = 'lqz';
      delete player.dataset.identity;
      enemy.classList.remove('puppet-impact');
    }],
  ];
  seq.forEach(([at, fn]) => setTimeout(fn, at));

  // Right after the poet's own strike, the standby co-actors (already on stage
  // from composition) dash out and pile on.
  if (coActors.length) setTimeout(() => playCoActors(coActors), clock.impact + 150);
}

// 驱虎吞狼小剧场:克隆一个临时"倒戈敌人"棍人(标注敌名),从主敌人棍人
// 侧后方现身、冲撞过去;命中与 IMPACT_MS 同拍(主敌人的受击后仰由
// playChantPuppetAnim 的 _enemyVsEnemy 分支负责),演完自行淡出移除。
export function playEnemyVsEnemyAnim(eve, timing) {
  const { enemy } = els();
  const stage = document.getElementById('puppet-stage');
  if (!enemy || !stage || !eve) return;
  // 全部转设计坐标(uiScale 固定画布):tmp 是 stage 内的 absolute 元素。
  const er = toGameRect(enemy.getBoundingClientRect());
  const sr = toGameRect(stage.getBoundingClientRect());
  if (!er.width || !sr.width) return;
  const tmp = enemy.cloneNode(true);
  tmp.removeAttribute('id');
  tmp.classList.add('puppet-eve-src');
  tmp.dataset.pose = 'idle';
  tmp.dataset.chanting = '';
  Object.assign(tmp.style, {
    position: 'absolute',
    left: (er.left - sr.left - Math.min(130, er.width + 44)) + 'px',
    top: (er.top - sr.top + 4) + 'px',
    width: er.width + 'px',
    height: er.height + 'px',
    opacity: '1',
    zIndex: 3,
    pointerEvents: 'none',
    transform: 'scale(0.82) translateX(-16px)',
    transition: 'transform 0.25s ease-out',
  });
  const label = tmp.querySelector('.puppet-label');
  if (label && eve.srcWord) label.textContent = eve.srcWord;
  stage.appendChild(tmp);
  ensureSpriteAnimator(tmp);
  playSFX('summon');
  const impactAt = timing?.impactMs ?? IMPACT_MS;
  const seq = [
    [30, () => { tmp.style.transform = 'scale(0.82)'; }],
    [200, () => {
      tmp.style.transition = 'transform 0.22s cubic-bezier(0.22,1,0.36,1)';
      tmp.style.transform = 'scale(0.82) translateX(88px)';
      tmp.dataset.pose = 'attack';
    }],
    [impactAt, () => { impactFlash(tmp); }],
    [700, () => {
      tmp.style.transition = 'transform 0.3s ease-out';
      tmp.style.transform = 'scale(0.82) translateX(-6px)';
    }],
    [1080, () => tmp.remove()],
  ];
  seq.forEach(([at, fn]) => setTimeout(fn, at));
}

// Enemy acting: mirror of the chant sequence — enemy dashes, player reacts.
// intent: { type:'attack'|'defend'|'buff'|'debuff'|'special', value, hits?, label? }
export function playEnemyPuppetAnim(intent, opts) {
  opts = opts || {};
  const { player, enemy } = els();
  if (!player || !enemy) return;
  player.dataset.chanting = '1';
  enemy.dataset.chanting = '1';

  // Stunned/sleeping enemies just snooze and yield
  if (opts.stunned) {
    enemy.dataset.pose = 'dazed';
    setEmoji(enemy, '💤');
    setTimeout(() => {
      enemy.dataset.pose = 'idle';
      setEmoji(enemy, '');
      player.dataset.chanting = '';
      enemy.dataset.chanting = '';
    }, 600);
    return;
  }

  const t = (intent && intent.type) || 'attack';
  const dmg = (intent && intent.value) || 0;
  const hits = (intent && intent.hits) || 1;
  const heavy = dmg >= 12 || hits >= 2;
  const clock = {
    anticipation: opts.timeline?.anticipationMs ?? 0,
    dash: opts.timeline?.dashMs ?? 120,
    impact: opts.timeline?.impactMs ?? IMPACT_MS,
    recover: opts.timeline?.recoverMs ?? 720,
    release: opts.timeline?.releaseMs ?? 1000,
  };

  const seq = [
    [clock.anticipation, () => {
      // 蓄力前摇:蜷缩 + 朱红光晕预告"要挨打了", 给玩家一拍紧张感。
      enemy.style.transition = 'transform 0.15s ease-out';
      enemy.style.transform = 'translateY(2px) scaleY(0.9) scale(0.96)';
    }],
    [clock.dash, () => {
      enemy.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      const dx = gapX(enemy, player); // negative: player is to the left
      if (t === 'attack') {
        // 同 chant 侧:停在玩家身前一个身位, 不盖住守方本体。
        enemy.style.transform = `translateX(${Math.min(-40, dx + 72)}px)`;
        enemy.dataset.pose = 'attack';
      } else if (t === 'defend') {
        enemy.style.transform = 'translateY(0)';
        enemy.dataset.pose = 'defend';
      } else if (t === 'buff') {
        enemy.style.transform = 'translateY(-4px) scale(1.06)';
        enemy.dataset.pose = 'heal'; // reuse heal glow for buffs
      } else if (t === 'debuff') {
        enemy.style.transform = `translateX(${Math.min(-24, dx * 0.45)}px)`;
        enemy.dataset.pose = 'attack';
      } else if (t === 'special') {
        enemy.style.transform = 'translateY(-4px)';
        enemy.dataset.pose = 'attack';
      }
    }],
    [clock.impact, () => {
      if (t === 'attack') {
        // 击退幅度要"看得见疼": 轻击退半步, 重击退一大步 + 身体收缩。
        player.style.transition = 'transform 0.25s ease-out';
        player.style.transform = heavy
          ? 'translateX(-26px) rotate(-9deg) scale(0.94)'
          : 'translateX(-14px) rotate(-5deg) scale(0.97)';
        player.dataset.pose = 'hit';
        impactFlash(player);
      } else if (t === 'debuff') {
        player.dataset.pose = 'dazed';
        setEmoji(player, '😵');
      }
    }],
    [clock.recover, () => {
      enemy.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      enemy.style.transform = '';
      player.style.transition = 'transform 0.3s ease-out';
      player.style.transform = '';
      enemy.dataset.pose = 'idle';
    }],
    [clock.release, () => {
      enemy.style.transform = '';
      player.style.transform = '';
      player.classList.remove('puppet-impact');
      setEmoji(player, '');
      player.dataset.pose = 'idle';
      player.dataset.chanting = '';
      enemy.dataset.chanting = '';
      // Sentence is empty after end-turn, so updatePuppets restores idle
    }],
  ];
  seq.forEach(([at, fn]) => setTimeout(fn, at));
}

// ============================================================
// BEST-VERSE REPLAY (reward screen)
// Builds a self-contained mini stage and re-enacts the combat's highest-mult
// line: poet (+ any co-actors) dash at the enemy, who reacts. Pure clone of the
// live puppet markup so it always matches the current art. The cycle loops on an
// interval while the reward screen is open; stopBestVerseReplay() clears it.
// ============================================================
let _bestVerseInterval = null;
export function stopBestVerseReplay() {
  if (_bestVerseInterval) { clearInterval(_bestVerseInterval); _bestVerseInterval = null; }
}
export function playBestVerseReplay(bestLine, stageEl) {
  if (!bestLine || !stageEl) return;
  const livePlayer = document.getElementById('puppet-player');
  const liveEnemy = document.getElementById('puppet-enemy');
  if (!livePlayer || !liveEnemy) return;

  // Mini stage scaffold
  stageEl.innerHTML = '';
  stageEl.style.position = 'relative';

  const poet = livePlayer.cloneNode(true);
  poet.id = ''; poet.dataset.chanting = ''; poet.dataset.pose = 'idle';
  poet.style.cssText = 'position:absolute;left:8%;bottom:6%;width:22%;transform-origin:bottom center;';
  const foe = liveEnemy.cloneNode(true);
  foe.id = ''; foe.dataset.chanting = ''; foe.dataset.pose = 'idle';
  foe.style.cssText = 'position:absolute;right:8%;bottom:6%;width:22%;transform-origin:bottom center;';
  stageEl.appendChild(poet);
  stageEl.appendChild(foe);
  ensureSpriteAnimator(poet);
  ensureSpriteAnimator(foe);

  // Co-actors: replay the canonical list the evaluator already produced
  // (effects._coActors), not a re-scan — so we show exactly who fought, including
  // generic figures, and never invent actors for identity/copula lines.
  const names = [];
  ((bestLine.effects && bestLine.effects._coActors) || []).forEach(a => {
    if (a && a.name && !names.includes(a.name)) names.push(a.name);
  });
  const extras = names.slice(0, 3).map((name, i) => {
    const el = document.createElement('div');
    el.className = 'puppet puppet-coactor';
    el.dataset.spriteSide = 'ally';
    el.dataset.spriteKey = coActorSpriteKey(name);
    el.dataset.pose = 'idle';
    el.innerHTML = coActorSprite(name);
    el.style.cssText = `position:absolute;left:${34 + i * 12}%;bottom:5%;width:17%;transform-origin:bottom center;z-index:${3 - i};`;
    setEmoji(el, coActorEmoji(name));
    stageEl.appendChild(el);
    ensureSpriteAnimator(el);
    return el;
  });

  const isAttack = !!(bestLine.effects && (bestLine.effects.damage > 0 || bestLine.effects.aoe));
  const allies = [poet, ...extras];

  // One dash → impact → recover cycle, looped on an interval so the highlight
  // keeps replaying while the reward screen is open. Timers are tracked on the
  // stage element so a re-entry (or stopBestVerseReplay) clears them cleanly.
  const runCycle = () => {
    const t = [];
    t.push(setTimeout(() => {
      allies.forEach((a, i) => {
        a.dataset.pose = isAttack ? 'attack' : 'heal';
        a.style.transition = 'transform 0.35s cubic-bezier(0.22,1,0.36,1)';
        a.style.transform = isAttack ? `translateX(${110 + i * 6}%)` : 'translateY(-4%)';
      });
    }, 350));
    t.push(setTimeout(() => {
      if (isAttack) { foe.dataset.pose = 'hit'; impactFlash(foe); foe.style.transition='transform 0.2s ease-out'; foe.style.transform = 'translateX(6%) rotate(4deg)'; }
      playSFX(isAttack ? 'hit_heavy' : 'heal');
    }, 720));
    t.push(setTimeout(() => {
      allies.forEach(a => { a.style.transform = ''; a.dataset.pose = 'idle'; });
      foe.style.transform = ''; foe.dataset.pose = 'idle';
    }, 1100));
    stageEl._cycleTimers = t;
  };
  stopBestVerseReplay();           // clear any prior loop first
  runCycle();
  _bestVerseInterval = setInterval(runCycle, 2200);
}
