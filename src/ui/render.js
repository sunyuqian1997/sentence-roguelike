import { G } from '../game/state.js';
import { WORD_DEFS, getCardWord, getCardDesc, getSelfCardKey } from '../data/cards.js';
import { t, isEn } from '../i18n.js';
import { showFloatingText, getPosColor } from '../utils.js';
import { playSFX } from '../game/audio.js';
import { getEnemyPortraitSVG } from './svgArt.js';
import { enemyName } from '../data/enemies.js';
import { detectDuizhang, SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition } from '../game/sentence.js';
import { PUN_STATUS, getRhymeKey, checkRhyme } from '../game/poetics.js';
import { applyMeaningsToSentence } from '../game/meanings.js';
import { updatePuppets } from './puppets.js';
import { attachSentenceDrag, attachHandDrag } from './dragSort.js';
import { spriteKeyForEnemy } from './spriteAnimator.js';
import { getSentenceValidity } from '../game/sentenceValidity.js';
import { uiBridge } from '../react/runtime/uiBridge.js';

// Puppet animations live in ./puppets.js; re-export for legacy importers.
export { updatePuppets, playChantPuppetAnim, playEnemyPuppetAnim } from './puppets.js';
import { getEffectiveCost, getSentenceCost, addToSentence, removeSentenceWord, updateChantButton, tryAddCard } from '../game/combat.js';
import { uiScale, toGameRect, DESIGN_W, DESIGN_H } from './uiScale.js';

// ============================================================
// SCREEN
// ============================================================
export function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  uiBridge.emit('screen:change', { id });
}

// ============================================================
// RENDER
// ============================================================
export function renderCombat() {
  // Re-rendering destroys the card DOM the cursor may be hovering, so its
  // mouseleave never fires and the tooltip would stick. Dismiss it up front.
  hideTooltip();
  // 场景(P5): data-scene 驱动 pixel.css 的舞台变景。
  const combatScreen = document.getElementById('combat-screen');
  if (combatScreen) combatScreen.dataset.scene = (G.currentScene && G.currentScene.id) || '';
  // Player standee = the 我 target affordance (bound once; idempotent).
  const pc = document.getElementById('player-char-card');
  if (pc && !pc._selfBound) { pc._selfBound = true; pc.style.cursor = 'pointer'; pc.onclick = () => addSelfTarget(); }
  document.getElementById('combat-hp').textContent = `${G.hp}/${G.maxHp}`;
  document.getElementById('combat-block-display').innerHTML = G.block > 0 ? `🛡️ <b style="font-size:1.3em">${G.block}</b>` : '';

  let st = '';
  if (G.strength>0) st += `<span class="status-icon status-strength">${t('status_str')}${G.strength}</span>`;
  if (G.vulnerable>0) st += `<span class="status-icon status-vulnerable">${t('status_vuln')}${G.vulnerable}</span>`;
  if (G.weak>0) st += `<span class="status-icon status-weak">${t('status_weak')}${G.weak}</span>`;
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
  renderChantButtonVerdict();
  updatePuppets();
  uiBridge.emit('combat:render');
}

function renderChantButtonVerdict() {
  const btn = document.getElementById('chant-btn');
  const validity = G.sentenceValidity;
  const invalidSentence = G.sentence.length > 0 && validity && !validity.ok;
  btn?.classList.toggle('btn-invalid-sentence', Boolean(invalidSentence));
  if (!btn) return;
  if (!invalidSentence) { btn.removeAttribute('aria-label'); return; }
  btn.textContent = t('cannotChant');
  btn.setAttribute('aria-label', `${t('cannotChant')}：${validity.reason || ''}`);
}

function renderRoundJournal() {
  const list = document.getElementById('round-journal-lines');
  const tag = document.getElementById('rhyme-streak-tag');
  if (!list) return;
  const lines = G.combatJournal || [];
  if (lines.length === 0) {
    list.innerHTML = `<div class="round-journal-empty">${t('notChanted')}</div>`;
  } else {
    list.innerHTML = lines.map((s, i) =>
      `<div class="round-journal-line"><span class="rj-num">${i + 1}.</span>「${s}」</div>`
    ).join('');
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }
  if (tag) {
    const streak = G.rhymeStreak || 0;
    if (streak > 0) { tag.textContent = `🎵 ${t('rhyme')}×${streak}`; tag.style.display = 'inline-flex'; }
    else { tag.textContent = ''; tag.style.display = 'none'; }
  }
}

function renderJournalBtnBadge() {
  const btn = document.getElementById('journal-btn');
  if (!btn) return;
  const n = (G.sentenceJournal || []).length;
  btn.textContent = n > 0 ? `${t('poemBook')}·${n}` : t('poemBook');
}

export function renderEnemies() {
  const area = document.getElementById('enemy-area');
  area.innerHTML = '';
  const targetedIdx = getTargetedEnemyIdx();
  const targetedEnemy = targetedIdx >= 0 ? G.enemies[targetedIdx] : null;
  const foregroundEnemy = targetedEnemy?.hp > 0
    ? targetedEnemy
    : G.enemies.find(enemy => enemy && enemy.hp > 0);
  const foregroundSprite = document.getElementById('battle-sprite-enemy');
  const foregroundSpriteImage = document.getElementById('battle-enemy-sprite-img');
  if (foregroundSprite && foregroundSpriteImage) {
    foregroundSprite.hidden = !foregroundEnemy;
    if (foregroundEnemy) {
      foregroundSpriteImage.src = foregroundEnemy.portrait || '/enemies/moyao.png';
      foregroundSpriteImage.alt = enemyName(foregroundEnemy);
    }
  }
  const stageEnemySprite = document.getElementById('puppet-enemy');
  if (stageEnemySprite && foregroundEnemy) {
    stageEnemySprite.dataset.spriteKey = spriteKeyForEnemy(foregroundEnemy);
    stageEnemySprite.setAttribute('aria-label', enemyName(foregroundEnemy));
    const frame = stageEnemySprite.querySelector('.sprite-frame');
    if (frame) frame.setAttribute('aria-label', enemyName(foregroundEnemy));
  }

  G.enemies.forEach((enemy, idx) => {
    if (enemy.hp <= 0) return;
    const div = document.createElement('div');
    div.className = 'enemy';
    div.id = `enemy-hud-${idx}`;
    div.dataset.enemyIndex = String(idx);
    div.setAttribute('aria-label', `${enemyName(enemy)}，生命${enemy.hp}/${enemy.maxHp}`);
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
      ? `<img class="enemy-portrait-img" src="${enemy.portrait}" alt="${enemyName(enemy)}" onerror="this.outerHTML='<div class=\\'enemy-portrait\\'>${(enemy.emoji||'👾').replace(/'/g,'&#39;')}</div>'">`
      : `<div class="enemy-portrait">${typeof getEnemyPortraitSVG === 'function' ? getEnemyPortraitSVG(enemy) : (enemy.emoji||'👾')}</div>`;
    div.innerHTML = `
      <div class="enemy-name">${enemyName(enemy)}</div>
      <div class="enemy-intent ${ic}">${it}</div>
      ${portraitHTML}
      ${enemy.block>0?`<div class="enemy-block-indicator">🛡${enemy.block}</div>`:''}
      <div class="enemy-hp-row">
        <div class="enemy-hp-bar"><div class="enemy-hp-fill" style="width:${(enemy.hp/enemy.maxHp)*100}%"></div></div>
        <div class="enemy-hp-text">${enemy.hp}/${enemy.maxHp}</div>
      </div>
      <div class="enemy-status-effects">
        ${enemy.vulnerable>0?'<span class="status-icon status-vulnerable">'+t('status_vuln')+enemy.vulnerable+'</span>':''}
        ${enemy.weak>0?'<span class="status-icon status-weak">'+t('status_weak')+enemy.weak+'</span>':''}
        ${(enemy.strength||0)>0?'<span class="status-icon status-strength">'+t('status_str')+enemy.strength+'</span>':''}
        ${(enemy._puns||[]).map(pn => `<span class="status-icon status-pun" title="${(PUN_STATUS[pn]||{}).label||pn}">${(PUN_STATUS[pn]||{}).label||pn}</span>`).join('')}
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
  // 驱虎吞狼:句中已有敌名卡且它在谓语之前(= 它是主语),此时点第二个敌人
  // 是在组「敌A V 敌B」——追加为宾语,不再互斥替换。
  const vIdx = G.sentence.findIndex(c => c.pos === 'verb' || c.pos === 'special');
  const firstEnemyAt = G.sentence.findIndex(c => c._isEnemyTarget);
  const eveBuilding = vIdx >= 0 && firstEnemyAt >= 0 && firstEnemyAt < vIdx;
  if (hasHeConn || hasComma || eveBuilding) {
    G.sentence = G.sentence.filter(c => !c._isSelfTarget);
  } else {
    G.sentence = G.sentence.filter(c => !c._isEnemyTarget && !c._isSelfTarget);
  }
  const card = {
    word: enemyName(enemy), pos: 'object', cost: 0,
    _isEnemyTarget: true, _enemyIdx: idx,
    id: 'enemy_target_' + idx + '_' + Math.random().toString(36).substr(2, 5),
  };
  if (!tryAddCard(card)) { renderCombat(); return; }
  playSFX('card');
  renderCombat();
  if (G.isTutorial) document.dispatchEvent(new CustomEvent('tutorial:sentence-changed'));
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
  const visualWeight = displayCards.reduce((sum, card) => {
    const word = String(card?.word || '');
    return sum + Math.max(1, Math.min(4, [...word].length));
  }, 0);
  container.dataset.density = displayCards.length >= 7 || visualWeight >= 13
    ? 'dense'
    : displayCards.length >= 5 || visualWeight >= 9
      ? 'compact'
      : 'normal';

  const half = document.createElement('div');
  half.className = 'sentence-half';
  displayCards.forEach((card, idx) => {
    const wordEl = createSentenceWordEl(card, idx);
    // Only an explicit noun AFTER a transitive verb is its patient. A subject
    // ("我碎纸鬼"里的「我」 / "纸鬼碎"里的「纸鬼」) must never receive
    // the patient outline merely because it uses a target-shaped card.
    if (card._isEnemyTarget || card._isSelfTarget) {
      let clauseStart = 0;
      for (let i = idx - 1; i >= 0; i--) {
        if (displayCards[i]?.pos === 'punctuation'
            && (displayCards[i].punctType === 'comma' || displayCards[i].punctType === 'period')) {
          clauseStart = i + 1;
          break;
        }
      }
      const governingVerb = [...displayCards.slice(clauseStart, idx)]
        .reverse().find(c => c && (c.pos === 'verb' || c.pos === 'special'));
      if (governingVerb && governingVerb.valence !== 'intrans') {
        wordEl.classList.add('transitive-patient');
      }
    }
    half.appendChild(wordEl);
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
      dzEl.textContent = t('needWords');
    }
  } else {
    dzEl.textContent = '';
  }

  const sp = document.getElementById('sentence-score-preview');
  if (G.sentence.length > 0) {
    const validity = getSentenceValidity(G.sentence);
    G.sentenceValidity = validity;
    const summonCheck = validity.summon || null;
    if (!validity.ok) {
      G._previewEval = null;
      sp.innerHTML = `<span class="sp-chip sp-bad">✗ ${validity.reason}</span>`;
    } else if (summonCheck) {
      const eff = SUMMON_EFFECTS[summonCheck.summonName];
      sp.innerHTML = `<span class="sp-cost">${t('cost')}${getSentenceCost()}</span><span class="sp-chip sp-good">${eff.emoji} ${t('summon')}·${eff.name}</span><span class="sp-flavor">${eff.desc}</span>`;
    } else {
    const eval_ = evaluateSentence(G.sentence);
    G._previewEval = eval_ || null; // cache for puppets.js bubbles (stale during summon/empty — puppets guards those itself)
    if (eval_) {
      const ef = eval_.effects;
      // Outcome chips — one per effect, colored good/bad.
      const chips = [];
      const good = (t) => `<span class="sp-chip sp-good">${t}</span>`;
      const bad = (t) => `<span class="sp-chip sp-bad">${t}</span>`;
      if (ef.selfHarm) chips.push(bad(`💔${t('selfHarm')}${ef.selfHarmDmg}${ef.selfHarmBuff ? ` +${ef.selfHarmBuff}${t('strength')}` : ''}`));
      if (ef.damage > 0) chips.push(bad(`⚔️${ef.damage}`));
      if (ef.isQuestion) chips.push(good(`❓${t('weaken')}${ef.applyWeak}`));
      if (ef.block > 0) chips.push(good(`🛡${ef.block}`));
      if (ef.heal > 0) chips.push(good(`♥${ef.heal}`));
      if (ef.strengthGain > 0) chips.push(good(`↑${ef.strengthGain}${t('strength')}`));
      if (ef._enemyBlock?.amount > 0) chips.push(bad(`敌🛡${ef._enemyBlock.amount}`));
      if (ef._enemyHeal?.amount > 0) chips.push(bad(`敌♥${ef._enemyHeal.amount}`));
      if (ef._enemyStrength?.amount > 0) chips.push(bad(`敌↑${ef._enemyStrength.amount}${t('strength')}`));
      if (ef._enemyRest) chips.push(good('🛌停攻'));
      if (ef.draw > 0) chips.push(good(`📜${ef.draw}${t('cardUnit')}`));
      if (ef.multiTargetIndices && ef.multiTargetIndices.length > 1) chips.push(bad(`🎯×${ef.multiTargetIndices.length}`));
      if (ef.aoe) chips.push(bad(`🌊${t('aoe')}`));
      if (ef.ignoreBlock) chips.push(bad(`🗡${t('pierce')}`));
      if (ef.goldGain > 0) chips.push(good(`💰${ef.goldGain}`));
      if (ef._execute) chips.push(bad(`💀${t('execute')}`));
      if (ef._imperative) chips.push(bad(`🫵${t('imperative')}`));

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
          `<span class="sp-cost">${t('cost')}${getSentenceCost()}</span>` +
          chips.join('') +
          `<span class="sp-mult">✨×${eval_.totalMult.toFixed(2)}</span>` +
          excWarn +
        `</div>` +
        (allHits.length
          ? `<div class="sp-rules">${allHits.map(n => `<span class="sp-rule">${n}</span>`).join('')}</div>`
          : '');
    }
    } // close valid sentence else
  } else {
    G.sentenceValidity = getSentenceValidity([]);
    G._previewEval = null;
    sp.innerHTML = '';
  }
}

// On chant (施法): the build area stops being a card rack and becomes the
// finished line — the cards "fuse" into the spoken sentence while the chant
// animation plays. cards is the consumed sentence (G.sentence snapshot, taken
// before it was cleared). Replaced by the next renderSentenceSlots() once the
// score animation resolves and renderCombat() runs.
export function renderChantedSentence(cards) {
  const container = document.getElementById('sentence-slots-container');
  if (!container) return;
  const text = (cards || [])
    .map(c => c._isEnemyTarget ? getCardWord(c) : (c._isSelfTarget ? t('me') : getCardWord(c)))
    .join('');
  if (!text) return;
  container.innerHTML = `<div class="chanted-line">「${text}」</div>`;
}

export function createSentenceWordEl(card, idx) {
  const wrap = document.createElement('div');
  wrap.className = 'sentence-card-wrap';
  wrap.title = isEn() ? 'Tap to remove · drag to sort' : '点击取消·拖排序';
  wrap.dataset.sentenceIdx = String(idx);
  wrap.onclick = (e) => { e.stopPropagation(); removeSentenceWord(idx); };
  attachSentenceDrag(wrap);

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
        <div class="card-word">${t('me')}</div>
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
    : (Array.isArray(card.meanings) && card.meanings.length > 0 ? `⚪ ${t('defaultUse')}` : '');

  // Multi-meaning badge on the mini card
  if (Array.isArray(card.meanings) && card.meanings.length > 0) {
    const badge = document.createElement('div');
    badge.className = 'meaning-badge';
    badge.textContent = '💡';
    badge.title = t('multiHint');
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

export function renderHand() {
  renderTargetCards();
  syncTargetSelectability();

  const handTitle = document.querySelector('.hand-window-title span');
  if (handTitle) handTitle.textContent = `手牌 · ${G.hand.length} 项`;

  const handEl = document.getElementById('hand-cards');
  // FLIP:重渲前记住每张卡的旧位置(按卡对象跟踪),重渲后从旧位滑到新位,
  // 抽卡/弃牌后剩余手牌不再瞬移跳位。
  const prevRects = new Map();
  handEl.querySelectorAll('.card').forEach(el => {
    if (el._card) prevRects.set(el._card, el.getBoundingClientRect());
  });
  handEl.innerHTML = '';
  G.hand.forEach((card, idx) => {
    const el = createCardElement(card, idx);
    el._card = card;
    if (G.sentence.includes(card)) el.classList.add('in-sentence');
    // 韵脚预告:上一句有韵脚时,把"结尾用它就押上"的卡亮出 🎵 角标,
    // 让押韵从事后惊喜变成可主动追的策略。
    if (G.lastRhymeKey) {
      const k = getRhymeKey(getCardWord(card));
      if (k && checkRhyme(k, G.lastRhymeKey).rhymes) {
        const badge = document.createElement('div');
        badge.className = 'rhyme-badge';
        badge.textContent = '🎵';
        badge.title = t('rhymeHint');
        el.appendChild(badge);
      }
    }
    attachHandDrag(el, idx);
    handEl.appendChild(el);
  });
  // FLIP play 阶段:有旧位置的卡先钉回旧位,下一帧滑到新位。
  // in-sentence 卡有自己的 transform(淡出翻转),不参与,避免打架。
  // 位移量 ÷uiScale:屏幕量出的距离要换算成缩放画布内的 transform 值。
  const kScale = uiScale();
  handEl.querySelectorAll('.card').forEach(el => {
    if (el.classList.contains('in-sentence')) return;
    const old = el._card && prevRects.get(el._card);
    if (!old) return; // 新抽的卡走原有入场动画
    const now = el.getBoundingClientRect();
    const dx = (old.left - now.left) / kScale, dy = (old.top - now.top) / kScale;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    el.style.transition = 'none';
    el.style.transform = `translate(${dx}px, ${dy}px)`;
    el.style.animation = 'none'; // 老卡不重播入场淡入
    requestAnimationFrame(() => {
      el.style.transition = 'transform 260ms cubic-bezier(0.2, 0.8, 0.3, 1)';
      el.style.transform = '';
      setTimeout(() => { el.style.transition = ''; el.style.animation = ''; }, 300);
    });
  });
}

// Status badges (易伤/弱/力/盾/pun) shown ON a target card — travels with the
// card, so the立绘 column never clips them. `obj` = G (player) or an enemy.
function targetStatusHTML(obj) {
  if (!obj) return '';
  const b = [];
  if (obj.vulnerable > 0) b.push(`<span class="tgt-st tgt-vuln">${t('status_vuln')}${obj.vulnerable}</span>`);
  if (obj.weak > 0) b.push(`<span class="tgt-st tgt-weak">${t('status_weak')}${obj.weak}</span>`);
  if (obj.strength > 0) b.push(`<span class="tgt-st tgt-str">${t('status_str')}${obj.strength}</span>`);
  if (obj.block > 0) b.push(`<span class="tgt-st tgt-block">${t('status_block')}${obj.block}</span>`);
  (obj._puns || []).forEach(pn => {
    const lbl = (PUN_STATUS[pn] || {}).label || pn;
    b.push(`<span class="tgt-st tgt-pun" title="${lbl}">${lbl}</span>`);
  });
  if (obj.stunned) b.push(`<span class="tgt-st tgt-stun">💤</span>`);
  return b.length ? `<div class="tgt-status">${b.join('')}</div>` : '';
}

// 我 target card sits at the LEFT of the hand row, enemy target cards at the
// RIGHT end (#target-cards-enemy) — kept apart so they're not confused. Click to
// pick that target. Each carries its own status badges, read right where you act.
function renderTargetCards() {
  const slot = document.getElementById('target-cards');
  const enemySlot = document.getElementById('target-cards-enemy');
  if (!slot) return;
  slot.innerHTML = '';
  if (enemySlot) enemySlot.innerHTML = '';

  // 我 / I (left)
  const woKey = getSelfCardKey();
  const woDef = WORD_DEFS[woKey];
  const woCard = { ...woDef, key: woKey, upgraded: false, cost: 0, _isFixedCard: true, id: 'tgt_wo' };
  const woEl = createCardElement(woCard, null, { noClick: true });
  woEl.classList.add('target-card', 'target-self');
  const woPin = document.createElement('div'); woPin.className = 'card-pin'; woPin.textContent = t('me'); woEl.appendChild(woPin);
  woEl.insertAdjacentHTML('beforeend', targetStatusHTML(G));
  if (G.sentence.some(c => c._isFixedWo)) woEl.classList.add('in-sentence');
  woEl.style.cursor = 'pointer';
  woEl.onclick = () => addSelfTarget();
  slot.appendChild(woEl);

  // each living enemy (right end)
  const enemyContainer = enemySlot || slot;
  G.enemies.forEach((enemy, idx) => {
    if (!enemy || enemy.hp <= 0) return;
    const eCard = { word: enemyName(enemy), pos: 'object', cost: 0, _isFixedCard: true, id: 'tgt_enemy_' + idx };
    const eEl = createCardElement(eCard, null, { noClick: true });
    eEl.classList.add('target-card', 'target-enemy');
    const ePin = document.createElement('div'); ePin.className = 'card-pin'; ePin.textContent = t('enemy'); eEl.appendChild(ePin);
    eEl.insertAdjacentHTML('beforeend', targetStatusHTML(enemy));
    if (G.sentence.some(c => c._isEnemyTarget && c._enemyIdx === idx)) eEl.classList.add('in-sentence');
    eEl.style.cursor = 'pointer';
    eEl.onclick = () => addEnemyTarget(idx, enemy);
    enemyContainer.appendChild(eEl);
  });
}

export function addSelfTarget() {
  if (G.sentence.some(c => c._isFixedWo)) return;
  const woKey = getSelfCardKey();
  const woDef = WORD_DEFS[woKey];
  const card = { ...woDef, key: woKey, upgraded: false, cost: 0, _isFixedWo: true, id: 'fixed_wo_' + Math.random().toString(36).substr(2, 5) };
  if (!tryAddCard(card)) { renderCombat(); return; }
  playSFX('card');
  renderCombat();
  if (G.isTutorial) document.dispatchEvent(new CustomEvent('tutorial:sentence-changed'));
}

// Clicking the player portrait also still selects 我 (kept as a bonus). Mark
// standees as "selected" when their target is in the sentence.
function syncTargetSelectability() {
  const p = document.getElementById('player-char-card');
  if (p) p.classList.toggle('target-selected', G.sentence.some(c => c._isFixedWo));
}

export function createCardElement(card, handIndex, opts={}) {
  const div = document.createElement('div');
  div.className = `card pos-${card.pos}`;
  if (card.key) div.dataset.cardKey = card.key;
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
    ? `<div class="meaning-badge" title="${t('multiCard')}">💡</div>`
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

function appendEmphasizedNumbers(element, text) {
  element.replaceChildren();
  const parts = String(text || '').split(/([+\-−]?\d+(?:\.\d+)?(?:%|点|层|回合|张|次)?)/g);
  parts.forEach((part) => {
    if (!part) return;
    if (/^[+\-−]?\d/.test(part)) {
      const value = document.createElement('strong');
      value.className = 'tt-number';
      value.textContent = part;
      element.appendChild(value);
    } else {
      element.appendChild(document.createTextNode(part));
    }
  });
}

function renderTooltipContent(tt, card) {
  const posNames = t('posNames');
  const rarityNames = t('rarityNames');
  const type = tt.querySelector('.tt-type');
  type.replaceChildren(document.createTextNode(`${posNames[card.pos]} · ${rarityNames[card.rarity] || card.rarity} · `));
  const cost = document.createElement('strong');
  cost.className = 'tt-cost';
  cost.textContent = `${t('cost')}${getEffectiveCost(card)}`;
  type.appendChild(cost);
  appendEmphasizedNumbers(tt.querySelector('.tt-desc'), getCardDesc(card));
}

export function showTooltip(e, card) {
  const tt = document.getElementById('tooltip');
  renderTooltipContent(tt, card);
  tt.style.display = 'block';
  tt.style.transform = '';
  // Measure after content is set so height is accurate.
  // tooltip 在 #game 缩放画布内(fixed 锚定到画布)→ 全程用设计坐标,
  // 边界钳制用 DESIGN_W/H 而不是窗口尺寸。
  const ttRect = toGameRect(tt.getBoundingClientRect());
  const r = toGameRect(e.currentTarget.getBoundingClientRect());
  // Default: above the card, horizontally centered on it
  let left = r.left + r.width / 2 - ttRect.width / 2;
  let top = r.top - ttRect.height - 10;
  // If above would clip, fall back to below
  if (top < 5) top = r.top + r.height + 10;
  // Clamp horizontal
  if (left + ttRect.width > DESIGN_W - 5) left = DESIGN_W - ttRect.width - 5;
  if (left < 5) left = 5;
  tt.style.left = left + 'px';
  tt.style.top = top + 'px';
}

function showTooltipMobile(card) {
  const tt = document.getElementById('tooltip');
  renderTooltipContent(tt, card);
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
