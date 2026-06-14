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
import { detectPredicates, resolveIdentityTrait } from '../game/poetics.js';

export const IMPACT_MS = 420;

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
};
const coActorEmoji = (name) => COACTOR_EMOJI[name] || '🥷';

// Build one standby co-actor puppet (cloned from the poet, role emoji above).
function makeStandby(name, indexFromZero) {
  const player = document.getElementById('puppet-player');
  const clone = player.cloneNode(true);
  clone.id = '';
  clone.className = 'puppet puppet-coactor standby';
  clone.dataset.pose = 'idle';
  clone.dataset.coactor = name;
  const label = clone.querySelector('.puppet-label');
  if (label) { label.textContent = name; label.style.opacity = '0.7'; }
  setEmoji(clone, coActorEmoji(name));
  clone.style.position = 'absolute';
  clone.style.left = (4 + indexFromZero * 11) + '%'; // fan out left of the poet
  clone.style.bottom = '6%';
  clone.style.zIndex = String(3 - indexFromZero);
  clone.style.opacity = '0';
  clone.style.transform = 'scale(0.62)';
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

  // Remove standbys no longer present.
  existing.forEach(el => {
    if (!want.includes(el.dataset.coactor)) {
      el.style.opacity = '0';
      el.style.transform = 'scale(0.62)';
      setTimeout(() => el.remove(), 250);
    }
  });

  // Add missing standbys, fanned out by their order of appearance.
  want.forEach((name, i) => {
    if (existing.some(el => el.dataset.coactor === name && el.isConnected)) {
      // keep position fresh in case index changed
      const el = existing.find(e => e.dataset.coactor === name);
      el.style.left = (4 + i * 11) + '%';
      return;
    }
    const el = makeStandby(name, i);
    stage.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'scale(0.82)'; });
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
  standbys.forEach((el, i) => {
    const dx = gapX(el, enemy);
    setTimeout(() => {
      el.dataset.pose = 'attack';
      el.style.transform = `translateX(${Math.max(40, dx - 30)}px) scale(1)`;
    }, 300 * i + 120);
    setTimeout(() => { enemy.dataset.pose = 'hit'; impactFlash(enemy); }, 300 * i + 400);
    setTimeout(() => { el.dataset.pose = 'idle'; el.style.transform = 'scale(0.82)'; }, 300 * i + 620);
    setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'scale(0.62)'; }, 300 * i + 900);
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
      enemyPose = PUN_TO_POSE[pred.pun.tag].pose;
      enemyEmoji = PUN_TO_POSE[pred.pun.tag].emoji;
    } else if (pred.kind === 'identity') {
      const trait = resolveIdentityTrait(pred.identityWord, pred.identityIsEnemyName);
      if (pred.target === 'self') { playerPose = 'heal'; playerEmoji = trait.emoji; }
      else { enemyPose = 'dazed'; enemyEmoji = trait.emoji; }
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
  setEmoji(player, playerEmoji);
  setEmoji(enemy, enemyEmoji);

  // Standby co-actors: named subjects (not 我) take the stage as soon as they
  // join an attack-on-enemy sentence — instant "summoned ally arrived" feedback
  // while composing. They act only on chant. Mirrors the evaluator's rule.
  const hasAttackOnEnemy = hasEnemyTarget
    && sentence.some(c => c && c.pos === 'verb' && c.combatType === 'attack');
  const standbyNames = hasAttackOnEnemy
    ? sentence.filter(c => c && c.pos === 'subject' && c.word !== '我' && !c._isEnemyTarget && !c._isSelfTarget)
        .map(c => c.word)
    : [];
  syncStandbyCoActors(standbyNames);
}

// Chant sequence: anticipation → dash/pose → impact → recover.
// effects is the evaluator result.effects (may be a stub for summons).
export function playChantPuppetAnim(effects) {
  const { player, enemy } = els();
  if (!player || !enemy) return;
  player.dataset.chanting = '1';
  enemy.dataset.chanting = '1';

  const isAttack = !!(effects && (effects.damage > 0 || effects.aoe));
  const isHeal = !!(effects && effects.heal > 0 && !isAttack);
  const isBlock = !!(effects && effects.block > 0 && !isAttack);
  const imperative = !!(effects && effects._imperative);
  const pred = (effects && effects._predicates && effects._predicates[0]) || null;
  const punTag = pred && pred.kind === 'pun' ? pred.pun.tag : null;
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
      if (punTag && PUN_TO_POSE[punTag]) {
        enemy.dataset.pose = PUN_TO_POSE[punTag].pose;
        setEmoji(enemy, PUN_TO_POSE[punTag].emoji);
      } else if (pred && pred.kind === 'identity') {
        const trait = resolveIdentityTrait(pred.identityWord, pred.identityIsEnemyName);
        if (pred.target === 'self') {
          player.dataset.pose = 'heal';
          setEmoji(player, trait.emoji);
        } else {
          enemy.dataset.pose = 'dazed';
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
