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
import { playSFX } from '../game/audio.js';

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

// Identity body-size: scale the inner SVG (not the .puppet, whose transform is
// driven by pose CSS). Applied via a CSS var so it composes cleanly.
function setBodyScale(el, scale) {
  if (!el) return;
  const svg = el.querySelector('.puppet-svg');
  if (svg) svg.style.transform = scale && scale !== 1 ? `scale(${scale})` : '';
}

function impactFlash(el) {
  el.classList.remove('puppet-impact');
  void el.offsetWidth;
  el.classList.add('puppet-impact');
}

// Horizontal center-to-center distance, so the dash actually reaches the
// opponent regardless of stage width.
function gapX(from, to) {
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  return (b.left + b.width / 2) - (a.left + a.width / 2);
}

// A named subject's signature icon (shown over its summoned puppet).
const COACTOR_EMOJI = {
  '猫': '🐱', '影子': '🌑', '无名者': '👤', '初音未来': '🎤', '剑客': '🗡️',
  '书生': '📚', '月兔': '🐰', '僧人': '🙏', '女侠': '⚔️', '酒仙': '🍶',
  '狐仙': '🦊', '将军': '🎖️', '皇帝': '👑', '李清照': '📜', '日': '☀️',
  '大哥': '🕶️',
};
const coActorEmoji = (name) => COACTOR_EMOJI[name] || '🥷';

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

function coActorSVG(name) {
  const inner = COACTOR_SVG[name] || genericCoActorSVG();
  return `<svg viewBox="0 0 80 100" class="puppet-svg" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

// Build one standby co-actor puppet with its OWN character SVG.
function makeStandby(name, indexFromZero) {
  const clone = document.createElement('div');
  clone.className = 'puppet puppet-coactor standby';
  clone.dataset.coactor2 = (COACTOR_SVG[name] ? name : 'generic');
  clone.dataset.pose = 'idle';
  clone.dataset.coactor = name;
  clone.innerHTML = `${coActorSVG(name)}<div class="puppet-label">${name}</div>`;
  const label = clone.querySelector('.puppet-label');
  if (label) { label.style.opacity = '0.7'; label.style.display = 'block'; }
  setEmoji(clone, coActorEmoji(name));
  clone.style.position = 'absolute';
  clone.style.left = (COACTOR_BASE_LEFT + indexFromZero * COACTOR_STEP) + '%';
  clone.style.bottom = '4%';
  clone.style.zIndex = String(3 - indexFromZero);
  clone.style.opacity = '0';
  clone.style.transformOrigin = 'bottom center';
  clone.style.transform = `scale(${COACTOR_SCALE - 0.1})`;
  clone.style.transition = 'opacity 0.25s, transform 0.3s cubic-bezier(0.22,1,0.36,1), left 0.3s';
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

  // Remove standbys no longer present. Mark them as fading and stash the pending
  // remove timer so a quick re-add can cancel it instead of losing the node.
  existing.forEach(el => {
    if (!want.includes(el.dataset.coactor)) {
      el.dataset.removing = '1';
      el.style.opacity = '0';
      el.style.transform = `scale(${COACTOR_SCALE - 0.1})`;
      el._removeTimer = setTimeout(() => el.remove(), 250);
    }
  });

  // Add missing standbys, fanned out by their order of appearance.
  want.forEach((name, i) => {
    // A still-attached node that is NOT mid-removal can be reused as-is.
    const live = existing.find(e => e.dataset.coactor === name && e.isConnected && e.dataset.removing !== '1');
    if (live) {
      live.style.left = (COACTOR_BASE_LEFT + i * COACTOR_STEP) + '%';
      return;
    }
    // A node that was fading out for this same name: cancel its removal and revive
    // it (no new SFX, no flicker) instead of double-spawning.
    const reviving = existing.find(e => e.dataset.coactor === name && e.isConnected && e.dataset.removing === '1');
    if (reviving) {
      clearTimeout(reviving._removeTimer);
      reviving.dataset.removing = '';
      reviving.style.left = (COACTOR_BASE_LEFT + i * COACTOR_STEP) + '%';
      reviving.style.opacity = '1';
      reviving.style.transform = `scale(${COACTOR_SCALE})`;
      return;
    }
    const el = makeStandby(name, i);
    stage.appendChild(el);
    playSFX('summon'); // a new ally just stepped onto the stage
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = `scale(${COACTOR_SCALE})`; });
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
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = `scale(${COACTOR_SCALE - 0.1})`; }, 300 * i + 900);
    setTimeout(() => el.remove(), 300 * i + 1200);
  });
}

// Live preview: derive both puppets' poses from the sentence being composed.
// Uses the SAME meaning-resolution as the evaluator so the preview can never
// disagree with what chanting will do.
export function updatePuppets() {
  const { player, enemy } = els();
  if (!player || !enemy) return;

  const sentence = applyMeaningsToSentence(G.sentence || []);
  const hasEnemyTarget = sentence.some(c => c && c._isEnemyTarget);
  const verbs = sentence.filter(c => c && c.pos === 'verb');
  const lastVerb = verbs[verbs.length - 1];

  let playerPose = 'idle';
  let enemyPose = 'idle';
  let playerEmoji = '';
  let enemyEmoji = '';
  let playerScale = 1;   // identity body-size (我是儿子→0.6, 我是巨人→1.5…)
  let enemyScale = 1;
  let coActorIdentity = null;  // "初音未来是皇帝" → crown on the co-actor puppet
  let playerAiming = false;    // transitive verb + target → step toward the foe

  if (hasEnemyTarget) enemyPose = 'targeted';

  if (lastVerb) {
    if (lastVerb.combatType === 'attack') {
      playerPose = 'attack';
      if (hasEnemyTarget) enemyPose = 'hit';
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
    playerPose = 'attack';
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
        if (trait.bodyScale) playerScale = trait.bodyScale;   // 我是儿子→变小, 我是巨人→变大
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

  // Never override a running battle animation
  if (player.dataset.chanting === '1') return;
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
}

// Chant sequence: anticipation → dash/pose → impact → recover.
// effects is the evaluator result.effects (may be a stub for summons).
export function playChantPuppetAnim(effects) {
  const { player, enemy } = els();
  if (!player || !enemy) return;
  player.dataset.chanting = '1';
  enemy.dataset.chanting = '1';
  // Drop the compose-time aim lean so the chant's own inline transform (a full
  // dash) isn't overridden by the !important aiming class.
  player.classList.remove('puppet-aiming');

  const isAttack = !!(effects && (effects.damage > 0 || effects.aoe));
  const isHeal = !!(effects && effects.heal > 0 && !isAttack);
  const isBlock = !!(effects && effects.block > 0 && !isAttack);
  const imperative = !!(effects && effects._imperative);
  const pred = (effects && effects._predicates && effects._predicates[0]) || null;
  const selfPun = pred && pred.kind === 'pun' && pred.target === 'self' ? pred.pun.tag : null;
  const punTag = pred && pred.kind === 'pun' && pred.target !== 'self' ? pred.pun.tag : null;
  const motif = (effects && effects._motifTriggers && effects._motifTriggers.length > 0)
    ? effects._motifTriggers[0].motif.id : null;
  const coActors = (effects && effects._coActors) || [];

  const seq = [
    // 0ms — anticipation crouch
    [0, () => {
      player.style.transition = 'transform 0.15s ease-out';
      player.style.transform = 'translateY(2px) scaleY(0.94)';
      enemy.style.transition = 'transform 0.15s ease-out';
    }],
    // 120ms — dash / pose
    [120, () => {
      player.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      const dx = gapX(player, enemy);
      if (imperative) {
        // Commander stays put — a short step and a pointed finger
        player.style.transform = 'translateX(14px)';
        player.dataset.pose = 'attack';
        setEmoji(player, '🫵');
      } else if (isAttack) {
        player.style.transform = `translateX(${Math.max(40, dx - 36)}px)`;
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
    [IMPACT_MS, () => {
      if (imperative) {
        // The enemy obeys and strikes itself
        enemy.style.transition = 'transform 0.2s ease-out';
        enemy.style.transform = 'rotate(8deg) scale(0.94)';
        enemy.dataset.pose = 'juan';
        impactFlash(enemy);
      } else if (isAttack) {
        enemy.style.transition = 'transform 0.25s ease-out';
        enemy.style.transform = 'translateX(8px) rotate(4deg)';
        enemy.dataset.pose = 'hit';
        impactFlash(enemy);
      }
      if (selfPun && PUN_TO_POSE[selfPun]) {
        player.dataset.pose = 'heal';
        setEmoji(player, PUN_TO_POSE[selfPun].emoji);
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
    [720, () => {
      player.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      player.style.transform = '';
      enemy.style.transition = 'transform 0.3s ease-out';
      enemy.style.transform = '';
    }],
    // release the stage back to updatePuppets — after co-actors finish too
    [coActors.length ? 1000 + 300 * coActors.length + 1300 : 1000, () => {
      player.style.transform = '';
      enemy.style.transform = '';
      player.dataset.chanting = '';
      enemy.dataset.chanting = '';
      player.dataset.pose = 'idle';
      enemy.classList.remove('puppet-impact');
    }],
  ];
  seq.forEach(([at, fn]) => setTimeout(fn, at));

  // Right after the poet's own strike, the standby co-actors (already on stage
  // from composition) dash out and pile on.
  if (coActors.length) setTimeout(() => playCoActors(coActors), IMPACT_MS + 150);
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

  const seq = [
    [0, () => {
      enemy.style.transition = 'transform 0.15s ease-out';
      enemy.style.transform = 'translateY(2px) scaleY(0.94)';
    }],
    [120, () => {
      enemy.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      const dx = gapX(enemy, player); // negative: player is to the left
      if (t === 'attack') {
        enemy.style.transform = `translateX(${Math.min(-40, dx + 36)}px)`;
        enemy.dataset.pose = 'attack';
      } else if (t === 'defend') {
        enemy.style.transform = 'translateY(0)';
        enemy.dataset.pose = 'defend';
      } else if (t === 'buff') {
        enemy.style.transform = 'translateY(-4px) scale(1.06)';
        enemy.dataset.pose = 'heal'; // reuse heal glow for buffs
        enemy.style.filter = 'drop-shadow(0 0 8px var(--gold))';
      } else if (t === 'debuff') {
        enemy.style.transform = `translateX(${Math.min(-24, dx * 0.45)}px)`;
        enemy.dataset.pose = 'attack';
        enemy.style.filter = 'drop-shadow(0 0 8px var(--purple))';
      } else if (t === 'special') {
        enemy.style.transform = 'translateY(-4px)';
        enemy.dataset.pose = 'attack';
        enemy.style.filter = 'drop-shadow(0 0 10px var(--cyan))';
      }
    }],
    [IMPACT_MS, () => {
      if (t === 'attack') {
        player.style.transition = 'transform 0.25s ease-out';
        player.style.transform = heavy
          ? 'translateX(-14px) rotate(-7deg) scale(0.96)'
          : 'translateX(-8px) rotate(-4deg)';
        player.dataset.pose = 'hit';
        impactFlash(player);
      } else if (t === 'debuff') {
        player.dataset.pose = 'dazed';
        setEmoji(player, '😵');
      }
    }],
    [720, () => {
      enemy.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
      enemy.style.transform = '';
      enemy.style.filter = '';
      player.style.transition = 'transform 0.3s ease-out';
      player.style.transform = '';
    }],
    [1000, () => {
      enemy.style.transform = '';
      enemy.style.filter = '';
      player.style.transform = '';
      player.classList.remove('puppet-impact');
      setEmoji(player, '');
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
    el.dataset.pose = 'idle';
    el.innerHTML = `${coActorSVG(name)}<div class="puppet-label">${name}</div>`;
    el.style.cssText = `position:absolute;left:${34 + i * 12}%;bottom:5%;width:17%;transform-origin:bottom center;z-index:${3 - i};`;
    setEmoji(el, coActorEmoji(name));
    stageEl.appendChild(el);
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
