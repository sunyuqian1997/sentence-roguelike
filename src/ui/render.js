import { G } from '../game/state.js';
import { WORD_DEFS, getCardWord, getCardDesc } from '../data/cards.js';
import { t, isEn } from '../i18n.js';
import { showFloatingText, getPosColor } from '../utils.js';
import { playSFX } from '../game/audio.js';
import { getEnemyPortraitSVG } from './svgArt.js';
import { detectDuizhang, detectSummon, SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition } from '../game/sentence.js';
import { PUN_STATUS } from '../game/poetics.js';
import { applyMeaningsToSentence } from '../game/meanings.js';
import { updatePuppets } from './puppets.js';

// Puppet animations live in ./puppets.js; re-export for legacy importers.
export { updatePuppets, playChantPuppetAnim, playEnemyPuppetAnim } from './puppets.js';
import { getEffectiveCost, getSentenceCost, addToSentence, removeSentenceWord, updateChantButton, tryAddCard } from '../game/combat.js';

// ============================================================
// SCREEN
// ============================================================
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ============================================================
// RENDER
// ============================================================
export function renderCombat() {
  document.getElementById('combat-hp').textContent = `${G.hp}/${G.maxHp}`;
  document.getElementById('combat-block-display').innerHTML = G.block > 0 ? `🛡️ <b style="font-size:1.3em">${G.block}</b>` : '';

  let st = '';
  if (G.strength>0) st += `<span class="status-icon status-strength">力${G.strength}</span>`;
  if (G.vulnerable>0) st += `<span class="status-icon status-vulnerable">伤${G.vulnerable}</span>`;
  if (G.weak>0) st += `<span class="status-icon status-weak">弱${G.weak}</span>`;
  const stBar = document.getElementById('combat-status-effects-bar');
  if (stBar) stBar.innerHTML = st;
  const stOld = document.getElementById('combat-status-effects');
  if (stOld) stOld.innerHTML = st;
  document.getElementById('draw-count').textContent = G.drawPile.length;
  document.getElementById('discard-count').textContent = G.discardPile.length;
  document.getElementById('energy-text').textContent = G.energy;

  renderEnemies();
  renderSentenceSlots();
  renderRoundJournal();
  renderJournalBtnBadge();
  renderHand();
  updateChantButton();
  updatePuppets();
}

function renderRoundJournal() {
  const list = document.getElementById('round-journal-lines');
  const tag = document.getElementById('rhyme-streak-tag');
  if (!list) return;
  const lines = G.combatJournal || [];
  if (lines.length === 0) {
    list.innerHTML = '<div class="round-journal-empty">尚未吟诵…</div>';
  } else {
    list.innerHTML = lines.map((s, i) =>
      `<div class="round-journal-line"><span class="rj-num">${i + 1}.</span>「${s}」</div>`
    ).join('');
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  if (tag) {
    const streak = G.rhymeStreak || 0;
    if (streak > 0) { tag.textContent = `🎵 押韵×${streak}`; tag.style.display = 'inline-flex'; }
    else { tag.textContent = ''; tag.style.display = 'none'; }
  }
}

function renderJournalBtnBadge() {
  const btn = document.getElementById('journal-btn');
  if (!btn) return;
  const n = (G.sentenceJournal || []).length;
  btn.textContent = n > 0 ? `诗册·${n}` : '诗册';
}

export function renderEnemies() {
  const area = document.getElementById('enemy-area');
  area.innerHTML = '';
  const targetedIdx = getTargetedEnemyIdx();

  G.enemies.forEach((enemy, idx) => {
    if (enemy.hp <= 0) return;
    const div = document.createElement('div');
    div.className = 'enemy';
    if (idx === targetedIdx) div.classList.add('targeted');

    let ic = 'attack-intent', it = '';
    if (enemy.nextIntent) {
      const ni = enemy.nextIntent;
      if (ni.type==='attack') { ic='attack-intent'; it=`${ni.icon} ${ni.value}${ni.hits>1?'×'+ni.hits:''}`; }
      else if (ni.type==='defend') { ic='defend-intent'; it=`${ni.icon} ${ni.label||ni.value}`; }
      else if (ni.type==='buff') { ic='buff-intent'; it=`${ni.icon} ${ni.label||''}`; }
      else if (ni.type==='debuff') { ic='debuff-intent'; it=`${ni.icon} ${ni.label||''}`; }
      else if (ni.type==='special') { ic='special-intent'; it=`${ni.icon} ${ni.label||''}`; }
    }

    const hasVerb = G.sentence.some(c => c.pos === 'verb');
    if (hasVerb) div.classList.add('targetable');

    const portraitHTML = enemy.portrait
      ? `<img class="enemy-portrait-img" src="${enemy.portrait}" alt="${enemy.name}" onerror="this.outerHTML='<div class=\\'enemy-portrait\\'>${(enemy.emoji||'👾').replace(/'/g,'&#39;')}</div>'">`
      : `<div class="enemy-portrait">${typeof getEnemyPortraitSVG === 'function' ? getEnemyPortraitSVG(enemy) : (enemy.emoji||'👾')}</div>`;
    div.innerHTML = `
      <div class="enemy-name">${enemy.name}</div>
      <div class="enemy-intent ${ic}">${it}</div>
      ${portraitHTML}
      ${enemy.block>0?`<div class="enemy-block-indicator">🛡${enemy.block}</div>`:''}
      <div class="enemy-hp-row">
        <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${(enemy.hp/enemy.maxHp)*100}%"></div></div>
        <div class="enemy-hp-text">${enemy.hp}/${enemy.maxHp}</div>
      </div>
      <div class="enemy-status-effects">
        ${enemy.vulnerable>0?'<span class="status-icon status-vulnerable">伤'+enemy.vulnerable+'</span>':''}
        ${enemy.weak>0?'<span class="status-icon status-weak">弱'+enemy.weak+'</span>':''}
        ${(enemy.strength||0)>0?'<span class="status-icon status-strength">力'+enemy.strength+'</span>':''}
        ${(enemy._puns||[]).map(t => `<span class="status-icon status-pun" title="${(PUN_STATUS[t]||{}).label||t}">${(PUN_STATUS[t]||{}).label||t}</span>`).join('')}
      </div>
    `;
    div.onclick = () => addEnemyTarget(idx, enemy);
    enemy.element = div;
    area.appendChild(div);
  });
}

function addEnemyTarget(idx, enemy) {
  if (G.sentence.some(c => c._isEnemyTarget && c._enemyIdx === idx)) return;
  const hasHeConn = G.sentence.some(c => c.multiTarget);
  const hasComma = G.sentence.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  if (hasHeConn || hasComma) {
    G.sentence = G.sentence.filter(c => !c._isSelfTarget);
  } else {
    G.sentence = G.sentence.filter(c => !c._isEnemyTarget && !c._isSelfTarget);
  }
  const card = {
    word: enemy.name, pos: 'object', cost: 0,
    _isEnemyTarget: true, _enemyIdx: idx,
    id: 'enemy_target_' + idx + '_' + Math.random().toString(36).substr(2, 5),
  };
  if (!tryAddCard(card)) { renderCombat(); return; }
  playSFX('card');
  renderCombat();
}

export function getTargetedEnemyIdx() {
  const enemyObj = G.sentence.find(c => c._isEnemyTarget);
  if (enemyObj) return enemyObj._enemyIdx;
  return -1;
}

export function renderSentenceSlots() {
  const container = document.getElementById('sentence-slots-container');
  container.innerHTML = '';

  // Resolve meanings once — slot cards render their ACTIVE usage (pos color,
  // caption), guaranteed in sync with the evaluator.
  const displayCards = applyMeaningsToSentence(G.sentence);

  const half = document.createElement('div');
  half.className = 'sentence-half';
  displayCards.forEach((card, idx) => {
    half.appendChild(createSentenceWordEl(card, idx));
  });
  container.appendChild(half);

  const preview = document.getElementById('sentence-preview');
  if (preview) preview.textContent = '';

  const dzEl = document.getElementById('duizhang-preview');
  const hasCommaInSentence = displayCards.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  if (hasCommaInSentence) {
    const dzResult = detectDuizhang(G.sentence);
    if (dzResult) {
      dzEl.className = dzResult.matched ? 'duizhang-good' : 'duizhang-bad';
      dzEl.textContent = dzResult.label;
    } else {
      dzEl.className = 'duizhang-bad';
      dzEl.textContent = '逗号两侧需要词语才能判定对仗';
    }
  } else {
    dzEl.textContent = '';
  }

  const sp = document.getElementById('sentence-score-preview');
  if (G.sentence.length > 0) {
    const summonCheck = detectSummon(G.sentence);
    if (summonCheck) {
      const eff = SUMMON_EFFECTS[summonCheck.summonName];
      sp.innerHTML = `<span class="sp-cost">费${getSentenceCost()}</span><span class="sp-chip sp-good">${eff.emoji} 召唤·${eff.name}</span><span class="sp-flavor">${eff.desc}</span>`;
    } else {
    const eval_ = evaluateSentence(G.sentence);
    if (eval_) {
      const ef = eval_.effects;
      // Outcome chips — one per effect, colored good/bad.
      const chips = [];
      const good = (t) => `<span class="sp-chip sp-good">${t}</span>`;
      const bad = (t) => `<span class="sp-chip sp-bad">${t}</span>`;
      if (ef.selfHarm) chips.push(bad(`💔自伤${ef.selfHarmDmg}${ef.selfHarmBuff ? ` +${ef.selfHarmBuff}力` : ''}`));
      if (ef.damage > 0) chips.push(bad(`⚔️${ef.damage}`));
      if (ef.isQuestion) chips.push(good(`❓削弱${ef.applyWeak}`));
      if (ef.block > 0) chips.push(good(`🛡${ef.block}`));
      if (ef.heal > 0) chips.push(good(`♥${ef.heal}`));
      if (ef.strengthGain > 0) chips.push(good(`↑${ef.strengthGain}力`));
      if (ef.draw > 0) chips.push(good(`📜${ef.draw}牌`));
      if (ef.multiTargetIndices && ef.multiTargetIndices.length > 1) chips.push(bad(`🎯×${ef.multiTargetIndices.length}`));
      if (ef.aoe) chips.push(bad('🌊全体'));
      if (ef.ignoreBlock) chips.push(bad('🗡穿透'));
      if (ef.goldGain > 0) chips.push(good(`💰${ef.goldGain}`));
      if (ef._execute) chips.push(bad('💀斩杀'));
      if (ef._imperative) chips.push(bad('🫵祈使'));

      // Hit rules — the verdicts that produced the multiplier, so the player
      // (and the balance reviewer) can see exactly what was recognized.
      const hits = [
        ...(eval_.literaryNotes || []),
        ...(eval_.punctNotes || []),
        ...(eval_.excNotes || []),
      ].filter(Boolean);
      const grammarHits = (eval_.grammarNotes || []).filter(n => !/语序正确|✓ 有谓语/.test(n));
      const allHits = [...grammarHits, ...hits];

      const excPos = checkExclamationPosition(G.sentence);
      const excWarn = excPos.note ? `<span class="sp-chip sp-bad">${excPos.note}</span>` : '';

      sp.innerHTML =
        `<div class="sp-row">` +
          `<span class="sp-cost">费${getSentenceCost()}</span>` +
          chips.join('') +
          `<span class="sp-mult">✨×${eval_.totalMult.toFixed(2)}</span>` +
          excWarn +
        `</div>` +
        (allHits.length
          ? `<div class="sp-rules">${allHits.map(n => `<span class="sp-rule">${n}</span>`).join('')}</div>`
          : '');
    }
    } // close summon else
  } else {
    sp.innerHTML = '';
  }
}

export function createSentenceWordEl(card, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'sentence-card-wrap';
  wrap.title = '点击取消 · 拖动排序';
  wrap.dataset.sentenceIdx = String(idx);
  wrap.draggable = true;
  wrap.onclick = (e) => { e.stopPropagation(); removeSentenceWord(idx); };
  attachSentenceDragHandlers(wrap);

  if (card._isEnemyTarget) {
    wrap.classList.add('target-enemy');
    wrap.innerHTML = `
      <div class="card pos-object sentence-mini-card enemy-target-card">
        <div class="card-cost">⊙</div>
        <div class="card-pos-tag">目标</div>
        <div class="card-word">${card.word}</div>
        <div class="card-effect-bar">敌人</div>
      </div>
      <div class="meaning-caption">作宾语</div>`;
    return wrap;
  }
  if (card._isSelfTarget) {
    wrap.classList.add('target-self');
    wrap.innerHTML = `
      <div class="card pos-subject sentence-mini-card self-target-card">
        <div class="card-cost">⊙</div>
        <div class="card-pos-tag">主语</div>
        <div class="card-word">我</div>
        <div class="card-effect-bar">自身</div>
      </div>
      <div class="meaning-caption">作主语</div>`;
    return wrap;
  }

  const el = createCardElement(card, null, { noClick: true });
  el.classList.add('sentence-mini-card');
  el.onclick = null;

  // Card arrives pre-resolved from applyMeaningsToSentence
  const activeMeaning = card._activeMeaning || null;
  const captionText = activeMeaning
    ? `${activeMeaning.emoji || '✨'} ${activeMeaning.label}`
    : (Array.isArray(card.meanings) && card.meanings.length > 0 ? '⚪ 默认用法' : '');

  // Multi-meaning badge on the mini card
  if (Array.isArray(card.meanings) && card.meanings.length > 0) {
    const badge = document.createElement('div');
    badge.className = 'meaning-badge';
    badge.textContent = '💡';
    badge.title = '多义卡：根据上下文选用法';
    el.appendChild(badge);
  }
  if (activeMeaning) {
    el.classList.add('meaning-active');
  }

  wrap.appendChild(el);
  if (captionText) {
    const cap = document.createElement('div');
    cap.className = 'meaning-caption' + (activeMeaning ? ' meaning-caption-active' : '');
    cap.textContent = captionText;
    wrap.appendChild(cap);
  }
  return wrap;
}

function attachSentenceDragHandlers(wrap) {
  wrap.addEventListener('dragstart', (e) => {
    wrap.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', wrap.dataset.sentenceIdx);
  });
  wrap.addEventListener('dragend', () => {
    wrap.classList.remove('dragging');
    document.querySelectorAll('.sentence-card-wrap.drag-over').forEach(el => el.classList.remove('drag-over'));
  });
  wrap.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    wrap.classList.add('drag-over');
  });
  wrap.addEventListener('dragleave', () => {
    wrap.classList.remove('drag-over');
  });
  wrap.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const fromIdx = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const toIdx = parseInt(wrap.dataset.sentenceIdx, 10);
    wrap.classList.remove('drag-over');
    if (Number.isInteger(fromIdx) && Number.isInteger(toIdx) && fromIdx !== toIdx) {
      reorderSentence(fromIdx, toIdx);
    }
  });
}

function reorderSentence(fromIdx, toIdx) {
  if (fromIdx < 0 || fromIdx >= G.sentence.length) return;
  if (toIdx < 0 || toIdx >= G.sentence.length) return;
  const moved = G.sentence.splice(fromIdx, 1)[0];
  G.sentence.splice(toIdx, 0, moved);
  playSFX('card');
  renderCombat();
}

export function renderHand() {
  renderTargetCards();

  const handEl = document.getElementById('hand-cards');
  handEl.innerHTML = '';
  G.hand.forEach((card, idx) => {
    const el = createCardElement(card, idx);
    if (G.sentence.includes(card)) el.classList.add('in-sentence');
    handEl.appendChild(el);
  });
}

// Target cards live in the hand row now (not on the standees): the pinned 我
// card sits at the LEFT of the hand, and one card per living enemy sits at the
// RIGHT (closer to the enemy standees). Clicking them selects the target — same
// effect as the old standee clicks, but unified with playing cards.
function renderTargetCards() {
  const slot = document.getElementById('target-cards');
  const enemySlot = document.getElementById('target-cards-enemy');
  if (!slot) return;
  slot.innerHTML = '';
  if (enemySlot) enemySlot.innerHTML = '';

  // 我 (self target)
  const woDef = WORD_DEFS.wo;
  const woCard = { ...woDef, key: 'wo', upgraded: false, cost: 0, _isFixedCard: true, id: 'tgt_wo' };
  const woEl = createCardElement(woCard, null, { noClick: true });
  woEl.classList.add('target-card', 'target-self');
  const woPin = document.createElement('div');
  woPin.className = 'card-pin'; woPin.textContent = '我';
  woEl.appendChild(woPin);
  if (G.sentence.some(c => c._isFixedWo)) woEl.classList.add('in-sentence');
  woEl.style.cursor = 'pointer';
  woEl.onclick = () => {
    if (G.sentence.some(c => c._isFixedWo)) return;
    const card = { ...woDef, key: 'wo', upgraded: false, cost: 0, _isFixedWo: true, id: 'fixed_wo_' + Math.random().toString(36).substr(2, 5) };
    if (!tryAddCard(card)) { renderCombat(); return; }
    playSFX('card');
    renderCombat();
  };
  slot.appendChild(woEl);

  // One card per living enemy — rendered into the RIGHT-side container.
  const enemyContainer = enemySlot || slot;
  G.enemies.forEach((enemy, idx) => {
    if (!enemy || enemy.hp <= 0) return;
    const eCard = { word: enemy.name, pos: 'object', cost: 0, _isFixedCard: true, id: 'tgt_enemy_' + idx };
    const eEl = createCardElement(eCard, null, { noClick: true });
    eEl.classList.add('target-card', 'target-enemy');
    const ePin = document.createElement('div');
    ePin.className = 'card-pin'; ePin.textContent = '敌';
    eEl.appendChild(ePin);
    if (G.sentence.some(c => c._isEnemyTarget && c._enemyIdx === idx)) eEl.classList.add('in-sentence');
    eEl.style.cursor = 'pointer';
    eEl.onclick = () => addEnemyTarget(idx, enemy);
    enemyContainer.appendChild(eEl);
  });
}

export function createCardElement(card, handIndex, opts={}) {
  const div = document.createElement('div');
  div.className = `card pos-${card.pos}`;
  if (card.upgraded) div.classList.add('upgraded');
  if (card.rarity === 'uncommon') div.classList.add('rarity-uncommon');
  if (card.rarity === 'rare') div.classList.add('rarity-rare');

  const cost = getEffectiveCost(card);
  let descText = '';
  if (typeof card.desc === 'function') descText = card.desc(card);
  else if (typeof card.desc === 'string') descText = card.desc;

  const posNames = t('posNames');
  const word = getCardWord(card);
  const desc = getCardDesc(card);

  const multiMeaningBadge = (Array.isArray(card.meanings) && card.meanings.length > 0)
    ? `<div class="meaning-badge" title="多义卡">💡</div>`
    : '';
  div.innerHTML = `
    <div class="card-cost">${cost}</div>
    <div class="card-pos-tag">${posNames[card.pos]||card.pos}</div>
    <div class="card-word">${word}${card.upgraded?'+':''}</div>
    <div class="card-effect-bar">${desc}</div>
    ${multiMeaningBadge}
  `;

  if (handIndex !== undefined && handIndex !== null && !opts.noClick) {
    div.onclick = (e) => { e.stopPropagation(); addToSentence(handIndex); };
  }

  const isTouchDevice = 'ontouchstart' in window;
  if (!isTouchDevice) {
    div.onmouseenter = (e) => showTooltip(e, card);
    div.onmouseleave = hideTooltip;
  } else {
    let pressTimer = null;
    div.addEventListener('touchstart', (e) => {
      pressTimer = setTimeout(() => { showTooltipMobile(card); pressTimer = null; }, 400);
    }, { passive: true });
    div.addEventListener('touchend', () => { if (pressTimer) clearTimeout(pressTimer); });
    div.addEventListener('touchmove', () => { if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; } });
  }

  return div;
}

export function showTooltip(e, card) {
  const tt = document.getElementById('tooltip');
  const posNames = t('posNames');
  const rarityNames = t('rarityNames');
  tt.querySelector('.tt-name').textContent = getCardWord(card) + (card.upgraded ? '+' : '');
  tt.querySelector('.tt-type').textContent = `${posNames[card.pos]} · ${rarityNames[card.rarity] || card.rarity} · ${isEn() ? 'Cost' : '费用'}${getEffectiveCost(card)}`;
  let d = getCardDesc(card);
  tt.querySelector('.tt-desc').textContent = d;
  tt.querySelector('.tt-flavor').textContent = card.flavor ? `"${card.flavor}"` : '';
  tt.style.display = 'block';
  tt.style.transform = '';
  // Measure after content is set so height is accurate
  const ttRect = tt.getBoundingClientRect();
  const r = e.currentTarget.getBoundingClientRect();
  // Default: above the card, horizontally centered on it
  let left = r.left + r.width / 2 - ttRect.width / 2;
  let top = r.top - ttRect.height - 10;
  // If above would clip, fall back to below
  if (top < 5) top = r.bottom + 10;
  // Clamp horizontal
  if (left + ttRect.width > window.innerWidth - 5) left = window.innerWidth - ttRect.width - 5;
  if (left < 5) left = 5;
  tt.style.left = left + 'px';
  tt.style.top = top + 'px';
}

function showTooltipMobile(card) {
  const tt = document.getElementById('tooltip');
  const posNames = t('posNames');
  const rarityNames = t('rarityNames');
  tt.querySelector('.tt-name').textContent = getCardWord(card) + (card.upgraded ? '+' : '');
  tt.querySelector('.tt-type').textContent = `${posNames[card.pos]} · ${rarityNames[card.rarity] || card.rarity} · ${isEn() ? 'Cost' : '费用'}${getEffectiveCost(card)}`;
  let d = getCardDesc(card);
  tt.querySelector('.tt-desc').textContent = d;
  tt.querySelector('.tt-flavor').textContent = card.flavor ? `"${card.flavor}"` : '';
  tt.style.display = 'block';
  tt.style.left = '50%';
  tt.style.top = '8px';
  tt.style.transform = 'translateX(-50%)';
  tt.style.maxWidth = '85vw';
  setTimeout(() => { tt.style.display = 'none'; tt.style.transform = ''; }, 2000);
}

export function hideTooltip() {
  const tt = document.getElementById('tooltip');
  tt.style.display = 'none';
  tt.style.transform = '';
}

if ('ontouchstart' in window) {
  document.addEventListener('touchstart', () => hideTooltip(), { passive: true });
}
