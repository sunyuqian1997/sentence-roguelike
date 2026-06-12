import { G } from '../game/state.js';
import { WORD_DEFS, getCardWord, getCardDesc } from '../data/cards.js';
import { t, isEn } from '../i18n.js';
import { showFloatingText, getPosColor } from '../utils.js';
import { playSFX } from '../game/audio.js';
import { getEnemyPortraitSVG } from './svgArt.js';
import { detectDuizhang, detectSummon, SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition } from '../game/sentence.js';
import { getEffectiveCost, getSentenceCost, addToSentence, removeSentenceWord, updateChantButton } from '../game/combat.js';

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
  renderEnemyTargetBar();
  renderSentenceSlots();
  renderRoundJournal();
  renderJournalBtnBadge();
  renderHand();
  updateChantButton();
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
  G.sentence.push({
    word: enemy.name, pos: 'object', cost: 0,
    _isEnemyTarget: true, _enemyIdx: idx,
    id: 'enemy_target_' + idx + '_' + Math.random().toString(36).substr(2, 5),
  });
  playSFX('card');
  renderCombat();
}

export function getTargetedEnemyIdx() {
  const enemyObj = G.sentence.find(c => c._isEnemyTarget);
  if (enemyObj) return enemyObj._enemyIdx;
  return -1;
}

export function renderEnemyTargetBar() {
  // Enemy targets are now selected by clicking enemy cards directly,
  // so the redundant target bar is hidden.
  const bar = document.getElementById('enemy-targets-bar');
  if (bar) bar.innerHTML = '';
}

export function renderSentenceSlots() {
  const container = document.getElementById('sentence-slots-container');
  container.innerHTML = '';

  const displayCards = G.sentence;

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
      sp.innerHTML = `<span>费${getSentenceCost()}</span> <span style="color:var(--neon-cyan)">${eff.emoji} 召唤·${eff.name}</span> <span style="color:var(--paper-dark)">${eff.desc}</span>`;
    } else {
    const eval_ = evaluateSentence(G.sentence);
    if (eval_) {
      const parts = [];
      if (eval_.effects.selfHarm) {
        parts.push(`💔自伤${eval_.effects.selfHarmDmg}`);
        if (eval_.effects.selfHarmBuff) parts.push(`+${eval_.effects.selfHarmBuff}力量`);
      }
      if (eval_.effects.damage > 0) parts.push(`⚔️${eval_.effects.damage}`);
      if (eval_.effects.isQuestion) parts.push(`❓削弱${eval_.effects.applyWeak}`);
      if (eval_.effects.block > 0) parts.push(`🛡${eval_.effects.block}`);
      if (eval_.effects.heal > 0) parts.push(`♥${eval_.effects.heal}`);
      if (eval_.effects.strengthGain > 0) parts.push(`↑${eval_.effects.strengthGain}力`);
      if (eval_.effects.draw > 0) parts.push(`📜${eval_.effects.draw}牌`);
      if (eval_.effects.multiTargetIndices && eval_.effects.multiTargetIndices.length > 1) parts.push(`🎯多目标×${eval_.effects.multiTargetIndices.length}`);
      if (eval_.effects.aoe) parts.push('🌊全体');
      if (eval_.effects.ignoreBlock) parts.push('🗡穿透');
      if (eval_.effects.goldGain > 0) parts.push(`💰${eval_.effects.goldGain}`);
      if (eval_.effects._execute) parts.push(`💀斩杀`);
      const excPos = checkExclamationPosition(G.sentence);
      const excWarn = excPos.note ? ` <span style="color:#e07070">${excPos.note}</span>` : '';
      sp.innerHTML = `<span>费${getSentenceCost()}</span> ${parts.join(' ')} <span style="color:var(--gold)">✨×${eval_.totalMult.toFixed(2)}</span>${excWarn}`;
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
      </div>`;
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
      </div>`;
    return wrap;
  }

  const el = createCardElement(card, null, { noClick: true });
  el.classList.add('sentence-mini-card');
  el.onclick = null;
  wrap.appendChild(el);
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
  const fixedSlot = document.getElementById('fixed-card-slot');
  fixedSlot.innerHTML = '';
  const fixedWoDef = WORD_DEFS.wo;
  const fixedCard = { ...fixedWoDef, key: 'wo', upgraded: false, cost: 0, _isFixedCard: true, id: 'fixed_wo' };
  const fixedEl = createCardElement(fixedCard, null, { noClick: true });
  const pin = document.createElement('div');
  pin.className = 'card-pin';
  pin.textContent = '📌';
  fixedEl.appendChild(pin);
  const woInSentence = G.sentence.some(c => c._isFixedWo);
  if (woInSentence) fixedEl.classList.add('in-sentence');
  fixedEl.style.cursor = 'pointer';
  fixedEl.onclick = () => {
    if (G.sentence.some(c => c._isFixedWo)) return;
    const woSentenceCard = {
      ...fixedWoDef, key: 'wo', upgraded: false, cost: 0,
      _isFixedWo: true, id: 'fixed_wo_' + Math.random().toString(36).substr(2, 5),
    };
    G.sentence.push(woSentenceCard);
    playSFX('card');
    renderCombat();
  };
  fixedSlot.appendChild(fixedEl);

  const handEl = document.getElementById('hand-cards');
  handEl.innerHTML = '';
  G.hand.forEach((card, idx) => {
    const el = createCardElement(card, idx);
    if (G.sentence.includes(card)) el.classList.add('in-sentence');
    handEl.appendChild(el);
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

  div.innerHTML = `
    <div class="card-cost">${cost}</div>
    <div class="card-pos-tag">${posNames[card.pos]||card.pos}</div>
    <div class="card-word">${word}${card.upgraded?'+':''}</div>
    <div class="card-effect-bar">${desc}</div>
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
  const r = e.target.getBoundingClientRect();
  let left = r.right + 10, top = r.top;
  if (left + 240 > window.innerWidth) left = r.left - 250;
  if (top + 120 > window.innerHeight) top = window.innerHeight - 130;
  tt.style.left = Math.max(5, left) + 'px';
  tt.style.top = Math.max(5, top) + 'px';
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
