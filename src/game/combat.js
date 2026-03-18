import { G, META, saveMeta } from './state.js';
import { showFloatingText, shuffleArray } from '../utils.js';
import { playSFX, initAudio, playAmbientMusic, playCombatMusic, playBossMusic, stopMusic } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { WORD_DEFS, makeCard, createStarterDeck, randomCard, randomCardWeighted } from '../data/cards.js';
import { showScreen, renderCombat, createCardElement } from '../ui/render.js';
import { generateCharSVG } from '../ui/svgArt.js';
import { dealDamageToPlayer, dealDamageToEnemy, checkEnemies } from './damage.js';
import { generateMap, renderMap } from './map.js';
import { playStory, STORY_CHAPTERS_REF } from '../ui/storyOverlay.js';
import STORY_CHAPTERS from '../data/story.json';
import { detectSummon, SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition, detectDuizhang } from './sentence.js';
import { EVENTS_BY_ACT, EVENTS_FALLBACK } from '../data/events.js';
import { closeMetaScreen, showVictoryScreen } from '../ui/screens.js';

// ============================================================
// GAME START
// ============================================================
export function startGame() {
  initAudio(); closeMetaScreen();
  G.hp = 50; G.maxHp = 50; G.gold = 0; G.act = 1;
  G.deck = createStarterDeck();
  G.block = 0; G.strength = 0; G.vulnerable = 0; G.weak = 0;
  G.floorsCleared = 0; G.elitesKilled = 0; G.bossesKilled = 0; G.sentencesChanted = 0;
  G.sentenceJournal = [];
  G.currentRow = -1; G.currentNodeIndex = -1;
  G.sentence = []; G.enemyTargets = [];
  G.allCardsCostZero = false; G.poeticAura = false;
  G.shopInventory = null; G.drawLessNextTurn = 0;

  if (META.perks.includes('thick_paper')) { G.maxHp += 5; G.hp += 5; }
  if (META.perks.includes('ink_pot')) { G.gold += 15; }
  if (META.perks.includes('sharp_brush')) { G.strength += 1; }

  META.runs++; saveMeta();
  G.map = generateMap(1);
  playAmbientMusic();
  if (META.runs <= 1) {
    playStory('prologue', function() {
      playStory('act1_intro', function() {
        showScreen('map-screen');
        renderMap();
      });
    });
  } else {
    playStory('act1_intro', function() {
      showScreen('map-screen');
      renderMap();
    });
  }
}

// ============================================================
// COMBAT
// ============================================================
export function startCombat(enemyDefs) {
  const isBoss = enemyDefs.some(e => e.type === 'boss');
  G.enemies = enemyDefs.map(def => ({
    ...def, maxHp: def.hp, block:0, strength:0, vulnerable:0, weak:0,
    stunned:false, reflecting:false, nextIntent:null, element:null, tc:0,
  }));
  G.drawPile = shuffleArray([...G.deck]);
  G.discardPile = []; G.exhaustPile = []; G.hand = [];
  G.energy = G.maxEnergy; G.block = 0;
  G.sentence = []; G.enemyTargets = [];
  G.allCardsCostZero = false; G.poeticAura = false; G.poeticAuraNext = false;
  G.turn = 0; G.vulnerable = 0; G.weak = 0;
  G.drawLessNextTurn = 0;

  showScreen('combat-screen');
  try { var psvg = document.getElementById('player-char-svg'); if(psvg && typeof generateCharSVG==='function') psvg.innerHTML = generateCharSVG('liqingzhao', 36); } catch(e){}
  if (isBoss) playBossMusic(); else playCombatMusic();
  G.enemies.forEach(e => e.ai(e));
  startPlayerTurn();
}

export function startPlayerTurn() {
  if (G._skipNextPlayerTurn) {
    G._skipNextPlayerTurn = false;
    G.turn++;
    G.block = 0;
    showFloatingText(document.querySelector('#combat-top'), '💤 沉睡中...跳过回合', '#6B4C6E');
    renderCombat();
    setTimeout(enemyTurn, 600);
    return;
  }
  G.turn++;
  G.block = 0; G.energy = G.maxEnergy + (G._bonusEnergyNext || 0);
  G._bonusEnergyNext = 0;
  G.allCardsCostZero = false;
  G.poeticAura = G.poeticAuraNext || false;
  G.poeticAuraNext = false;
  G.sentence = [];
  if (G.vulnerable > 0) G.vulnerable--;
  if (G.weak > 0) G.weak--;
  let dc = META.perks.includes('extra_scroll') ? 6 : 5;
  dc -= G.drawLessNextTurn;
  dc += (G._bonusDrawNext || 0); G._bonusDrawNext = 0;
  if (dc < 1) dc = 1;
  G.drawLessNextTurn = 0;
  if (G._blockDebuffNext) { G._blockMult = 1 - G._blockDebuffNext; G._blockDebuffNext = 0; }
  else { G._blockMult = 1; }
  if (G.turn === 1) VFX.spawnInkParticles();
  VFX.turnCircle();
  drawCards(dc);
  guaranteePunctuation();
  guaranteeVerb();
  renderCombat();
  requestAnimationFrame(() => {
    document.querySelectorAll('#hand-cards .card').forEach((c, i) => {
      c.style.animationDelay = (i * 0.08) + 's';
      c.classList.add('card-deal-anim');
    });
  });
}

export function drawCards(count) {
  for (let i=0; i<count; i++) {
    if (G.drawPile.length === 0) {
      if (G.discardPile.length === 0) return;
      G.drawPile = shuffleArray([...G.discardPile]);
      G.discardPile = [];
    }
    if (G.drawPile.length > 0) G.hand.push(G.drawPile.pop());
  }
}

function guaranteePunctuation() {
  const hasPunct = G.hand.some(c => c.pos === 'punctuation');
  if (hasPunct) return;
  const punctKeys = ['comma', 'period', 'exclamation_punct', 'question'];
  const key = punctKeys[Math.floor(Math.random() * punctKeys.length)];
  const punctCard = makeCard({ ...WORD_DEFS[key], key });
  const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'exclamation');
  if (replaceIdx >= 0) {
    G.discardPile.push(G.hand[replaceIdx]);
    G.hand[replaceIdx] = punctCard;
  } else {
    G.hand.push(punctCard);
  }
}

function guaranteeVerb() {
  const hasVerb = G.hand.some(c => c.pos === 'verb');
  if (hasVerb) return;
  // Try to find a verb in drawPile first, then discardPile
  let verbIdx = G.drawPile.findIndex(c => c.pos === 'verb');
  let source = G.drawPile;
  if (verbIdx < 0) {
    verbIdx = G.discardPile.findIndex(c => c.pos === 'verb');
    source = G.discardPile;
  }
  if (verbIdx < 0) return; // no verb available anywhere
  const verbCard = source.splice(verbIdx, 1)[0];
  // Replace a non-essential card in hand (not subject, not punctuation, not exclamation)
  const replaceIdx = G.hand.findIndex(c => c.pos !== 'subject' && c.pos !== 'punctuation' && c.pos !== 'exclamation');
  if (replaceIdx >= 0) {
    G.discardPile.push(G.hand[replaceIdx]);
    G.hand[replaceIdx] = verbCard;
  } else {
    G.hand.push(verbCard);
  }
}

export function getEffectiveCost(card) {
  if (card._isEnemyTarget || card._isSelfTarget) return 0;
  if (card._isFixedWo) return 0;
  if (G.allCardsCostZero) return 0;
  return card.cost;
}

export function getSentenceCost() {
  return G.sentence.reduce((sum, c) => sum + getEffectiveCost(c), 0);
}

// ============================================================
// SENTENCE BUILDING
// ============================================================
export function addToSentence(handIndex) {
  const card = G.hand[handIndex];
  if (G.sentence.includes(card)) return;

  if (card.pos === 'punctuation' && card.punctType === 'comma') {
    if (G.sentence.some(c => c.pos === 'punctuation' && c.punctType === 'comma')) return;
  }

  G.sentence.push(card);
  playSFX('card');
  renderCombat();
  requestAnimationFrame(() => {
    const words = document.querySelectorAll('#sentence-slots-container .sentence-word');
    if (words.length > 0) words[words.length - 1].classList.add('sentence-word-enter');
    const hasVerb = G.sentence.some(c => c.pos === 'verb');
    const hasTarget = G.sentence.some(c => c._isEnemyTarget || c._isSelfTarget);
    document.getElementById('sentence-area').classList.toggle('sentence-complete', hasVerb && hasTarget);
  });
}

export function removeSentenceWord(idx) {
  if (idx >= 0 && idx < G.sentence.length) {
    G.sentence.splice(idx, 1);
  }
  renderCombat();
}

export function updateChantButton() {
  const btn = document.getElementById('chant-btn');
  const cost = getSentenceCost();
  const hasVerb = G.sentence.some(c => c.pos === 'verb' || c.pos === 'special');
  const isSummon = detectSummon(G.sentence) !== null;
  const hasExcl = G.sentence.some(c => c.pos === 'exclamation');
  const hasSubject = G.sentence.some(c => c.pos === 'subject' || c._isFixedWo);
  const isDeclaration = hasSubject && hasExcl;
  const canChant = hasVerb || isSummon || isDeclaration;
  btn.disabled = G.sentence.length === 0 || cost > G.energy || !canChant;
  btn.style.opacity = btn.disabled ? '0.35' : '1';
  const label = isSummon ? '召唤' : isDeclaration && !hasVerb ? '宣言' : '吟诵';
  btn.textContent = G.sentence.length > 0 ? `${label} (${cost}文力)` : '吟诵';
}

// ============================================================
// CHANT
// ============================================================
export function chantSentence() {
  if (G.sentence.length === 0) return;
  const cost = getSentenceCost();
  if (cost > G.energy) return;

  const summon = detectSummon(G.sentence);
  const hasVerb = G.sentence.some(c => c.pos === 'verb' || c.pos === 'special');
  const hasExcl = G.sentence.some(c => c.pos === 'exclamation');
  const hasSubject = G.sentence.some(c => c.pos === 'subject' || c._isFixedWo);
  if (!hasVerb && !summon && !(hasSubject && hasExcl)) return;

  G.energy -= cost;
  G.sentencesChanted++;
  const journalText = G.sentence.map(c => c._isEnemyTarget ? c.word : (c._isSelfTarget ? '我' : c.word)).join('');
  G.sentenceJournal.push(journalText);
  playSFX('chant');
  VFX.inkRipple();

  const sentenceCards = [...G.sentence];
  G.sentence = [];
  sentenceCards.forEach(card => {
    if (card._isEnemyTarget || card._isSelfTarget) return;
    if (card._isFixedWo) return;
    const idx = G.hand.indexOf(card);
    if (idx >= 0) G.hand.splice(idx, 1);
    if (card.exhaust || (card.pos === 'verb' && card._shouldExhaust)) {
      G.exhaustPile.push(card);
    } else {
      G.discardPile.push(card);
    }
  });

  if (summon) {
    const effect = SUMMON_EFFECTS[summon.summonName];
    const sentText = '「' + summon.text + '」';

    const overlay = document.getElementById('score-overlay');
    const sentEl = document.getElementById('score-sentence');
    const detailEl = document.getElementById('score-details');
    sentEl.textContent = sentText;
    detailEl.innerHTML = `
      <div class="score-line" style="animation-delay:0ms;color:var(--neon-cyan);font-size:1.2rem;">
        ${effect.emoji} 召唤·${effect.name}！
      </div>
      <div class="score-line" style="animation-delay:200ms;color:var(--paper-dark);">
        ${effect.desc}
      </div>
    `;
    overlay.classList.add('active');
    VFX.excFlash('#00ffcc');
    VFX.shake('sm');

    setTimeout(() => {
      overlay.classList.remove('active');
      effect.apply();
      checkEnemies();
      renderCombat();
    }, 1200);
  } else {
    const result = evaluateSentence(sentenceCards);
    showScoreAnimation(result, () => {
      applyEffects(result.effects);
      checkEnemies();
      renderCombat();
    });
  }
}

// ============================================================
// APPLY EFFECTS
// ============================================================
export function applyEffects(effects) {
  if (effects.zeroCost) {
    G.allCardsCostZero = true;
    showFloatingText(document.querySelector('#combat-top'), '所有词牌费用为0！', '#B8862B');
  }

  if (effects._spendGold) {
    G.gold -= effects._spendGold;
    if (G.gold < 0) G.gold = 0;
    showFloatingText(document.querySelector('#combat-top'), `-${effects._spendGold}金`, '#B8862B');
  }

  if (effects._discardRandom && G.hand.length > 0) {
    for (let i = 0; i < effects._discardRandom && G.hand.length > 0; i++) {
      const ridx = Math.floor(Math.random() * G.hand.length);
      G.discardPile.push(G.hand.splice(ridx, 1)[0]);
    }
    showFloatingText(document.querySelector('#combat-top'), '删牌！', '#B87333');
  }

  if (effects.selfHarm) {
    playSFX('selfharm');
    const dmg = effects.selfHarmDmg;
    G.hp -= dmg;
    if (G.hp < 1) G.hp = 1;
    showFloatingText(document.querySelector('#combat-top'), `-${dmg}自伤`, '#6B4C6E');
    if (effects.selfHarmBuff) {
      G.strength += effects.selfHarmBuff;
      showFloatingText(document.querySelector('#combat-top'), `+${effects.selfHarmBuff}力量`, '#4A7C6B');
    }
    document.getElementById('game').classList.add('self-harm-flash');
    setTimeout(() => document.getElementById('game').classList.remove('self-harm-flash'), 600);
  }

  if (effects.block > 0) {
    G.block += effects.block;
    playSFX('block');
    VFX.damageNum(document.getElementById('player-status-bar'), `+${effects.block}🛡`, '#2D4B73', 2.2);
  }

  if (effects.heal > 0) {
    G.hp = Math.min(G.maxHp, G.hp + effects.heal);
    playSFX('heal');
    VFX.damageNum(document.getElementById('player-status-bar'), `+${effects.heal}♥`, '#4A7C6B', 2.2);
    VFX.rollHp(document.getElementById('combat-hp'));
  }

  if (effects.strengthGain > 0) {
    G.strength += effects.strengthGain;
    showFloatingText(document.querySelector('#combat-top'), `+${effects.strengthGain}力量`, '#4A7C6B');
  }

  if (effects.draw > 0) drawCards(effects.draw);

  if (effects.goldGain > 0) {
    G.gold += effects.goldGain;
    showFloatingText(document.querySelector('#combat-top'), `+${effects.goldGain}金`, '#B8862B');
  }

  if (effects.drawLessNext > 0) G.drawLessNextTurn += effects.drawLessNext;

  if (effects.thorns > 0) G._thorns = (G._thorns || 0) + effects.thorns;

  if (effects._kickback) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0 && Math.random() < 0.5) {
      G.enemies[tIdx].stunned = true;
      showFloatingText(G.enemies[tIdx].element, '击退！', '#B87333');
    }
  }

  if (effects._reduceEnemyBlock) {
    G.enemies.forEach(e => { if (e.hp > 0) { e.block = Math.max(0, e.block - effects._reduceEnemyBlock); } });
  }

  if (effects._taunt) {
    G.enemies.forEach(e => { if (e.hp > 0) e._mustAttackPlayer = true; });
    showFloatingText(document.querySelector('#combat-top'), '嘲讽！', '#B87333');
  }

  if (effects._confuse) {
    const alive = G.enemies.filter(e => e.hp > 0);
    if (alive.length > 1) {
      const target = alive[Math.floor(Math.random() * alive.length)];
      const dmg = target.nextIntent && target.nextIntent.value ? target.nextIntent.value : 5;
      target.hp -= dmg; if (target.hp < 0) target.hp = 0;
      showFloatingText(target.element, `自伤${dmg}！`, '#B87333');
    } else if (alive.length === 1) {
      const e = alive[0]; const dmg = 5;
      e.hp -= dmg; if (e.hp < 0) e.hp = 0;
      showFloatingText(e.element, `自伤${dmg}！`, '#B87333');
    }
  }

  if (effects._vulnSelfNext) {
    G.vulnerable = Math.max(G.vulnerable, 1);
    showFloatingText(document.querySelector('#combat-top'), '下回合易伤！', '#d47070');
  }

  if (effects._bonusEnergy > 0) {
    G._bonusEnergyNext = (G._bonusEnergyNext || 0) + effects._bonusEnergy;
    showFloatingText(document.querySelector('#combat-top'), `下回合+${effects._bonusEnergy}能量`, '#B8862B');
  }

  if (effects.applyVuln > 0) {
    G.enemies.forEach(e => {
      if (e.hp > 0) {
        e.vulnerable = (e.vulnerable || 0) + effects.applyVuln;
        if (e.element) showFloatingText(e.element, `易伤${effects.applyVuln}`, '#C54B3C');
      }
    });
  }

  if (effects._stunEnemy) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
      G.enemies[tIdx].stunned = true;
      if (effects._stunEnemy2) G.enemies[tIdx]._stunNext = true;
      showFloatingText(G.enemies[tIdx].element, effects._stunEnemy2 ? '💤 沉睡2回合' : '眩晕！跳过', '#B87333');
    }
  }

  if (effects._reduceStrength) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
      G.enemies[tIdx].strength = Math.max(0, (G.enemies[tIdx].strength || 0) - effects._reduceStrength);
      showFloatingText(G.enemies[tIdx].element, `-${effects._reduceStrength}力量`, '#C54B3C');
    }
  }

  if (effects._skipNextTurn) {
    G._skipNextPlayerTurn = true;
  }

  if (effects._removeBuffs) {
    G.enemies.forEach(e => { if (e.hp > 0) { e.strength = 0; e.block = 0; } });
    showFloatingText(document.querySelector('#enemy-area'), '增益清除！', '#7090d4');
  }

  if (effects.applyWeak > 0) {
    if (effects.aoe) {
      G.enemies.forEach(e => { if (e.hp > 0) { e.weak = (e.weak||0) + effects.applyWeak; } });
      showFloatingText(document.querySelector('#enemy-area'), `全体削弱${effects.applyWeak}`, '#B87333');
    } else if (effects.targetEnemyIdx >= 0) {
      const tgt = G.enemies[effects.targetEnemyIdx];
      if (tgt && tgt.hp > 0) { tgt.weak = (tgt.weak||0) + effects.applyWeak; showFloatingText(tgt.element, `弱${effects.applyWeak}`, '#B87333'); }
    } else {
      const tIdx = G.enemies.findIndex(e => e.hp > 0);
      if (tIdx >= 0) { G.enemies[tIdx].weak = (G.enemies[tIdx].weak||0) + effects.applyWeak; showFloatingText(G.enemies[tIdx].element, `弱${effects.applyWeak}`, '#B87333'); }
    }
  }

  if (effects._execute) {
    const ex = effects._execute;
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
      const e = G.enemies[tIdx];
      const threshold = Math.floor(e.maxHp * ex.threshold);
      if (e.hp <= threshold) {
        dealDamageToEnemy(tIdx, 9999, true);
        showFloatingText(e.element, '💀 斩杀！', '#C54B3C');
        playSFX('hit_crit');
        VFX.brushStrike();
      } else {
        const execDmg = Math.floor(e.maxHp * ex.percent);
        dealDamageToEnemy(tIdx, execDmg, true);
        showFloatingText(e.element, `${Math.round(ex.percent*100)}%斩`, '#C54B3C');
      }
    }
  }

  if (effects.damage > 0) {
    if (effects.aoe) {
      G.enemies.forEach((e, idx) => { if (e.hp > 0) dealDamageToEnemy(idx, effects.damage, effects.ignoreBlock); });
    } else if (effects.multiTargetIndices && effects.multiTargetIndices.length > 1) {
      effects.multiTargetIndices.forEach(tIdx => {
        if (G.enemies[tIdx] && G.enemies[tIdx].hp > 0) dealDamageToEnemy(tIdx, effects.damage, effects.ignoreBlock);
      });
    } else if (effects.targetEnemyIdx >= 0) {
      const tIdx = effects.targetEnemyIdx;
      if (G.enemies[tIdx] && G.enemies[tIdx].hp > 0) dealDamageToEnemy(tIdx, effects.damage, effects.ignoreBlock);
      else {
        const fallback = G.enemies.findIndex(e => e.hp > 0);
        if (fallback >= 0) dealDamageToEnemy(fallback, effects.damage, effects.ignoreBlock);
      }
    } else {
      const targetIdx = G.enemies.findIndex(e => e.hp > 0);
      if (targetIdx >= 0) dealDamageToEnemy(targetIdx, effects.damage, effects.ignoreBlock);
    }
  }

  if (effects._partialPenetrate && effects.damage > 0) {
    const bonusDmg = Math.floor(effects.damage * effects._partialPenetrate);
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) dealDamageToEnemy(tIdx, bonusDmg, true);
  }

  if (effects._poison) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
      G.enemies[tIdx].poison = { dmg: effects._poison.dmg, turns: effects._poison.turns };
      showFloatingText(G.enemies[tIdx].element, `🌱中毒${effects._poison.turns}回合`, '#4A7C6B');
    }
  }

  if (effects._reflectDmg) {
    G._reflectDmg = effects._reflectDmg;
  }

  if (effects._transferDebuffs) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
      if (G.weak > 0) { G.enemies[tIdx].weak = (G.enemies[tIdx].weak||0) + G.weak; G.weak = 0; }
      if (G.vulnerable > 0) { G.enemies[tIdx].vulnerable = (G.enemies[tIdx].vulnerable||0) + G.vulnerable; G.vulnerable = 0; }
      showFloatingText(G.enemies[tIdx].element, '甩锅成功！', '#B87333');
    }
  }

  if (effects._goldOnKill) {
    const killed = G.enemies.filter(e => e.hp <= 0).length;
    if (killed > 0) {
      const bonus = killed * effects._goldOnKill;
      G.gold += bonus;
      showFloatingText(document.querySelector('#combat-top'), `躺赢+${bonus}金`, '#B8862B');
    }
  }

  if (effects._excSkipChance) {
    G.enemies.forEach(e => { if (e.hp > 0 && Math.random() < effects._excSkipChance) { e.stunned = true; } });
  }

  if (effects._drawNextTurn) {
    G._bonusDrawNext = (G._bonusDrawNext || 0) + effects._drawNextTurn;
  }

  if (effects._blockDebuffNext) {
    G._blockDebuffNext = effects._blockDebuffNext;
  }

  if (effects._confuse) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    if (tIdx >= 0 && G.enemies[tIdx] && G.enemies[tIdx].hp > 0) {
      G.enemies[tIdx].confused = true;
      showFloatingText(G.enemies[tIdx].element, '混乱！', '#6B4C6E');
    }
  }
}

// ============================================================
// SCORE ANIMATION
// ============================================================
export function showScoreAnimation(result, callback) {
  const overlay = document.getElementById('score-overlay');
  const sentEl = document.getElementById('score-sentence');
  const detailEl = document.getElementById('score-details');

  sentEl.textContent = '「' + result.text + '」';

  let html = '';
  let delay = 0;

  result.grammarNotes.forEach(n => {
    html += `<div class="score-line" style="animation-delay:${delay}ms">📜 ${n}</div>`;
    delay += 150;
  });

  result.literaryNotes.forEach(n => {
    html += `<div class="score-line" style="animation-delay:${delay}ms;color:var(--gold)">✨ ${n}</div>`;
    delay += 150;
  });

  if (result.punctNotes && result.punctNotes.length > 0) {
    result.punctNotes.forEach(n => {
      html += `<div class="score-line" style="animation-delay:${delay}ms;color:var(--purple)">✎ ${n}</div>`;
      delay += 150;
    });
  }

  if (result.excNotes && result.excNotes.length > 0) {
    const excCards = result.cards.filter(c => c.pos === 'exclamation');
    let chainDelay = delay;
    result.excNotes.forEach((n, i) => {
      html += `<div class="score-line" style="animation-delay:${delay}ms"><span class="multiplier-bounce" style="animation-delay:${delay}ms">${n}</span></div>`;
      const exc = excCards[Math.min(i, excCards.length-1)];
      const isNiubi = exc && exc.word === '牛逼';
      const isWocao = exc && exc.word === '卧槽';
      const color = isNiubi ? '#e8c84c' : isWocao ? '#B87333' : '#00ffcc';
      const mult = exc ? (exc.excMult || 1.2) : 1.2;
      VFX.excChainPop(`×${mult}`, color, chainDelay, 3 + i * 0.5);
      VFX.excFlash(color);
      if (isNiubi) setTimeout(() => VFX.shake('md'), chainDelay);
      else if (isWocao) setTimeout(() => VFX.shake('sm'), chainDelay);
      chainDelay += 350;
      delay += 250;
    });
  }

  html += `<div class="score-line" style="animation-delay:${delay}ms;color:var(--paper);font-weight:700">总倍率: ×${result.totalMult.toFixed(2)}</div>`;
  delay += 200;

  const parts = [];
  if (result.effects.selfHarm) parts.push(`💔 自伤${result.effects.selfHarmDmg}${result.effects.selfHarmBuff ? ' +'+result.effects.selfHarmBuff+'力量' : ''}`);
  if (result.effects.damage > 0) parts.push(`⚔ ${result.effects.damage}伤害${result.effects.aoe?' (群体)':''}${result.effects.ignoreBlock?' (穿透)':''}`);
  if (result.effects.isQuestion) parts.push(`❓ 削弱${result.effects.applyWeak}回合`);
  if (result.effects.block > 0) parts.push(`🛡 ${result.effects.block}格挡`);
  if (result.effects.heal > 0) parts.push(`♥ ${result.effects.heal}治疗`);
  if (result.effects.strengthGain > 0) parts.push(`↑ +${result.effects.strengthGain}力量`);
  if (result.effects.draw > 0) parts.push(`📜 抽${result.effects.draw}牌`);
  if (result.effects.goldGain > 0) parts.push(`💰 +${result.effects.goldGain}金`);

  if (parts.length > 0) {
    html += `<div class="score-effect score-line" style="animation-delay:${delay}ms">${parts.join(' | ')}</div>`;
  }

  detailEl.innerHTML = html;
  overlay.classList.add('active');

  const totalDelay = delay + 600;
  setTimeout(() => {
    overlay.classList.remove('active');
    callback();
  }, Math.min(totalDelay, 2000));
}

// ============================================================
// END TURN / ENEMY TURN
// ============================================================
export function endPlayerTurn() {
  G.sentence = [];
  while (G.hand.length > 0) G.discardPile.push(G.hand.pop());
  setTimeout(enemyTurn, 300);
}

export function enemyTurn() {
  let delay = 0;
  G.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) return;
    enemy.block = 0;
    if (enemy.vulnerable > 0) enemy.vulnerable--;
    if (enemy.weak > 0) enemy.weak--;

    if (enemy.poison && enemy.poison.turns > 0) {
      enemy.hp -= enemy.poison.dmg;
      enemy.poison.turns--;
      if (enemy.element) showFloatingText(enemy.element, `🌱-${enemy.poison.dmg}`, '#4A7C6B');
      if (enemy.poison.turns <= 0) delete enemy.poison;
      if (enemy.hp <= 0) { renderCombat(); return; }
    }

    if (enemy.confused) {
      enemy.confused = false;
      setTimeout(() => {
        if (enemy.hp <= 0) return;
        const selfDmg = Math.floor((enemy.attackDmg || 5) * 0.5);
        enemy.hp -= selfDmg;
        if (enemy.element) showFloatingText(enemy.element, `混乱自伤${selfDmg}`, '#6B4C6E');
        enemy.ai(enemy);
        renderCombat();
      }, delay);
      delay += 550;
      return;
    }

    setTimeout(() => {
      if (enemy.hp <= 0) return;
      if (enemy.stunned) {
        enemy.stunned = enemy._stunNext || false;
        enemy._stunNext = false;
        showFloatingText(enemy.element,'眩晕！','#B87333');
      }
      else {
        const hpBefore = G.hp;
        enemy.act_fn(enemy);
        if (G._reflectDmg && G._reflectDmg > 0 && G.hp < hpBefore) {
          const reflected = Math.floor((hpBefore - G.hp) * G._reflectDmg);
          if (reflected > 0) {
            enemy.hp -= reflected;
            if (enemy.element) showFloatingText(enemy.element, `反弹${reflected}`, '#B87333');
          }
        }
      }
      enemy.ai(enemy);
      renderCombat();
      if (G.hp <= 0) return;
    }, delay);
    delay += 550;
  });
  G._reflectDmg = 0;
  setTimeout(() => { if (G.hp > 0) startPlayerTurn(); }, delay + 400);
}

// ============================================================
// COMBAT VICTORY
// ============================================================
export function combatVictory() {
  playSFX('heal');
  G._thorns = 0;
  const node = G.map[G.currentRow][G.currentNodeIndex];
  let gold = 0;
  if (node.type==='fight') gold = 10+Math.floor(Math.random()*11);
  else if (node.type==='elite') { gold = 25+Math.floor(Math.random()*26); G.elitesKilled++; }
  else if (node.type==='boss') { gold = 50+Math.floor(Math.random()*51); G.bossesKilled++; }
  G.gold += gold;
  G.combatRewards = { gold };

  if (node.type === 'boss' && G.act >= 3) { setTimeout(function() { playStory('victory', showVictoryScreen); }, 500); return; }
  showRewardScreen();
}

export function showRewardScreen() {
  showScreen('reward-screen');
  playAmbientMusic();
  document.getElementById('reward-gold-text').textContent = `+${G.combatRewards.gold} 文银`;
  const container = document.getElementById('reward-cards');
  container.innerHTML = '';

  const isFirstReward = G.floorsCleared <= 1;
  for (let i = 0; i < 3; i++) {
    let card;
    if (isFirstReward && i === 0) {
      card = makeCard({ ...WORD_DEFS.hatsunemiku, key: 'hatsunemiku' });
    } else {
      const roll = Math.random();
      let rarity;
      if (roll < 0.50) rarity = 'common';
      else if (roll < 0.82) rarity = 'uncommon';
      else rarity = 'rare';
      card = randomCardWeighted(rarity);
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'reward-card-wrapper';
    const cardEl = createCardElement(card, null, { noClick: true });
    cardEl.style.cursor = 'pointer';
    cardEl.onclick = () => { G.deck.push(card); afterReward(); };
    const rl = document.createElement('div');
    rl.className = `rarity-label rarity-${card.rarity}`;
    rl.textContent = card.rarity === 'common' ? '普通' : card.rarity === 'uncommon' ? '非凡' : '稀有';
    wrapper.appendChild(cardEl);
    wrapper.appendChild(rl);
    container.appendChild(wrapper);
  }
}

export function skipReward() { afterReward(); }

export function afterReward() {
  const node = G.map[G.currentRow][G.currentNodeIndex];
  if (node.type === 'boss') {
    G.act++; G.currentRow = -1; G.currentNodeIndex = -1;
    G.map = generateMap(G.act); G.strength = 0;
    const actIntroKey = 'act' + G.act + '_intro';
    if (STORY_CHAPTERS[actIntroKey]) {
      playStory(actIntroKey, function() {
        showScreen('map-screen'); renderMap();
      });
      return;
    }
  }
  showScreen('map-screen'); renderMap();
}
