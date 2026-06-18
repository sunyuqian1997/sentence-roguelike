import { G, META, saveMeta } from './state.js';
import { t } from '../i18n.js';
import { showFloatingText, shuffleArray } from '../utils.js';
import { playSFX, initAudio, playAmbientMusic, playCombatMusic, playBossMusic, stopMusic } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { WORD_DEFS, makeCard, createStarterDeck, randomCard, randomCardWeighted } from '../data/cards.js';
import { showScreen, renderCombat, createCardElement } from '../ui/render.js';
import { playChantPuppetAnim, playEnemyPuppetAnim, IMPACT_MS, playBestVerseReplay, stopBestVerseReplay } from '../ui/puppets.js';
import { generateCharSVG } from '../ui/svgArt.js';
import { dealDamageToPlayer, dealDamageToEnemy, checkEnemies } from './damage.js';
import { generateMap, renderMap } from './map.js';
import { CARD_PACKS } from '../data/packs.js';
import { playStory, STORY_CHAPTERS_REF } from '../ui/storyOverlay.js';
import STORY_CHAPTERS from '../data/story.json';
import { detectSummon, SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition, detectDuizhang, isWellFormed } from './sentence.js';
import { processEnemyPuns, PUN_STATUS, PUN_ON_APPLY, resolveIdentityTrait, detectPredicates } from './poetics.js';
import { EVENTS_BY_ACT, EVENTS_FALLBACK } from '../data/events.js';
import { closeMetaScreen, showVictoryScreen } from '../ui/screens.js';
import { logChant } from './chantLog.js';

// ============================================================
// GAME START
// ============================================================
export function startGame() {
  initAudio(); closeMetaScreen();
  G.hp = 50; G.maxHp = 50; G.gold = 0; G.act = 1;
  G.deck = createStarterDeck();
  G.block = 0; G.strength = 0; G.vulnerable = 0; G.weak = 0;
  G.floorsCleared = 0; G.elitesKilled = 0; G.bossesKilled = 0; G.sentencesChanted = 0;
  G.combatCount = 0;
  G.sentenceJournal = [];
  G.combatJournal = [];
  G.lastRhymeKey = null;
  G.rhymeStreak = 0;
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
  G.combatCount = (G.combatCount || 0) + 1;
  const isBoss = enemyDefs.some(e => e.type === 'boss');
  // 同一 act 内越深越强:用本 act 已深入层数(currentRow)做缩放。boss 数值手调,不缩放。
  const depth = Math.max(0, (G.currentRow || 0) - 1);
  G.enemies = enemyDefs.map(def => {
    const scale = def.type === 'boss' ? 1 : 1 + depth * 0.08;   // 每层 +8% HP
    const hp = Math.round(def.hp * scale);
    return {
      ...def, hp, maxHp: hp, block:0, strength:0, vulnerable:0, weak:0,
      _dmgBonus: def.type === 'boss' ? 0 : Math.floor(depth / 2), // 每深2层 +1 固定伤害
      stunned:false, reflecting:false, nextIntent:null, element:null, tc:0,
    };
  });
  G.drawPile = shuffleArray([...G.deck]);
  G.discardPile = []; G.exhaustPile = []; G.hand = [];
  G.energy = G.maxEnergy; G.block = 0;
  G.sentence = []; G.enemyTargets = [];
  G.allCardsCostZero = false; G.poeticAura = false; G.poeticAuraNext = false;
  G.turn = 0; G.vulnerable = 0; G.weak = 0;
  G.drawLessNextTurn = 0;
  G.lastRhymeKey = null;
  G.rhymeStreak = 0;
  G.combatJournal = [];
  G._bestLine = null;   // 本场最高倍率句，结算页动态重放用

  showScreen('combat-screen');
  // Player portrait is now an <img> in HTML, no need to generate SVG
  if (isBoss) playBossMusic(); else playCombatMusic();
  G.enemies.forEach(e => e.ai(e));
  startPlayerTurn();
}

export function startPlayerTurn() {
  if (G._skipNextPlayerTurn) {
    G._skipNextPlayerTurn = false;
    G.turn++;
    // 护甲/易伤/虚弱的衰减统一在 endRound() 处理,这里不再清。
    showFloatingText(document.querySelector('#combat-top'), '💤 沉睡中...跳过回合', '#6B4C6E');
    renderCombat();
    setTimeout(enemyTurn, 600);
    return;
  }
  G.turn++;
  G.energy = G.maxEnergy + (G._bonusEnergyNext || 0);
  G._bonusEnergyNext = 0;
  G.allCardsCostZero = false;
  G.poeticAura = G.poeticAuraNext || false;
  G.poeticAuraNext = false;
  G.sentence = [];
  // 护甲/易伤/虚弱的衰减统一在 endRound() 处理(整轮一次),不再在回合开始清。
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
  guaranteeCopula();
  guaranteeTutorialCombo();
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
  // Always guarantee a comma for duizhang (对仗) opportunities
  const hasComma = G.hand.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  if (!hasComma) {
    const commaCard = makeCard({ ...WORD_DEFS.comma, key: 'comma' });
    const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'exclamation');
    if (replaceIdx >= 0) {
      G.discardPile.push(G.hand[replaceIdx]);
      G.hand[replaceIdx] = commaCard;
    } else {
      G.hand.push(commaCard);
    }
  }
  // Also add another punctuation if none besides the comma
  const hasOtherPunct = G.hand.some(c => c.pos === 'punctuation' && c.punctType !== 'comma');
  if (!hasOtherPunct && Math.random() < 0.4) {
    const punctKeys = ['period', 'exclamation_punct', 'question'];
    const key = punctKeys[Math.floor(Math.random() * punctKeys.length)];
    const punctCard = makeCard({ ...WORD_DEFS[key], key });
    const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'exclamation' && c.pos !== 'punctuation');
    if (replaceIdx >= 0) {
      G.discardPile.push(G.hand[replaceIdx]);
      G.hand[replaceIdx] = punctCard;
    }
  }
}

function guaranteeCopula() {
  // Only relevant if the deck has any copula card.
  const deckHasCopula = [...G.drawPile, ...G.discardPile, ...G.hand].some(c => c.copulaConn);
  if (!deckHasCopula) return;
  // Already in hand? done.
  if (G.hand.some(c => c.copulaConn)) return;
  // Try to find a copula in drawPile, then discardPile
  let idx = G.drawPile.findIndex(c => c.copulaConn);
  let source = G.drawPile;
  if (idx < 0) {
    idx = G.discardPile.findIndex(c => c.copulaConn);
    source = G.discardPile;
  }
  if (idx < 0) return;
  const copCard = source.splice(idx, 1)[0];
  // Replace a non-essential card so we don't kick verbs/subjects out
  const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'punctuation' && !c.copulaConn);
  if (replaceIdx >= 0) {
    G.discardPile.push(G.hand[replaceIdx]);
    G.hand[replaceIdx] = copCard;
  } else {
    G.hand.push(copCard);
  }
}

function guaranteeVerb() {
  // Guarantee at least 2 verbs for duizhang opportunities
  const verbCount = G.hand.filter(c => c.pos === 'verb').length;
  const needed = Math.max(0, 2 - verbCount);
  for (let i = 0; i < needed; i++) {
    // Try to find a verb in drawPile first, then discardPile
    let verbIdx = G.drawPile.findIndex(c => c.pos === 'verb');
    let source = G.drawPile;
    if (verbIdx < 0) {
      verbIdx = G.discardPile.findIndex(c => c.pos === 'verb');
      source = G.discardPile;
    }
    if (verbIdx < 0) break; // no verb available anywhere
    const verbCard = source.splice(verbIdx, 1)[0];
    const replaceIdx = G.hand.findIndex(c => c.pos !== 'subject' && c.pos !== 'punctuation' && c.pos !== 'exclamation' && c.pos !== 'verb');
    if (replaceIdx >= 0) {
      G.discardPile.push(G.hand[replaceIdx]);
      G.hand[replaceIdx] = verbCard;
    } else {
      G.hand.push(verbCard);
    }
  }
}

// 开局教学组合: 第一场战斗的前两个回合, 保证手里有「是 / 给 / 猫」三张牌,
// 让玩家一定能拼出「X 是 猫」「X 是 给」这类谐音梗判断句。
function guaranteeTutorialCombo() {
  if (G.combatCount !== 1 || G.turn > 2) return;
  const wanted = ['shi_copula', 'gei', 'mao'];
  for (const key of wanted) {
    const def = WORD_DEFS[key];
    if (!def) continue;
    if (G.hand.some(c => c.key === key)) continue; // 已在手
    // 优先从抽牌堆/弃牌堆里取已有的那张, 取不到就新造一张。
    let idx = G.drawPile.findIndex(c => c.key === key);
    let card;
    if (idx >= 0) card = G.drawPile.splice(idx, 1)[0];
    else {
      idx = G.discardPile.findIndex(c => c.key === key);
      if (idx >= 0) card = G.discardPile.splice(idx, 1)[0];
      else card = makeCard({ ...def, key });
    }
    // 替换一张非核心牌, 不踢掉动词/系词/标点/已凑齐的教学牌。
    const replaceIdx = G.hand.findIndex(c =>
      c.pos !== 'verb' && c.pos !== 'punctuation' && !c.copulaConn && !wanted.includes(c.key));
    if (replaceIdx >= 0) {
      G.discardPile.push(G.hand[replaceIdx]);
      G.hand[replaceIdx] = card;
    } else {
      G.hand.push(card);
    }
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

// Forbidden guard: a clause "敌人 是 我" (僭越/usurpation) is illegal — the
// enemy can't *be* you. Reject the card that would complete it, with feedback,
// instead of letting the player chant a dud. Returns true if `candidate` added
// to the current sentence would create such a clause.
function wouldBeForbidden(candidate) {
  const preds = detectPredicates([...G.sentence, candidate]);
  return preds.some(p => p.kind === 'forbidden');
}

function rejectForbidden() {
  playSFX('selfharm');
  const host = G.enemies.find(e => e.hp > 0);
  if (host && host.element) {
    showFloatingText(host.element, '❌ 僭越！', '#C54B3C');
    host.element.classList.remove('puppet-impact');
    void host.element.offsetWidth;
    host.element.classList.add('puppet-impact');
  } else {
    showFloatingText(document.querySelector('#combat-top'), '❌ 僭越：敌不能「是我」', '#C54B3C');
  }
}

// Shared insertion guard used by all entry points (hand card / 我 / enemy).
export function tryAddCard(card) {
  if (wouldBeForbidden(card)) { rejectForbidden(); return false; }
  G.sentence.push(card);
  return true;
}

export function addToSentence(handIndex) {
  const card = G.hand[handIndex];
  if (G.sentence.includes(card)) return;

  if (card.pos === 'punctuation' && card.punctType === 'comma') {
    if (G.sentence.some(c => c.pos === 'punctuation' && c.punctType === 'comma')) return;
  }
  if (wouldBeForbidden(card)) { rejectForbidden(); return; }

  // FLIP: capture origin card rect before mutation
  const handEls = document.querySelectorAll('#hand-cards .card');
  const sourceEl = handEls[handIndex];
  const sourceRect = sourceEl ? sourceEl.getBoundingClientRect() : null;
  const sourceClone = sourceEl ? sourceEl.cloneNode(true) : null;

  G.sentence.push(card);
  playSFX('card');
  renderCombat();
  requestAnimationFrame(() => {
    const hasVerb = G.sentence.some(c => c.pos === 'verb');
    const hasTarget = G.sentence.some(c => c._isEnemyTarget || c._isSelfTarget);
    document.getElementById('sentence-area').classList.toggle('sentence-complete', hasVerb && hasTarget);

    // FLIP: animate clone from source to destination
    if (sourceRect && sourceClone) {
      const newSlots = document.querySelectorAll('#sentence-slots-container .sentence-card-wrap');
      const targetWrap = newSlots[newSlots.length - 1];
      if (!targetWrap) return;
      const targetCard = targetWrap.querySelector('.sentence-mini-card') || targetWrap;
      const targetRect = targetCard.getBoundingClientRect();

      // Hide the real destination momentarily
      targetWrap.style.opacity = '0';

      sourceClone.style.position = 'fixed';
      sourceClone.style.left = sourceRect.left + 'px';
      sourceClone.style.top = sourceRect.top + 'px';
      sourceClone.style.width = sourceRect.width + 'px';
      sourceClone.style.height = sourceRect.height + 'px';
      sourceClone.style.margin = '0';
      sourceClone.style.zIndex = '9000';
      sourceClone.style.pointerEvents = 'none';
      sourceClone.style.transition = 'all 0.28s cubic-bezier(0.4, 0, 0.2, 1)';
      sourceClone.classList.add('card-flying');
      document.body.appendChild(sourceClone);

      requestAnimationFrame(() => {
        sourceClone.style.left = targetRect.left + 'px';
        sourceClone.style.top = targetRect.top + 'px';
        sourceClone.style.width = targetRect.width + 'px';
        sourceClone.style.height = targetRect.height + 'px';
        sourceClone.style.opacity = '0.85';
      });
      setTimeout(() => {
        sourceClone.remove();
        targetWrap.style.opacity = '';
      }, 300);
    }
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
  const label = isSummon ? t('summon') : isDeclaration && !hasVerb ? t('declare') : t('chant');
  btn.textContent = G.sentence.length > 0 ? `${label} (${cost} ${t('energy')})` : t('chant');
}

// ============================================================
// CHANT
// ============================================================
export function chantSentence() {
  if (G.sentence.length === 0) return;
  const cost = getSentenceCost();
  if (cost > G.energy) return;

  // 召唤式不是普通句子，走自己的识别路径，不受成句性门槛约束。
  const summon = detectSummon(G.sentence);
  if (!summon) {
    // 成句性硬门槛：拒绝不成句的废串（纯名词/纯修饰/纯连词/悬空连词等），
    // 给出可读原因。语序/省略/倒装等仍交给下游倍率层软性评分，不在此拦截。
    const wf = isWellFormed(G.sentence);
    if (!wf.ok) {
      showFloatingText(document.querySelector('#combat-top'), `✗ 不成句：${wf.reason}`, '#C54B3C');
      playSFX('forbidden');
      return;
    }
  }

  G.energy -= cost;
  G.sentencesChanted++;
  const journalText = G.sentence.map(c => c._isEnemyTarget ? c.word : (c._isSelfTarget ? '我' : c.word)).join('');
  G.sentenceJournal.push(journalText);
  if (!G.combatJournal) G.combatJournal = [];
  G.combatJournal.push(journalText);
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
    logChant({ summon });
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
    playChantPuppetAnim({ damage: 1 }); // summon = dramatic dash + strike

    setTimeout(() => {
      overlay.classList.remove('active');
      effect.apply();
      checkEnemies();
      renderCombat();
    }, 1200);
  } else {
    const result = evaluateSentence(sentenceCards);
    logChant({ result });
    // Track the highest-multiplier line of this combat so the reward screen can
    // replay it as a dynamic "best verse" highlight.
    if (result && (!G._bestLine || result.totalMult > G._bestLine.mult)) {
      G._bestLine = {
        text: journalText,
        mult: result.totalMult,
        cards: sentenceCards.map(c => ({ ...c })),
        effects: { ...result.effects },
      };
    }
    // Update rhyme tracking BEFORE applying effects so the next sentence sees it.
    if (result && result.effects && result.effects._rhymeInfo) {
      const r = result.effects._rhymeInfo;
      if (r.rhymes) G.rhymeStreak = r.streak;
      else G.rhymeStreak = 0;
      if (r.key) G.lastRhymeKey = r.key;
    }
    playChantPuppetAnim(result.effects);
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

  // 破防了: strip the targeted enemy's block entirely (扒光格挡), even without a
  // full predicate verb ("仓颉之影破防了").
  if (effects._stripTargetBlock) {
    const tIdx = effects.targetEnemyIdx >= 0 ? effects.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
    const tgt = tIdx >= 0 ? G.enemies[tIdx] : null;
    if (tgt && tgt.hp > 0 && tgt.block > 0) {
      tgt.block = 0;
      if (tgt.element) showFloatingText(tgt.element, '🛡️💥 破防！', '#C54B3C');
    }
  }

  if (effects._taunt) {
    G.enemies.forEach(e => { if (e.hp > 0) e._mustAttackPlayer = true; });
    showFloatingText(document.querySelector('#combat-top'), '嘲讽！', '#B87333');
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

  // PREDICATES — "A 是 B" clauses: puns + identity rewrites
  if (effects._predicates && effects._predicates.length > 0) {
    // "你是X" leaves subjectEnemyIdx = -1 (poetics is state-free); resolve to the
    // first living enemy here.
    const resolveEnemy = (idx) => {
      if (idx >= 0) return G.enemies[idx];
      return G.enemies.find(e => e && e.hp > 0);
    };
    effects._predicates.forEach(p => {
      if (p.kind === 'pun') {
        const tag = p.pun.tag;
        const applyToEnemy = (e) => {
          if (!e || e.hp <= 0) return;
          if (!e._puns) e._puns = [];
          if (!e._puns.includes(tag)) e._puns.push(tag);
          if (PUN_ON_APPLY[tag]) PUN_ON_APPLY[tag](e);
          if (e.element) showFloatingText(e.element, p.pun.label, '#9B59B6');
        };
        if (p.target === 'enemy') {
          applyToEnemy(resolveEnemy(p.subjectEnemyIdx));
        } else if (p.target === 'broadcast') {
          // Generic subject ("皇帝你儿子是给") — wisecrack heard by all enemies
          G.enemies.forEach(applyToEnemy);
          showFloatingText(document.querySelector('#combat-top'), `📢 ${p.subjectWord}${p.copulaWord}${p.srcWord}：${p.pun.label}`, '#9B59B6');
        } else {
          // self ("我是给") — the wisecrack rebounds as a player buff. Each pun
          // tag maps to a positive selfEffect (PUN_STATUS[tag].selfPun).
          if (!G._puns) G._puns = [];
          if (!G._puns.includes(tag)) G._puns.push(tag);
          const sp = (PUN_STATUS[tag] || {}).selfPun;
          if (sp) {
            const se = sp.selfEffect || {};
            if (se.block) G.block += se.block;
            if (se.heal) G.hp = Math.min(G.maxHp, G.hp + se.heal);
            if (se.draw) drawCards(se.draw);
            if (se.strength) G.strength += se.strength;
            if (se.poeticAuraNext) G.poeticAuraNext = true;
            if (se.charmEnemiesNext) {
              G.enemies.forEach(e => { if (e && e.hp > 0) e.stunned = true; });
            }
            showFloatingText(document.querySelector('#combat-top'), sp.label, '#3E7CA6');
          } else {
            showFloatingText(document.querySelector('#combat-top'), `自陈：${p.pun.label}`, '#9B59B6');
          }
        }
        return;
      }

      if (p.kind === 'identity') {
        const trait = resolveIdentityTrait(p.identityWord, p.identityIsEnemyName);
        if (p.target === 'self') {
          const se = trait.selfEffect || {};
          if (se.block) G.block += se.block;
          if (se.heal) G.hp = Math.min(G.maxHp, G.hp + se.heal);
          if (se.draw) drawCards(se.draw);
          if (se.strength) G.strength += se.strength;
          if (se.vulnerable) G.vulnerable += se.vulnerable;
          if (se.poeticAuraNext) G.poeticAuraNext = true;
          showFloatingText(document.querySelector('#combat-top'), `${trait.emoji} ${trait.selfLabel}`, '#9B59B6');
        } else {
          const ee = trait.enemyEffect || {};
          const applyToEnemy = (e) => {
            if (!e || e.hp <= 0) return;
            if (ee.weak) e.weak = (e.weak || 0) + ee.weak;
            if (ee.vulnerable) e.vulnerable = (e.vulnerable || 0) + ee.vulnerable;
            if (ee.strengthDelta) e.strength = (e.strength || 0) + ee.strengthDelta;
            if (ee.stunChance && Math.random() < ee.stunChance) e.stunned = true;
            if (e.element) showFloatingText(e.element, `${trait.emoji} ${trait.enemyLabel}`, '#9B59B6');
          };
          if (p.target === 'enemy') applyToEnemy(resolveEnemy(p.subjectEnemyIdx));
          else G.enemies.forEach(applyToEnemy);
        }
        return;
      }

      if (p.kind === 'forbidden') {
        showFloatingText(document.querySelector('#combat-top'), `✗ 僭越！${p.subjectWord}不能${p.copulaWord}我`, '#C54B3C');
        return;
      }

      if (p.kind === 'tautology') {
        showFloatingText(document.querySelector('#combat-top'), '🪞 我是我', '#9B59B6');
      }
    });
  }

  // MOTIF DEBUFFS — apply per-enemy thematic effects (纸鬼沉海 etc.)
  if (effects._motifTriggers && effects._motifTriggers.length > 0) {
    effects._motifTriggers.forEach(t => {
      const eff = t.motif.effect || {};
      t.enemyIdx.forEach(idx => {
        const e = G.enemies[idx];
        if (!e || e.hp <= 0) return;
        if (eff.vuln) {
          e.vulnerable = (e.vulnerable || 0) + eff.vuln;
          if (e.element) showFloatingText(e.element, `${t.motif.label} 易伤+${eff.vuln}`, '#6B4C6E');
        }
        if (eff.weak) {
          e.weak = (e.weak || 0) + eff.weak;
          if (e.element) showFloatingText(e.element, `弱+${eff.weak}`, '#B87333');
        }
        if (eff.stripBlock && e.block > 0) {
          const stripped = e.block; e.block = 0;
          if (e.element) showFloatingText(e.element, `挡-${stripped}`, '#3A7B8C');
        }
        if (eff.reduceStrength && e.strength) {
          e.strength = Math.max(0, e.strength - eff.reduceStrength);
          if (e.element) showFloatingText(e.element, `力-${eff.reduceStrength}`, '#C54B3C');
        }
        if (eff.burn) {
          e.poison = { dmg: 3, turns: eff.burn };
          if (e.element) showFloatingText(e.element, `🔥${eff.burn}回合`, '#C54B3C');
        }
        if (eff.soak) {
          e._soaked = (e._soaked || 0) + 1;
          if (e.element) showFloatingText(e.element, `💧 浸湿`, '#3A7B8C');
        }
        if (eff.stunChance && Math.random() < eff.stunChance) {
          e.stunned = true;
          if (e.element) showFloatingText(e.element, `😄 笑停了`, '#B87333');
        }
      });
    });
  }

  // 怕某字的敌人:句中出现其 fearWord → 给该敌 weak(仿 motif 落地)。
  if (effects._fearTriggers) {
    effects._fearTriggers.forEach(f => {
      const e = G.enemies[f.enemyIdx];
      if (!e || e.hp <= 0) return;
      e.weak = (e.weak || 0) + f.weak;
      if (e.element) showFloatingText(e.element, `😱 怕「${f.word}」弱+${f.weak}`, '#B87333');
    });
  }

  // 诗意暴击 banner(伤害翻倍由 finalize 的 _crit 已处理,这里只播报)。
  if (effects._poeticCrit) {
    showFloatingText(document.querySelector('#combat-top'), '⚡ 诗成泣鬼神！', '#c9a84c');
  }

  // POETIC ATTACK FEEDBACK - 高诗意攻击回血
  if (effects.damage > 0 && effects._poetryLevel) {
    if (effects._poetryLevel >= 2.0) {
      const poetHeal = Math.floor(effects.damage * 0.15);
      if (poetHeal > 0) {
        G.hp = Math.min(G.maxHp, G.hp + poetHeal);
        showFloatingText(document.querySelector('#combat-top'), `✨ 诗意回响 +${poetHeal}♥`, '#c9a84c');
      }
    }
  }

  // CO-ACTORS — named subjects (猫/影子/初音未来…) act as their own entities:
  // attack the enemy, OR block/heal FOR 我 (皇帝挡纸鬼 / 无名者守我 / 月兔治我).
  if (effects._coActors && effects._coActors.length) {
    effects._coActors.forEach((a, i) => {
      setTimeout(() => {
        if (a.damage > 0) {
          const tIdx = a.targetEnemyIdx >= 0 ? a.targetEnemyIdx : G.enemies.findIndex(e => e.hp > 0);
          if (tIdx < 0 || !G.enemies[tIdx] || G.enemies[tIdx].hp <= 0) return;
          dealDamageToEnemy(tIdx, a.damage, a.ignoreBlock);
          if (G.enemies[tIdx] && G.enemies[tIdx].element) {
            showFloatingText(G.enemies[tIdx].element, `🥷 ${a.name} ${a.damage}`, '#3E7CA6');
          }
          checkEnemies();
        } else if (a.block > 0) {
          G.block += a.block;
          showFloatingText(document.querySelector('#combat-top'), `🥷 ${a.name} 挡${a.block}`, '#3E7CA6');
        } else if (a.heal > 0) {
          G.hp = Math.min(G.maxHp, G.hp + a.heal);
          showFloatingText(document.querySelector('#combat-top'), `🥷 ${a.name} 回${a.heal}`, '#3E7CA6');
        }
        renderCombat();
      }, 220 * (i + 1));
    });
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
  // Process pun pair-effects BEFORE enemies act — eg. two gay enemies cuddle
  const fired = processEnemyPuns(G.enemies);
  fired.forEach((f, i) => {
    setTimeout(() => {
      const host = document.querySelector('#enemy-area') || document.querySelector('#combat-top');
      if (host) showFloatingText(host, f.msg, '#9B59B6');
    }, i * 350);
  });
  let delay = fired.length * 350;
  G.enemies.forEach((enemy) => {
    if (enemy.hp <= 0) return;
    // 敌方护甲在自己回合开始清旧护甲, 紧接着 act_fn 可能加新护甲, 新护甲撑过我方下回合。
    // 易伤/虚弱的衰减改由 endRound() 统一处理(整轮一次)。
    enemy.block = 0;

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
      const intentForAnim = enemy.nextIntent ? { ...enemy.nextIntent } : null;
      playEnemyPuppetAnim(intentForAnim, { stunned: enemy.stunned });
      if (enemy.stunned) {
        enemy.stunned = enemy._stunNext || false;
        enemy._stunNext = false;
        showFloatingText(enemy.element, '眩晕！', '#B87333');
        enemy.ai(enemy);
        renderCombat();
        return;
      }
      // Apply the actual effect when the puppet lands the hit, so damage
      // numbers / HP rolls pop exactly on impact.
      setTimeout(() => {
        if (enemy.hp <= 0) return;
        const hpBefore = G.hp;
        enemy.act_fn(enemy);
        if (G._reflectDmg && G._reflectDmg > 0 && G.hp < hpBefore) {
          const reflected = Math.floor((hpBefore - G.hp) * G._reflectDmg);
          if (reflected > 0) {
            enemy.hp -= reflected;
            if (enemy.element) showFloatingText(enemy.element, `反弹${reflected}`, '#B87333');
          }
        }
        enemy.ai(enemy);
        renderCombat();
      }, IMPACT_MS);
    }, delay);
    delay += 700;
  });
  G._reflectDmg = 0;
  setTimeout(() => {
    if (G.hp <= 0) return;
    endRound();
    startPlayerTurn();
  }, delay + 400);
}

// 轮结束(我方回合 + 敌方回合都走完)统一收尾:把"按轮"衰减/清零集中在此
// 发生一次,而不是散落在两处半轮边界。回合内出多少句,状态都持续到这里才复原。
//
// 注意护甲的两条不同时序:
//   - 我方护甲在我方回合产生 → 需撑过敌方回合 → 轮结束(这里)才清。
//   - 敌方护甲在敌方回合产生 → 需撑过我方下回合 → 在敌方回合开始时清旧护甲
//     (见 enemyTurn),不在这里清,否则敌人刚加的护甲会被立刻抹掉。
export function endRound() {
  // 我方护甲撑到整轮结束才清。
  G.block = 0;
  // 双方易伤/虚弱整轮只减一次(旧代码在两个半轮边界各减一次,导致一轮减两次)。
  if (G.vulnerable > 0) G.vulnerable--;
  if (G.weak > 0) G.weak--;
  G.enemies.forEach(enemy => {
    if (!enemy || enemy.hp <= 0) return;
    if (enemy.vulnerable > 0) enemy.vulnerable--;
    if (enemy.weak > 0) enemy.weak--;
  });
}

// ============================================================
// COMBAT VICTORY
// ============================================================
export function combatVictory() {
  playSFX('heal');
  G._thorns = 0;
  // In normal play this is the map node we entered; under ?autocombat there's no
  // node, so fall back to a plain fight reward instead of crashing.
  const row = G.map && G.map[G.currentRow];
  const node = (row && row[G.currentNodeIndex]) || { type: 'fight' };
  let gold = 0;
  if (node.type==='fight') gold = 35+Math.floor(Math.random()*16);
  else if (node.type==='elite') { gold = 65+Math.floor(Math.random()*36); G.elitesKilled++; }
  else if (node.type==='boss') { gold = 90+Math.floor(Math.random()*61); G.bossesKilled++; }
  G.gold += gold;
  G.combatRewards = { gold };

  if (node.type === 'boss' && G.act >= 3) { setTimeout(function() { playStory('victory', showVictoryScreen); }, 500); return; }
  showRewardScreen();
}

export function showRewardScreen() {
  showScreen('reward-screen');
  playAmbientMusic();
  document.getElementById('reward-gold-text').textContent = `+${G.combatRewards.gold} 文银`;

  // 本场最帅一句：动态重放 + 倍率徽章
  const bvWrap = document.getElementById('best-verse');
  const bvStage = document.getElementById('best-verse-stage');
  const bvText = document.getElementById('best-verse-text');
  const bvMeta = document.getElementById('best-verse-meta');
  if (bvWrap && G._bestLine) {
    bvWrap.style.display = 'block';
    bvText.textContent = `「${G._bestLine.text}」`;
    bvMeta.textContent = `本场最佳 · ✨×${G._bestLine.mult.toFixed(2)}`;
    setTimeout(() => playBestVerseReplay(G._bestLine, bvStage), 250);
  } else if (bvWrap) {
    bvWrap.style.display = 'none';
  }

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

  const journalEl = document.getElementById('reward-journal');
  if (journalEl && G.sentenceJournal.length > 0) {
    let h = '<div style="margin-top:14px;padding:10px;border:1px solid var(--panel-border);border-radius:6px;background:rgba(255,255,255,0.3);">';
    h += '<div style="font-family:var(--font-brush);font-size:0.9rem;color:var(--ink);text-align:center;margin-bottom:6px;">— 本局诗篇 —</div>';
    G.sentenceJournal.forEach(s => {
      h += `<div style="font-family:var(--font-brush);font-size:0.85rem;color:var(--ink-light);text-align:center;line-height:1.8;">「${s}」</div>`;
    });
    h += '</div>';
    journalEl.innerHTML = h;
  }

  // Pack shop
  renderPackShop(container.parentElement);
}

function renderPackShop(container) {
  const old = container.querySelector('.pack-shop');
  if (old) old.remove();
  const packDiv = document.createElement('div');
  packDiv.className = 'pack-shop';
  packDiv.innerHTML = '<h3 style="color:var(--paper-dark);font-size:0.9rem;margin:14px 0 8px;">📦 购买卡包：</h3>';
  const packs = Object.entries(CARD_PACKS).filter(([id, p]) => !p.default && !META.unlockedPacks?.includes(id));
  if (packs.length === 0) {
    packDiv.innerHTML += '<div style="opacity:0.5;font-size:0.8rem;">已全部解锁！</div>';
  } else {
    packs.forEach(([id, pack]) => {
      const canAfford = G.gold >= pack.price;
      const btn = document.createElement('div');
      btn.className = 'pack-item' + (canAfford ? '' : ' pack-locked');
      btn.innerHTML = `
        <span class="pack-icon">${pack.icon}</span>
        <span class="pack-name">${pack.name}</span>
        <span class="pack-desc">${pack.desc}</span>
        <span class="pack-price">${canAfford ? '' : '🔒'} ${pack.price}⬡</span>
      `;
      if (canAfford) {
        btn.onclick = () => {
          G.gold -= pack.price;
          if (!META.unlockedPacks) META.unlockedPacks = [];
          META.unlockedPacks.push(id);
          saveMeta();
          btn.innerHTML = `<span class="pack-icon">${pack.icon}</span><span class="pack-name">${pack.name} ✓ 已解锁！</span>`;
          btn.onclick = null;
          btn.className = 'pack-item pack-bought';
          const goldEl = document.getElementById('reward-gold-text');
          if (goldEl) goldEl.textContent = `+${G.combatRewards?.gold || 0} 文银 (持有: ${G.gold}⬡)`;
        };
      }
      packDiv.appendChild(btn);
    });
  }
  container.appendChild(packDiv);
}

export function skipReward() { afterReward(); }

export function afterReward() {
  stopBestVerseReplay();   // stop the looping highlight before leaving the reward screen
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
