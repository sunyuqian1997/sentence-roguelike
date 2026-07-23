import { G, META, saveMeta } from './state.js';
import { t, isEn } from '../i18n.js';
import { showFloatingText, shuffleArray } from '../utils.js';
import { playSFX, initAudio, playAmbientMusic, playAmbientMusicDeferred, playCombatMusic, playBossMusic, stopMusic, playVictoryJingle } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { WORD_DEFS, makeCard, createStarterDeck, randomCard, draftRewardCards } from '../data/cards.js';
import { showScreen, renderCombat, createCardElement, renderChantedSentence } from '../ui/render.js';
import { clearPuppetBubbles, playChantPuppetAnim, playEnemyPuppetAnim, playEnemyVsEnemyAnim, playBestVerseReplay, stopBestVerseReplay } from '../ui/puppets.js';
import { toGameRect } from '../ui/uiScale.js';
import { generateCharSVG } from '../ui/svgArt.js';
import { dealDamageToPlayer, dealDamageToEnemy, checkEnemies, resetVictoryGuard } from './damage.js';
import { resetCreativity, recordChantCreativity } from './creativity.js';
import { generateMap, renderMap } from './map.js';
import { CARD_PACKS, packName, packDesc } from '../data/packs.js';
import { lessonRewardKeys, nextSyntaxLesson } from '../data/deckProgression.js';
import { playStory, STORY_CHAPTERS_REF } from '../ui/storyOverlay.js';
import STORY_CHAPTERS from '../data/story.json';
import { SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition, detectDuizhang } from './sentence.js';
import { processEnemyPuns, PUN_STATUS, PUN_ON_APPLY, resolveIdentityTrait, detectPredicates } from './poetics.js';
import { EVENTS_BY_ACT, EVENTS_FALLBACK } from '../data/events.js';
import { SCENES, sceneName, addSceneryWords, sceneTurnStartEffects } from './scenes.js';
import { closeMetaScreen, showVictoryScreen } from '../ui/screens.js';
import { logChant } from './chantLog.js';
import { beginTutorial } from './tutorial.js';
import { judgeSentence } from './sentenceJudge.js';
import { applyJudgeToEvaluation } from './sentenceJudgeCore.js';
import { getSentenceValidity } from './sentenceValidity.js';
import {
  beginSelectionFacts,
  recordEnemyAction,
  recordResolvedPlayerAction,
  rememberActorIdentity,
  resetCombatFacts,
  snapshotCombatVitals,
} from './combatFacts.js';
import {
  beginPlayerFeedback,
  beginJudgingFeedback,
  finishPlayerFeedback,
  queueEnemyTurnFeedback,
  beginEnemyFeedback,
  playerTurnReadyFeedback,
  REFERENCE_ENEMY_TIMING,
  restoreChantedFeedback,
  showJudgeVerdict,
} from '../ui/designFeedback.js';
import {
  clearSelectionPhaseDialogue,
  notifyResolvedPlayerAction,
  resetBattleDialogueForCombat,
  showSelectionPhaseDialogue,
  showEnemyTurnQuote,
} from '../ui/battleDialogue.js';

// ============================================================
// GAME START
// ============================================================
export function startGame(options = {}) {
  const forceTutorial = options?.forceTutorial === true;
  initAudio(); closeMetaScreen();
  G.hp = 50; G.maxHp = 50; G.gold = 0; G.act = 1;
  G.deck = createStarterDeck();
  G.block = 0; G.strength = 0; G.vulnerable = 0; G.weak = 0;
  G.floorsCleared = 0; G.elitesKilled = 0; G.bossesKilled = 0; G.sentencesChanted = 0;
  G.combatCount = 0;
  G.sentenceJournal = [];
  G.combatJournal = [];
  G._chantResolving = false;
  G.lastRhymeKey = null;
  G.rhymeStreak = 0;
  G.currentRow = -1; G.currentNodeIndex = -1;
  G.sentence = []; G.enemyTargets = [];
  G.allCardsCostZero = false; G.poeticAura = false;
  G.shopInventory = null; G.drawLessNextTurn = 0;
  G.scenesVisited = [];   // 本局到过的场景(P5,连环画 P6 的原料)
  G.actorIdentities = {};
  G.isTutorial = false;

  if (META.perks.includes('thick_paper')) { G.maxHp += 5; G.hp += 5; }
  if (META.perks.includes('ink_pot')) { G.gold += 15; }
  if (META.perks.includes('sharp_brush')) { G.strength += 1; }

  META.runs++; saveMeta();
  G.map = generateMap(1);
  playAmbientMusic();
  if (forceTutorial || !META.tutorialCompleted) {
    G.isTutorial = true;
    const tutorialEnemy = {
      name: '残句怪', nameEn: 'Fragment Fiend', hp: 5,
      act: 1, type: 'normal', emoji: '▨', portrait: '/canjuguai.png',
      tags: ['word', 'school', 'echo'], tutorial: true,
      ai(enemy) { enemy.nextIntent = { type: 'attack', value: 0, icon: '…', label: '等候' }; },
      act_fn() {},
    };
    startCombat([tutorialEnemy]);
    beginTutorial(function() {
      G.combatCount = 0;
      G.currentRow = -1;
      G.currentNodeIndex = -1;
      resetVictoryGuard();
      playAmbientMusic();
      showScreen('map-screen');
      renderMap();
    });
  } else {
    playStory('act1_intro', function() {
      showScreen('map-screen');
      renderMap();
    });
  }
}

export function replayTutorial() {
  startGame({ forceTutorial: true });
}

// ============================================================
// COMBAT
// ============================================================
export function startCombat(enemyDefs) {
  resetVictoryGuard();
  resetBattleDialogueForCombat();
  resetCombatFacts();
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
  G._chantResolving = false;
  G._bestLine = null;   // 本场最高倍率句，结算页动态重放用
  G.currentScene = null;   // 场景(P5)整场持续直到再换,新战斗回到无场景
  G.sceneryProps = [];     // 舞台景物道具(P5),整场持续,新战斗清空
  resetCreativity();    // 词穷/新意计数,整场作用域

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
  const previousRound = beginSelectionFacts(G.turn);
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
  // 场景/景物回合 buff(P5): 海边+2挡 / 酒馆+1抽 / 椅子·山 blockPerTurn。
  const sceneFx = sceneTurnStartEffects(G.currentScene, G.sceneryProps);
  if (sceneFx.block > 0) G.block += sceneFx.block;
  if (sceneFx.draw > 0) dc += sceneFx.draw;
  sceneFx.notes.forEach((n, i) => setTimeout(() =>
    showFloatingText(document.querySelector('#combat-top'), n, '#3A7B8C'), 300 + i * 300));
  if (G.turn === 1) VFX.spawnInkParticles();
  VFX.turnCircle();
  playSFX('turn_start');
  drawCards(dc);
  guaranteePunctuation();
  guaranteeVerb();
  guaranteeCopula();
  guaranteeOnboardingHand();
  renderCombat();
  playerTurnReadyFeedback(G.turn);
  requestAnimationFrame(() => {
    showSelectionPhaseDialogue(G.turn, previousRound);
    document.querySelectorAll('#hand-cards .card').forEach((c, i) => {
      c.style.animationDelay = (i * 0.08) + 's';
      c.classList.add('card-deal-anim');
    });
  });
}

function guaranteeOnboardingHand() {
  if (!G.isTutorial || G.turn !== 1 || G.hand.some(card => card.key === 'zhan')) return;
  let card = null;
  let index = G.drawPile.findIndex(candidate => candidate.key === 'zhan');
  if (index >= 0) card = G.drawPile.splice(index, 1)[0];
  if (!card) {
    index = G.discardPile.findIndex(candidate => candidate.key === 'zhan');
    if (index >= 0) card = G.discardPile.splice(index, 1)[0];
  }
  if (!card && WORD_DEFS.zhan) card = makeCard({ ...WORD_DEFS.zhan, key: 'zhan' });
  if (!card) return;
  const replaceIndex = G.hand.findIndex(candidate => candidate.pos !== 'punctuation' && candidate.pos !== 'verb');
  if (replaceIndex >= 0) {
    G.discardPile.push(G.hand[replaceIndex]);
    G.hand[replaceIndex] = card;
  } else {
    G.hand.push(card);
  }
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
  if (G.hand.some(c => c.pos === 'punctuation')) return;

  // Before the comma lesson, guarantee the starter period. Once a comma is
  // actually in the deck, prefer it so the newly learned summon/compound
  // syntax can be practiced immediately. Never conjure unowned punctuation.
  const all = [...G.drawPile, ...G.discardPile, ...G.hand];
  const preferredType = all.some(c => c.pos === 'punctuation' && c.punctType === 'comma')
    ? 'comma' : 'period';
  let source = G.drawPile;
  let idx = source.findIndex(c => c.pos === 'punctuation' && c.punctType === preferredType);
  if (idx < 0) {
    source = G.discardPile;
    idx = source.findIndex(c => c.pos === 'punctuation' && c.punctType === preferredType);
  }
  if (idx < 0) return;
  const punctCard = source.splice(idx, 1)[0];
  const replaceIdx = G.hand.findIndex(c => c.pos !== 'verb' && c.pos !== 'subject' && c.pos !== 'exclamation');
  if (replaceIdx >= 0) {
    G.discardPile.push(G.hand[replaceIdx]);
    G.hand[replaceIdx] = punctCard;
  } else G.hand.push(punctCard);
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
  // Basic decks need one reliable action. A learned comma raises this to two,
  // opening compound sentences without flooding the first combat with verbs.
  const verbCount = G.hand.filter(c => c.pos === 'verb').length;
  const hasCommaInDeck = [...G.drawPile, ...G.discardPile, ...G.hand]
    .some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  const needed = Math.max(0, (hasCommaInDeck ? 2 : 1) - verbCount);
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

// Same guards as addToSentence but inserts at a chosen position and skips the
// hand→dock FLIP (the drag ghost IS the animation). Returns success so the
// drag layer knows whether to land the ghost or bounce it home.
export function addToSentenceAt(handIndex, insertIdx) {
  const card = G.hand[handIndex];
  if (!card || G.sentence.includes(card)) return false;
  if (card.pos === 'punctuation' && card.punctType === 'comma') {
    if (G.sentence.some(c => c.pos === 'punctuation' && c.punctType === 'comma')) return false;
  }
  if (wouldBeForbidden(card)) { rejectForbidden(); return false; }
  const idx = Math.max(0, Math.min(insertIdx, G.sentence.length));
  G.sentence.splice(idx, 0, card);
  // 音效由拖拽层负责(pickup→card_land), 这里不再叠一声 'card'。
  renderCombat();
  requestAnimationFrame(syncSentenceComplete);
  return true;
}

function syncSentenceComplete() {
  const hasVerb = G.sentence.some(c => c.pos === 'verb');
  const hasTarget = G.sentence.some(c => c._isEnemyTarget || c._isSelfTarget);
  document.getElementById('sentence-area').classList.toggle('sentence-complete', hasVerb && hasTarget);
}

export function addToSentence(handIndex) {
  const card = G.hand[handIndex];
  if (G.sentence.includes(card)) return;

  if (card.pos === 'punctuation' && card.punctType === 'comma') {
    if (G.sentence.some(c => c.pos === 'punctuation' && c.punctType === 'comma')) return;
  }
  if (wouldBeForbidden(card)) { rejectForbidden(); return; }

  // FLIP: capture origin card rect before mutation
  // (设计坐标:克隆挂进 #game 缩放画布,字号/尺寸与源卡天然一致)
  const handEls = document.querySelectorAll('#hand-cards .card');
  const sourceEl = handEls[handIndex];
  const sourceRect = sourceEl ? toGameRect(sourceEl.getBoundingClientRect()) : null;
  const sourceClone = sourceEl ? sourceEl.cloneNode(true) : null;

  G.sentence.push(card);
  playSFX('card_insert');
  renderCombat();
  if (G.isTutorial) document.dispatchEvent(new CustomEvent('tutorial:sentence-changed'));
  requestAnimationFrame(() => {
    syncSentenceComplete();

    // FLIP: animate clone from source to destination
    if (sourceRect && sourceClone) {
      const newSlots = document.querySelectorAll('#sentence-slots-container .sentence-card-wrap');
      const targetWrap = newSlots[newSlots.length - 1];
      if (!targetWrap) return;
      const targetCard = targetWrap.querySelector('.sentence-mini-card') || targetWrap;
      const targetRect = toGameRect(targetCard.getBoundingClientRect());

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
      sourceClone.style.transition = 'all 0.17s ease-in';
      sourceClone.classList.add('card-flying');
      (document.getElementById('game') || document.body).appendChild(sourceClone);

      setTimeout(() => {
        sourceClone.style.left = targetRect.left + 'px';
        sourceClone.style.top = targetRect.top + 'px';
        sourceClone.style.width = targetRect.width + 'px';
        sourceClone.style.height = targetRect.height + 'px';
        sourceClone.style.transform = 'rotate(4deg) scale(.55)';
        sourceClone.style.opacity = '0.9';
      }, 30);
      setTimeout(() => {
        sourceClone.remove();
        targetWrap.style.opacity = '';
      }, 200);
    }
  });
}

export function removeSentenceWord(idx) {
  if (idx >= 0 && idx < G.sentence.length) {
    G.sentence.splice(idx, 1);
    playSFX('card_remove');
  }
  renderCombat();
}

export function updateChantButton() {
  const btn = document.getElementById('chant-btn');
  const cost = getSentenceCost();
  const validity = getSentenceValidity(G.sentence);
  G.sentenceValidity = validity;
  const isSummon = validity.code === 'summon';
  const blocked = !validity.ok || cost > G.energy;
  // 不用真 disabled——死按钮会吞掉点击, 玩家得不到"为什么不行"的回应。
  // .btn-blocked 负责禁用观感, chantSentence 的守卫负责拒绝反馈。
  btn.disabled = false;
  btn.setAttribute('aria-disabled', blocked ? 'true' : 'false');
  btn.dataset.validity = validity.code;
  btn.title = !validity.ok ? validity.reason : (cost > G.energy ? `缺 ${cost - G.energy} 文力` : '');
  btn.classList.toggle('btn-blocked', blocked);
  btn.style.opacity = blocked ? '0.35' : '1';
  const label = isSummon ? t('summon') : t('chant');
  btn.textContent = G.sentence.length > 0 ? `${label} (${cost} ${t('energy')})` : t('chant');
  document.getElementById('combat-screen')?.setAttribute('data-sentence-validity', validity.code);
}

// 点了不能用的吟诵按钮:抖一下 + 低嗡 + 说清原因。拒绝要"被感觉到"。
function denyChant(reason) {
  const btn = document.getElementById('chant-btn');
  if (btn) {
    btn.classList.remove('btn-denied');
    void btn.offsetWidth;
    btn.classList.add('btn-denied');
    setTimeout(() => btn.classList.remove('btn-denied'), 280);
  }
  if (reason) showFloatingText(document.querySelector('#combat-top'), `✗ ${reason}`, '#C54B3C');
  playSFX('denied');
}

// ============================================================
// CHANT
// ============================================================
export async function chantSentence() {
  if (G._chantResolving) return;
  const validity = getSentenceValidity(G.sentence);
  G.sentenceValidity = validity;
  if (!validity.ok) { denyChant(validity.reason); return; }
  const cost = getSentenceCost();
  if (cost > G.energy) { denyChant(`缺 ${cost - G.energy} 文力`); return; }

  // Summons are the only alternate valid construction. Everything else has
  // already passed the same deterministic gate exposed to the button/UI.
  const summon = validity.summon || null;

  if (G.isTutorial) document.dispatchEvent(new CustomEvent('tutorial:chant'));

  // The judge is asynchronous. Lock before spending resources so repeated
  // clicks cannot schedule the same line twice.
  G._chantResolving = true;
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
  // 施法瞬间:造句区从「卡牌排列」融为「完整句子」,直到结算动画结束后
  // renderCombat() 自然清空。让玩家看到自己念出的那句诗,而非空槽。
  renderChantedSentence(sentenceCards);
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

  // Compose-time quips yield to the higher-priority resolved-action channel as
  // soon as the chant is committed (including while the async judge answers).
  clearSelectionPhaseDialogue();
  clearPuppetBubbles();
  beginJudgingFeedback(journalText);
  const judge = await judgeSentence(journalText);
  showJudgeVerdict(judge);

  if (summon) {
    const feedbackTiming = beginPlayerFeedback(sentenceCards, journalText, { damage: 1 });
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
      <div class="score-line" style="animation-delay:300ms;color:var(--gold);">
        判句 ${judge.grade}·${judge.gradeLabel} ${judge.score}分　效果×${judge.multiplier.toFixed(2)}
      </div>
    `;
    setTimeout(() => overlay.classList.add('active'), feedbackTiming.verdictAt);
    setTimeout(() => {
      VFX.excFlash('#00ffcc');
      VFX.shake('sm');
      playChantPuppetAnim({ damage: 1 }, feedbackTiming.puppet);
    }, feedbackTiming.actionStart);
    setTimeout(() => {
      overlay.classList.remove('active');
      const before = snapshotCombatVitals();
      effect.apply(judge);
      recordResolvedPlayerAction({ before, summon, sentence: journalText });
      notifyResolvedPlayerAction({ summon });
      renderCombat();
      renderChantedSentence(sentenceCards);
      restoreChantedFeedback(sentenceCards);
    }, feedbackTiming.impactAt);
    setTimeout(() => {
      checkEnemies();
      renderCombat();
      finishPlayerFeedback();
      G._chantResolving = false;
    }, feedbackTiming.completeAt);
  } else {
    const result = applyJudgeToEvaluation(evaluateSentence(sentenceCards), judge);
    const feedbackTiming = beginPlayerFeedback(sentenceCards, journalText, result.effects);
    logChant({ result });
    // Creativity ledger advances only on a REAL chant (after evaluation, so a
    // sentence never counts as its own repeat). Previews read, never write.
    recordChantCreativity((result && result.cards) || sentenceCards);
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
    // Continuity chain — same pattern as rhyme: the streak the evaluator saw
    // becomes the baseline for the next sentence.
    G._continuityStreak = (result && result.effects && result.effects._continuity)
      ? result.effects._continuity.streak : 0;
    setTimeout(() => {
      playChantPuppetAnim(result.effects, feedbackTiming.puppet);
      // 驱虎吞狼:倒戈敌人的冲撞小剧场与主动画并行,命中帧同拍。
      if (result.effects._enemyVsEnemy) playEnemyVsEnemyAnim(result.effects._enemyVsEnemy, feedbackTiming.puppet);
    }, feedbackTiming.actionStart);
    // 伤害与木偶命中帧同拍落地(和敌方回合同一契约, 见 puppets.js 顶部注释):
    // 飘字/屏震/泼墨在"戳中"那一帧爆发, 浮层只负责文字解说, 关闭时才判胜负。
    setTimeout(() => {
      // 高倍率句的"爆点"音效与命中同帧, 大招听起来就是不一样。
      if (result.totalMult >= 2) playSFX('combo_break');
      const before = snapshotCombatVitals();
      applyEffects(result.effects);
      recordResolvedPlayerAction({ before, effects: result.effects, sentence: journalText });
      notifyResolvedPlayerAction({ effects: result.effects });
      renderCombat();
      renderChantedSentence(sentenceCards);
      restoreChantedFeedback(sentenceCards);
    }, feedbackTiming.impactAt);
    setTimeout(() => {
      checkEnemies();
      renderCombat();
      finishPlayerFeedback();
      G._chantResolving = false;
    }, feedbackTiming.completeAt);
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
    playSFX(effects._enemyAttacksPlayer ? 'impact_player' : 'selfharm');
    const dmg = effects.selfHarmDmg;
    G.hp -= dmg;
    if (G.hp < 1) G.hp = 1;
    showFloatingText(
      document.querySelector('#combat-top'),
      effects._enemyAttacksPlayer ? `-${dmg}受击` : `-${dmg}自伤`,
      effects._enemyAttacksPlayer ? '#B4471F' : '#6B4C6E',
    );
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

  const directedEnemy = (payload) => {
    const requested = Number(payload?.enemyIdx);
    const idx = requested >= 0 && G.enemies[requested]?.hp > 0
      ? requested
      : G.enemies.findIndex(e => e && e.hp > 0);
    return idx >= 0 ? G.enemies[idx] : null;
  };

  if (effects._enemyBlock?.amount > 0) {
    const target = directedEnemy(effects._enemyBlock);
    if (target) {
      target.block = (target.block || 0) + effects._enemyBlock.amount;
      playSFX('block');
      showFloatingText(target.element, `+${effects._enemyBlock.amount}🛡`, '#2D4B73');
    }
  }

  if (effects._enemyHeal?.amount > 0) {
    const target = directedEnemy(effects._enemyHeal);
    if (target) {
      target.hp = Math.min(target.maxHp, target.hp + effects._enemyHeal.amount);
      playSFX('heal');
      showFloatingText(target.element, `+${effects._enemyHeal.amount}♥`, '#4A7C6B');
    }
  }

  if (effects._enemyStrength?.amount > 0) {
    const target = directedEnemy(effects._enemyStrength);
    if (target) {
      target.strength = (target.strength || 0) + effects._enemyStrength.amount;
      showFloatingText(target.element, `+${effects._enemyStrength.amount}力量`, '#B87333');
    }
  }

  if (effects._enemyRest) {
    const target = directedEnemy(effects._enemyRest);
    if (target) {
      target.stunned = true;
      showFloatingText(target.element, '🛌 躺平·跳过攻击', '#6B4C6E');
    }
  }

  if (effects.strengthGain > 0) {
    G.strength += effects.strengthGain;
    showFloatingText(document.querySelector('#combat-top'), `+${effects.strengthGain}力量`, '#4A7C6B');
  }

  if (effects.draw > 0) { drawCards(effects.draw); playSFX('card_draw'); }

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
        } else if (p.target === 'coactor' || p.target === 'broadcast') {
          // 具名主语("猫是给")— 双关是那个 co-actor 的状态:纯表演,
          // 不给敌人上 debuff(演出在 puppets.playChantPuppetAnim 的
          // coactor 分支,棍人换表情)。broadcast 为旧档兼容别名。
          const coEl = document.querySelector(`.puppet-coactor[data-coactor="${p.subjectWord}"]`);
          showFloatingText(coEl || document.querySelector('#combat-top'),
            `${p.subjectWord}·${p.pun.label}`, '#9B59B6');
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
        } else if (p.target === 'coactor') {
          rememberActorIdentity(p.subjectWord, p.identityWord);
          showFloatingText(document.querySelector('#combat-top'),
            `${trait.emoji} ${p.subjectWord}成为${p.identityWord}`, '#9B59B6');
        } else {
          const ee = trait.enemyEffect || {};
          const applyToEnemy = (e) => {
            if (!e || e.hp <= 0) return;
            if (ee.weak) e.weak = (e.weak || 0) + ee.weak;
            if (ee.vulnerable) e.vulnerable = (e.vulnerable || 0) + ee.vulnerable;
            if (ee.strengthDelta) e.strength = (e.strength || 0) + ee.strengthDelta;
            if (ee.block) e.block = (e.block || 0) + ee.block;
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

  // SCENE CHANGE (P5) — 「去月下」移步换景:场景整场持续直到再换。
  if (effects._sceneChange) {
    const sc = SCENES[effects._sceneChange.sceneId];
    if (sc && (!G.currentScene || G.currentScene.id !== sc.id)) {
      G.currentScene = { id: sc.id, name: sceneName(sc), sinceTurn: G.turn };
      if (!G.scenesVisited) G.scenesVisited = [];
      if (!G.scenesVisited.some(v => v.id === sc.id)) {
        G.scenesVisited.push({ id: sc.id, turn: G.turn, combatCount: G.combatCount || 0 });
      }
      showFloatingText(document.querySelector('#combat-top'),
        `🗺 ${isEn() ? 'Enter · ' + sc.en : '移步·' + sc.name}`, '#3E7CA6');
    }
  }

  // SCENERY PROPS (P5) — 句中景物词上台(上限3,重复不叠加,新的顶掉最老的)。
  if (effects._sceneryAdd && effects._sceneryAdd.length) {
    const r = addSceneryWords(G.sceneryProps, effects._sceneryAdd, G.turn);
    G.sceneryProps = r.props;
    r.added.forEach((def, i) => setTimeout(() =>
      showFloatingText(document.querySelector('#combat-top'),
        `${def.emoji} ${isEn() ? def.en + ' takes the stage' : def.label + '·上台'}`, '#6B5BA6'), i * 280));
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
          playSFX('block');
          VFX.damageNum(document.getElementById('player-status-bar'), `🥷 ${a.name}守护 +${a.block}🛡`, '#3E7CA6', 2.2);
        } else if (a.heal > 0) {
          G.hp = Math.min(G.maxHp, G.hp + a.heal);
          playSFX('heal');
          VFX.damageNum(document.getElementById('player-status-bar'), `🥷 ${a.name}照料 +${a.heal}♥`, '#3E7CA6', 2.2);
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
  if (result.effects.selfHarm) {
    const harmLabel = result.effects._enemyAttacksPlayer ? '🩸 受击' : '💔 自伤';
    parts.push(`${harmLabel}${result.effects.selfHarmDmg}${result.effects.selfHarmBuff ? ' +'+result.effects.selfHarmBuff+'力量' : ''}`);
  }
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
  if (G._chantResolving) return;
  clearSelectionPhaseDialogue();
  G.sentence = [];
  while (G.hand.length > 0) G.discardPile.push(G.hand.pop());
  clearPuppetBubbles();
  queueEnemyTurnFeedback();
  // Reference endTurnNow starts its 200/480/680ms enemy timeline immediately;
  // the first 200ms *is* the readable pause, so no extra legacy 300ms delay.
  setTimeout(enemyTurn, 0);
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
  G.enemies.forEach((enemy, enemyIdx) => {
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

    // 多段攻击的节拍在调度时就读意图(ai 只会在本敌自己的 finishAct 里改它,
    // 调度→执行之间不会变), 这样敌间间隔与轮收尾能同步伸长。
    const intent = enemy.nextIntent;
    const multiHits = (intent && intent.type === 'attack' && (intent.hits | 0) > 1) ? (intent.hits | 0) : 0;
    setTimeout(() => {
      if (enemy.hp <= 0) return;
      const intentForAnim = enemy.nextIntent ? { ...enemy.nextIntent } : null;
      showEnemyTurnQuote(enemy, enemy.stunned ? { type: 'stunned' } : intentForAnim);
      beginEnemyFeedback(intentForAnim, enemyIdx);
      playEnemyPuppetAnim(intentForAnim, {
        enemyIndex: enemyIdx,
        stunned: enemy.stunned,
        timeline: {
          anticipationMs: REFERENCE_ENEMY_TIMING.TELEGRAPH,
          dashMs: REFERENCE_ENEMY_TIMING.DASH,
          impactMs: REFERENCE_ENEMY_TIMING.IMPACT,
          recoverMs: REFERENCE_ENEMY_TIMING.RECOVER,
          releaseMs: REFERENCE_ENEMY_TIMING.COMPLETE,
        },
      });
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
        const enemyBefore = { block: enemy.block || 0, strength: enemy.strength || 0 };
        const finishAct = () => {
          if (G._reflectDmg && G._reflectDmg > 0 && G.hp < hpBefore) {
            const reflected = Math.floor((hpBefore - G.hp) * G._reflectDmg);
            if (reflected > 0) {
              enemy.hp -= reflected;
              if (enemy.element) showFloatingText(enemy.element, `反弹${reflected}`, '#B87333');
            }
          }
          recordEnemyAction(enemy, enemyBefore);
          enemy.ai(enemy);
          renderCombat();
        };
        if (multiHits) {
          // 多段攻击逐拍出数字("4×3"打成 -4 -4 -4 而不是一坨 -12),
          // 玩家读得出连击, 也学得会用护甲拆多段。act_fn 的攻击分支等价于
          // 这个循环(见 enemies.js), 这里代它执行以插入节拍。
          for (let i = 0; i < multiHits; i++) {
            setTimeout(() => {
              if (enemy.hp <= 0 || G.hp <= 0) return;
              dealDamageToPlayer(intent.value, enemy);
              renderCombat();
            }, i * 180);
          }
          setTimeout(finishAct, (multiHits - 1) * 180 + 60);
        } else {
          enemy.act_fn(enemy);
          finishAct();
        }
      }, REFERENCE_ENEMY_TIMING.IMPACT);
    }, delay);
    delay += REFERENCE_ENEMY_TIMING.COMPLETE + (multiHits ? (multiHits - 1) * 180 : 0);
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
  if (G.isTutorial) {
    document.dispatchEvent(new CustomEvent('tutorial:victory'));
    return;
  }
  playVictoryJingle();
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
  // 胜利小调(~10s)独享听觉焦点,放完再淡入环境乐。
  stopMusic();
  playAmbientMusicDeferred();
  document.getElementById('reward-gold-text').textContent = `+${G.combatRewards.gold} 校章`;

  // 本场最帅一句：动态重放 + 倍率徽章
  const bvWrap = document.getElementById('best-verse');
  const bvStage = document.getElementById('best-verse-stage');
  const bvText = document.getElementById('best-verse-text');
  const bvMeta = document.getElementById('best-verse-meta');
  if (bvWrap && G._bestLine) {
    bvWrap.hidden = false;
    bvWrap.classList.add('is-visible');
    bvText.textContent = `「${G._bestLine.text}」`;
    bvMeta.textContent = `本场最佳 · ✨×${G._bestLine.mult.toFixed(2)}`;
    setTimeout(() => playBestVerseReplay(G._bestLine, bvStage), 250);
  } else if (bvWrap) {
    bvWrap.hidden = true;
    bvWrap.classList.remove('is-visible');
    if (bvStage) bvStage.innerHTML = '';
  }

  const container = document.getElementById('reward-cards');
  container.innerHTML = '';

  const syntaxLesson = isEn() ? null
    : nextSyntaxLesson(G.deck.map(card => card.key), G.floorsCleared);
  const offeredKeys = new Set(lessonRewardKeys(syntaxLesson));
  const drafted = draftRewardCards({
    deck: G.deck,
    floor: G.floorsCleared,
    count: syntaxLesson ? 2 : 3,
    excludeKeys: [...offeredKeys],
  });
  const choices = [];
  if (syntaxLesson) {
    choices.push({
      lesson: syntaxLesson,
      card: makeCard({ ...WORD_DEFS[syntaxLesson.key], key: syntaxLesson.key }),
      label: `新句式 · ${syntaxLesson.title}`,
      example: syntaxLesson.example,
      note: syntaxLesson.note,
    });
  }
  choices.push(...drafted);

  choices.forEach(({ lesson = null, card, label, example, note }) => {

    const wrapper = document.createElement('div');
    wrapper.className = `reward-card-wrapper${lesson ? ' reward-syntax-choice' : ''}`;
    const cardEl = createCardElement(card, null, { noClick: true });
    cardEl.style.cursor = 'pointer';
    cardEl.onclick = () => {
      G.deck.push(card);
      if (lesson) {
        lessonRewardKeys(lesson).slice(1).forEach((key) => {
          if (WORD_DEFS[key] && !G.deck.some(owned => owned.key === key)) {
            G.deck.push(makeCard({ ...WORD_DEFS[key], key }));
          }
        });
      }
      afterReward();
    };
    const rl = document.createElement('div');
    rl.className = `rarity-label rarity-${card.rarity}${lesson ? ' syntax-lesson-label' : ''}`;
    rl.textContent = label;
    wrapper.appendChild(cardEl);
    wrapper.appendChild(rl);
    const noteEl = document.createElement('div');
    noteEl.className = `reward-choice-note${lesson ? ' syntax-lesson-note' : ''}`;
    noteEl.innerHTML = `<strong>${example}</strong><span>${note}</span>`;
    wrapper.appendChild(noteEl);
    container.appendChild(wrapper);
  });

  const journalEl = document.getElementById('reward-journal');
  if (journalEl && G.sentenceJournal.length > 0) {
    let h = '<div style="margin-top:14px;padding:10px;border:1px solid var(--panel-border);border-radius:6px;background:rgba(255,255,255,0.3);">';
    h += '<div style="font-family:var(--font-brush);font-size:0.9rem;color:var(--ink);text-align:center;margin-bottom:6px;">— 句子记录 —</div>';
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
  const packs = Object.entries(CARD_PACKS).filter(([id, p]) => !p.default && !META.unlockedPacks?.includes(id) && !(isEn() && p.zhOnly));
  if (packs.length === 0) {
    packDiv.innerHTML += '<div style="opacity:0.5;font-size:0.8rem;">已全部解锁！</div>';
  } else {
    packs.forEach(([id, pack]) => {
      const canAfford = G.gold >= pack.price;
      const btn = document.createElement('div');
      btn.className = 'pack-item' + (canAfford ? '' : ' pack-locked');
      btn.innerHTML = `
        <span class="pack-icon">${pack.icon}</span>
        <span class="pack-name">${packName(pack)}</span>
        <span class="pack-desc">${packDesc(pack)}</span>
        <span class="pack-price">${canAfford ? '' : '🔒'} ${pack.price}⬡</span>
      `;
      if (canAfford) {
        btn.onclick = () => {
          G.gold -= pack.price;
          if (!META.unlockedPacks) META.unlockedPacks = [];
          META.unlockedPacks.push(id);
          saveMeta();
          btn.innerHTML = `<span class="pack-icon">${pack.icon}</span><span class="pack-name">${packName(pack)} ${isEn() ? '✓ Unlocked!' : '✓ 已解锁！'}</span>`;
          btn.onclick = null;
          btn.className = 'pack-item pack-bought';
          const goldEl = document.getElementById('reward-gold-text');
          if (goldEl) goldEl.textContent = `+${G.combatRewards?.gold || 0} 校章 (持有: ${G.gold}⬡)`;
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
