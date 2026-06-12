import { G } from '../game/state.js';
import { WORD_DEFS, getCardWord, getCardDesc } from '../data/cards.js';
import { t, isEn } from '../i18n.js';
import { showFloatingText, getPosColor } from '../utils.js';
import { playSFX } from '../game/audio.js';
import { getEnemyPortraitSVG } from './svgArt.js';
import { detectDuizhang, detectSummon, SUMMON_EFFECTS, evaluateSentence, checkExclamationPosition } from '../game/sentence.js';
import { PUN_STATUS } from '../game/poetics.js';
import { resolveMeaning } from '../game/meanings.js';
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
  updatePuppets();
}

// Update puppet poses based on current sentence — no DOM rebuild, just
// data-pose attribute changes so CSS transitions handle smoothness.
function updatePuppets() {
  const playerEl = document.getElementById('puppet-player');
  const enemyEl = document.getElementById('puppet-enemy');
  if (!playerEl || !enemyEl) return;

  const sentence = G.sentence || [];
  const hasEnemyTarget = sentence.some(c => c._isEnemyTarget);
  const verbs = sentence.filter(c => c && c.pos === 'verb');
  const lastVerb = verbs[verbs.length - 1];

  // Detect active pun via meanings
  let activePunTag = null;
  for (let i = 0; i < sentence.length; i++) {
    const m = resolveMeaning(sentence[i], sentence, i);
    if (m && m.pun) { activePunTag = m.pun.tag; break; }
    if (sentence[i] && sentence[i].pun && !Array.isArray(sentence[i].meanings)) {
      // Only count direct pun if no copula context (would be caught above otherwise)
      const hasCopula = sentence.slice(0, i).some(c => c && c.copulaConn);
      if (hasCopula) { activePunTag = sentence[i].pun.tag; break; }
    }
  }

  // Default poses
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

  if (activePunTag) {
    const punToPose = {
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
    const cfg = punToPose[activePunTag];
    if (cfg) {
      enemyPose = cfg.pose;
      enemyEmoji = cfg.emoji;
    }
  }

  // Laughter motif detection — both sides dazed
  const motifText = sentence.map(c => (c && c.word) || '').join('');
  if (/欢笑|哈哈|沉溺|暂停|深度思考/.test(motifText)) {
    enemyPose = 'dazed';
    enemyEmoji = '😂';
  }

  // Don't override if we're mid-chant
  if (playerEl.dataset.chanting === '1') return;
  if (playerEl.dataset.pose !== playerPose) playerEl.dataset.pose = playerPose;
  if (enemyEl.dataset.pose !== enemyPose) enemyEl.dataset.pose = enemyPose;
  const playerEmojiEl = playerEl.querySelector('.puppet-emoji');
  const enemyEmojiEl = enemyEl.querySelector('.puppet-emoji');
  if (playerEmojiEl && playerEmojiEl.textContent !== playerEmoji) playerEmojiEl.textContent = playerEmoji;
  if (enemyEmojiEl && enemyEmojiEl.textContent !== enemyEmoji) enemyEmojiEl.textContent = enemyEmoji;
}

// Triggered from chantSentence — runs a short stage-fight sequence:
// player charges → strikes / shields / heals based on effects, enemy reacts.
// Effects param is the evaluator result.effects (may be undefined for summons).
export function playChantPuppetAnim(effects) {
  const playerEl = document.getElementById('puppet-player');
  const enemyEl = document.getElementById('puppet-enemy');
  if (!playerEl || !enemyEl) return;
  playerEl.dataset.chanting = '1';
  enemyEl.dataset.chanting = '1';

  const isAttack = !!(effects && (effects.damage > 0 || effects.aoe));
  const isHeal = !!(effects && effects.heal > 0 && !isAttack);
  const isBlock = !!(effects && effects.block > 0 && !isAttack);
  const punTag = (effects && effects._predicates && effects._predicates.length > 0)
    ? effects._predicates[0].pun.tag : null;
  const motif = (effects && effects._motifTriggers && effects._motifTriggers.length > 0)
    ? effects._motifTriggers[0].motif.id : null;

  // Sequence
  // t=0: wind-up
  // t=120: charge (translateX) + appropriate pose
  // t=420: strike → enemy hit / pun-pose / motif effect
  // t=720: settle
  // t=1000: back to normal idle resolution
  const seq = [];

  // 0: wind-up — slight crouch
  seq.push({ at: 0, do: () => {
    playerEl.style.transition = 'transform 0.15s ease-out';
    playerEl.style.transform = 'translateY(2px) scaleY(0.95)';
    enemyEl.style.transition = 'transform 0.15s ease-out';
  }});

  // 120: charge or strike pose
  seq.push({ at: 120, do: () => {
    playerEl.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
    if (isAttack) {
      playerEl.style.transform = 'translateX(80px)'; // dash toward enemy
      playerEl.dataset.pose = 'attack';
    } else if (isBlock) {
      playerEl.style.transform = 'translateY(0)';
      playerEl.dataset.pose = 'defend';
    } else if (isHeal) {
      playerEl.style.transform = 'translateY(-3px)';
      playerEl.dataset.pose = 'heal';
    } else {
      playerEl.style.transform = 'translateX(40px)';
      playerEl.dataset.pose = 'attack';
    }
  }});

  // 420: impact
  seq.push({ at: 420, do: () => {
    if (isAttack) {
      enemyEl.style.transition = 'transform 0.25s ease-out';
      enemyEl.style.transform = 'translateX(8px) rotate(4deg)';
      enemyEl.dataset.pose = 'hit';
      // ink-splash on enemy
      try {
        const r = enemyEl.getBoundingClientRect();
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          // VFX is imported elsewhere; emit a CSS shake via class
          enemyEl.classList.remove('puppet-impact');
          void enemyEl.offsetWidth;
          enemyEl.classList.add('puppet-impact');
        }
      } catch (e) { /* ignore */ }
    }
    if (punTag) {
      const punToPose = {
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
      const cfg = punToPose[punTag];
      if (cfg) {
        enemyEl.dataset.pose = cfg.pose;
        const ee = enemyEl.querySelector('.puppet-emoji');
        if (ee) ee.textContent = cfg.emoji;
      }
    }
    if (motif === 'laughter_pause') {
      enemyEl.dataset.pose = 'dazed';
      const ee = enemyEl.querySelector('.puppet-emoji');
      if (ee) ee.textContent = '😂';
    }
  }});

  // 720: return
  seq.push({ at: 720, do: () => {
    playerEl.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
    playerEl.style.transform = '';
    enemyEl.style.transition = 'transform 0.3s ease-out';
    enemyEl.style.transform = '';
  }});

  // 1000: clear chant flag so updatePuppets can resume
  seq.push({ at: 1000, do: () => {
    playerEl.style.transform = '';
    enemyEl.style.transform = '';
    playerEl.dataset.chanting = '';
    enemyEl.dataset.chanting = '';
    // Don't reset pose — updatePuppets will handle (sentence is empty after chant)
    playerEl.dataset.pose = 'idle';
    enemyEl.classList.remove('puppet-impact');
  }});

  seq.forEach(({ at, do: fn }) => setTimeout(fn, at));
}

// Triggered from enemyTurn — enemy is the actor, player reacts.
// intent shape from enemies.js: { type:'attack'|'defend'|'buff'|'debuff'|'special', value, hits?, label? }
export function playEnemyPuppetAnim(intent, opts) {
  opts = opts || {};
  const playerEl = document.getElementById('puppet-player');
  const enemyEl = document.getElementById('puppet-enemy');
  if (!playerEl || !enemyEl) return;
  playerEl.dataset.chanting = '1';
  enemyEl.dataset.chanting = '1';

  // Stunned/sleeping enemies — just yawn + return
  if (opts.stunned) {
    enemyEl.dataset.pose = 'dazed';
    const ee = enemyEl.querySelector('.puppet-emoji');
    if (ee) ee.textContent = '💤';
    setTimeout(() => {
      enemyEl.dataset.pose = 'idle';
      if (ee) ee.textContent = '';
      playerEl.dataset.chanting = '';
      enemyEl.dataset.chanting = '';
    }, 600);
    return;
  }

  const t = (intent && intent.type) || 'attack';
  const dmg = intent && intent.value || 0;
  const hits = intent && intent.hits || 1;
  const heavy = dmg >= 12 || hits >= 2;

  // 0: wind-up
  setTimeout(() => {
    enemyEl.style.transition = 'transform 0.15s ease-out';
    enemyEl.style.transform = 'translateY(2px) scaleY(0.95)';
  }, 0);

  // 120: enemy dashes / poses
  setTimeout(() => {
    enemyEl.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
    if (t === 'attack') {
      enemyEl.style.transform = 'translateX(-80px)';
      enemyEl.dataset.pose = 'attack';
    } else if (t === 'defend') {
      enemyEl.style.transform = 'translateY(0)';
      enemyEl.dataset.pose = 'defend';
    } else if (t === 'buff') {
      enemyEl.style.transform = 'translateY(-4px) scale(1.06)';
      enemyEl.dataset.pose = 'heal'; // reuse heal pose for buff glow
      enemyEl.style.filter = 'drop-shadow(0 0 8px var(--gold))';
    } else if (t === 'debuff') {
      enemyEl.style.transform = 'translateX(-40px)';
      enemyEl.dataset.pose = 'attack';
      enemyEl.style.filter = 'drop-shadow(0 0 8px var(--purple))';
    } else if (t === 'special') {
      enemyEl.style.transform = 'translateY(-4px)';
      enemyEl.dataset.pose = 'attack';
      enemyEl.style.filter = 'drop-shadow(0 0 10px var(--cyan))';
    }
  }, 120);

  // 420: impact on player (or buff resolves)
  setTimeout(() => {
    if (t === 'attack') {
      playerEl.style.transition = 'transform 0.25s ease-out';
      playerEl.style.transform = 'translateX(-8px) rotate(-4deg)';
      playerEl.dataset.pose = 'hit';
      playerEl.classList.remove('puppet-impact');
      void playerEl.offsetWidth;
      playerEl.classList.add('puppet-impact');
      if (heavy) {
        playerEl.style.transform = 'translateX(-14px) rotate(-7deg) scale(0.96)';
      }
    } else if (t === 'debuff') {
      playerEl.dataset.pose = 'dazed';
      const pe = playerEl.querySelector('.puppet-emoji');
      if (pe) pe.textContent = '😵';
    }
  }, 420);

  // 720: return
  setTimeout(() => {
    enemyEl.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
    enemyEl.style.transform = '';
    enemyEl.style.filter = '';
    playerEl.style.transition = 'transform 0.3s ease-out';
    playerEl.style.transform = '';
  }, 720);

  // 1000: clear
  setTimeout(() => {
    enemyEl.style.transform = '';
    enemyEl.style.filter = '';
    playerEl.style.transform = '';
    playerEl.classList.remove('puppet-impact');
    const pe = playerEl.querySelector('.puppet-emoji');
    if (pe) pe.textContent = '';
    playerEl.dataset.chanting = '';
    enemyEl.dataset.chanting = '';
    // Sentence is empty after end-turn, so updatePuppets restores idle
  }, 1000);
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

  // Resolve active meaning given full sentence context
  const activeMeaning = resolveMeaning(card, G.sentence, idx);
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
