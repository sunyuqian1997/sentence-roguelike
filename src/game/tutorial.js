import { G, META, saveMeta } from './state.js';

let active = false;
let cursor = 0;
let waitingFor = null;
let onComplete = null;
let typeTimer = null;

const SCRIPT = [
  {
    phase: 'awakening', speaker: '旁白',
    text: '晚自习结束后，林夕拐进了一条不在平面图上的走廊。墙上的钟停在 18:47。',
  },
  {
    phase: 'awakening', speaker: '林夕',
    text: '这是哪里……三楼应该没有这么长。',
  },
  {
    phase: 'awakening', speaker: '校内广播',
    text: '请未登记的学生，立刻交出自己的名字。重复：请交出自己的名字。',
  },
  {
    phase: 'awakening', speaker: '林夕',
    text: '广播室早就拆了。谁在说话？',
  },
  {
    phase: 'encounter', speaker: '旁白',
    text: '黑板上的粉笔字一笔一画地爬了下来。它没有脸，却穿着和她一样的校服。',
  },
  {
    phase: 'encounter', speaker: '林夕',
    text: '刚才墙上的字……变成了东西。',
  },
  {
    phase: 'self', speaker: '？？？', waitFor: 'self',
    text: '先写下「我」。没有主语的句子，会把施术者也一起抹掉。',
    prompt: '点击手牌区最左侧的「我」',
  },
  {
    phase: 'verb', speaker: '林夕', waitFor: 'verb',
    text: '它在等一个动作……如果文字真能伤到它——',
    prompt: '从手牌中选择「斩」',
  },
  {
    phase: 'target', speaker: '？？？', waitFor: 'target',
    text: '点中它的名字。被准确命名的东西，才会被句子捕获。',
    prompt: '选择右侧的怪物词牌',
  },
  {
    phase: 'chant', speaker: '林夕', waitFor: 'chant',
    text: '「我斩……」句子完成了。只差把它读出来。',
    prompt: '点击「发行文字」',
  },
  {
    phase: 'aftermath', speaker: '旁白',
    text: '那东西被自己的名字钉回墙里。走廊深处，成百上千张嘴同时合上。',
  },
  {
    phase: 'aftermath', speaker: '林夕', final: true,
    text: '文字不是被写出来的……是被放出来的。我要找到出口，也要弄清是谁把它们关在学校里。',
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
        <img class="tutorial-portrait" src="/lqz.png" alt="林夕">
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
  typeText(layer.querySelector('.tutorial-text'), entry.text);
  layer.querySelector('.tutorial-prompt').textContent = entry.prompt || '';
  const next = layer.querySelector('.tutorial-next');
  next.hidden = Boolean(entry.waitFor);
  next.textContent = entry.final ? '走向走廊深处 ▸' : '继续 ▸';
  focusCurrentAction(entry.phase);
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
