import { G, META, saveMeta } from './state.js';

let active = false;
let cursor = 0;
let waitingFor = null;
let onComplete = null;
let typeTimer = null;

const SCRIPT = [
  {
    phase: 'awakening', speaker: '旁白',
    text: '晚自习结束后，林夕拐进了一条不在平面图上的走廊。窗外仍是傍晚，墙上的钟一直停在 18:47。',
  },
  {
    phase: 'awakening', speaker: '林夕',
    text: '这是哪里……三楼应该没有这么长。空气里还有刚下过雨的味道。',
  },
  {
    phase: 'awakening', speaker: '校内广播',
    text: '请还没有找到教室的同学，沿着蓝色灯光慢慢向前。重复：不用着急。',
  },
  {
    phase: 'awakening', speaker: '林夕',
    text: '这段广播……好像在哪里听过。可学校从来没有蓝色的指示灯。',
  },
  {
    phase: 'encounter', speaker: '旁白',
    text: '黑板上的粉笔字轻轻飘了下来。戏台上留下两道半透明的轮廓，像在等一句话把它们写实。',
  },
  {
    phase: 'encounter', speaker: '林夕',
    text: '那位同学也被困在句子里……它在等我先写下“谁”要行动。',
  },
  {
    phase: 'encounter', speaker: '纸片同学', portrait: '/canjuguai.png',
    text: '……别怕。我只记得一件事：在这里，完整的句子会变成真的。',
  },
  {
    phase: 'self', speaker: '？？？', waitFor: 'self',
    text: '先写下「我」。在这条走廊里，完整的句子才知道该往哪里去。',
    prompt: '点击手牌区最左侧的「我」',
  },
  {
    phase: 'verb', speaker: '林夕', waitFor: 'verb',
    text: '它在等一个动作……如果文字真能伤到它——',
    prompt: '从手牌中选择「斩」',
  },
  {
    phase: 'target', speaker: '？？？', waitFor: 'target',
    text: '再点中那个纸片同学。句子需要知道，你想把动作送向谁。',
    prompt: '选择右侧的纸片同学词牌',
  },
  {
    phase: 'chant', speaker: '林夕', waitFor: 'chant',
    text: '「我斩……」句子完成了。只差把它读出来。',
    prompt: '点击「吟诵」',
  },
  {
    phase: 'aftermath', speaker: '旁白',
    text: '纸片同学散成几枚发亮的字，顺着地面游向走廊深处。远处传来一声很轻的放学铃。',
  },
  {
    phase: 'aftermath', speaker: '林夕', final: true,
    text: '文字不是消失了，只是去了句子指向的地方。也许这所学校正在做一个很长的梦。',
  },
];

function ensureLayer() {
  let layer = document.getElementById('tutorial-layer');
  if (layer) return layer;
  layer = document.createElement('div');
  layer.id = 'tutorial-layer';
  layer.innerHTML = `
    <button class="tutorial-skip" type="button">跳过教学</button>
    <div class="tutorial-dialogue os-window">
      <div class="os-window-title"><span>夜自习.log</span></div>
      <div class="tutorial-dialogue-body">
        <img class="tutorial-portrait" src="/main_characters/girl/00.png" alt="林夕">
        <div class="tutorial-copy">
          <div class="tutorial-speaker"></div>
          <div class="tutorial-text"></div>
          <div class="tutorial-prompt"></div>
        </div>
        <button class="tutorial-next" type="button">继续 ▸</button>
      </div>
    </div>`;
  document.getElementById('game').appendChild(layer);
  layer.querySelector('.tutorial-next').addEventListener('click', (event) => {
    event.stopPropagation();
    advance();
  });
  layer.querySelector('.tutorial-skip').addEventListener('click', (event) => {
    event.stopPropagation();
    finishTutorial();
  });
  return layer;
}

function typeText(el, text) {
  if (typeTimer) clearInterval(typeTimer);
  el.textContent = '';
  let index = 0;
  typeTimer = setInterval(() => {
    el.textContent += text[index] || '';
    index += 1;
    if (index >= text.length) {
      clearInterval(typeTimer);
      typeTimer = null;
    }
  }, 22);
}

function focusCurrentAction(phase) {
  document.querySelectorAll('.tutorial-focus').forEach((el) => el.classList.remove('tutorial-focus'));
  const selector = {
    self: '#target-cards .target-self',
    verb: '#hand-cards .card[data-card-key="zhan"]',
    target: '#target-cards-enemy .target-enemy',
    chant: '#chant-btn',
  }[phase];
  if (!selector) return;
  requestAnimationFrame(() => {
    const target = document.querySelector(selector);
    if (target) target.classList.add('tutorial-focus');
  });
}

function syncTutorialEntities() {
  if (!active) return;
  const hasSelf = G.sentence.some((card) => card._isFixedWo || card._isSelfTarget);
  const hasEnemy = G.sentence.some((card) => card._isEnemyTarget);
  const combat = document.getElementById('combat-screen');
  if (combat) combat.dataset.tutorialActors = `${hasSelf ? 'player' : 'empty'}-${hasEnemy ? 'enemy' : 'empty'}`;
  ['#puppet-player', '#stage-player', '#battle-sprite-player'].forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.style.visibility = 'visible';
  });
  ['#puppet-enemy', '#stage-enemy', '#battle-sprite-enemy'].forEach((selector) => {
    const el = document.querySelector(selector);
    if (el) el.style.visibility = 'visible';
  });
}

function showEntry(index) {
  const entry = SCRIPT[index];
  if (!entry) {
    finishTutorial();
    return;
  }
  cursor = index;
  waitingFor = entry.waitFor || null;
  const layer = ensureLayer();
  const combat = document.getElementById('combat-screen');
  combat.classList.add('tutorial-mode');
  combat.dataset.tutorialStep = entry.phase;
  layer.classList.add('active');
  layer.classList.remove('watching-attack');
  layer.querySelector('.tutorial-speaker').textContent = entry.speaker;
  layer.classList.toggle('speaker-linxi', entry.speaker === '林夕');
  const portrait = layer.querySelector('.tutorial-portrait');
  const portraitSrc = entry.portrait || (entry.speaker === '林夕' ? '/main_characters/girl/00.png' : '');
  portrait.hidden = !portraitSrc;
  if (portraitSrc) {
    portrait.dataset.character = entry.speaker === '林夕' ? 'girl' : 'paper-classmate';
    portrait.src = portraitSrc;
    portrait.alt = entry.speaker;
  } else {
    delete portrait.dataset.character;
  }
  typeText(layer.querySelector('.tutorial-text'), entry.text);
  layer.querySelector('.tutorial-prompt').textContent = entry.prompt || '';
  const next = layer.querySelector('.tutorial-next');
  next.hidden = Boolean(entry.waitFor);
  next.textContent = entry.final ? '沿着蓝光继续 ▸' : '继续 ▸';
  focusCurrentAction(entry.phase);
  syncTutorialEntities();
}

function advance() {
  if (!active || waitingFor) return;
  const entry = SCRIPT[cursor];
  if (entry?.final) {
    finishTutorial();
    return;
  }
  showEntry(cursor + 1);
}

function handleSentenceChanged() {
  if (!active || !waitingFor) return;
  const hasSelf = G.sentence.some((card) => card._isFixedWo);
  const hasVerb = G.sentence.some((card) => card.key === 'zhan' || card.pos === 'verb');
  const hasTarget = G.sentence.some((card) => card._isEnemyTarget);
  syncTutorialEntities();
  if (waitingFor === 'self' && hasSelf) showEntry(cursor + 1);
  else if (waitingFor === 'verb' && hasVerb) showEntry(cursor + 1);
  else if (waitingFor === 'target' && hasTarget) showEntry(cursor + 1);
  else focusCurrentAction(SCRIPT[cursor]?.phase);
}

function handleChant() {
  if (!active || waitingFor !== 'chant') return;
  waitingFor = 'victory';
  const layer = ensureLayer();
  layer.classList.add('watching-attack');
  document.getElementById('combat-screen').dataset.tutorialStep = 'attack';
}

function handleVictory() {
  if (!active || waitingFor !== 'victory') return;
  showEntry(cursor + 1);
}

function cleanup() {
  if (typeTimer) clearInterval(typeTimer);
  typeTimer = null;
  document.querySelectorAll('.tutorial-focus').forEach((el) => el.classList.remove('tutorial-focus'));
  const combat = document.getElementById('combat-screen');
  combat?.classList.remove('tutorial-mode');
  if (combat) delete combat.dataset.tutorialStep;
  if (combat) delete combat.dataset.tutorialActors;
  ['#puppet-player', '#stage-player', '#battle-sprite-player', '#puppet-enemy', '#stage-enemy', '#battle-sprite-enemy']
    .forEach((selector) => {
      const el = document.querySelector(selector);
      if (el) el.style.removeProperty('visibility');
    });
  document.getElementById('tutorial-layer')?.remove();
}

function finishTutorial() {
  if (!active) return;
  active = false;
  waitingFor = null;
  META.tutorialCompleted = true;
  G.isTutorial = false;
  saveMeta();
  cleanup();
  const callback = onComplete;
  onComplete = null;
  if (callback) callback();
}

export function beginTutorial(callback) {
  active = true;
  cursor = 0;
  waitingFor = null;
  onComplete = callback || null;
  showEntry(0);
}

export function isTutorialActive() {
  return active;
}

document.addEventListener('tutorial:sentence-changed', handleSentenceChanged);
document.addEventListener('tutorial:chant', handleChant);
document.addEventListener('tutorial:victory', handleVictory);
