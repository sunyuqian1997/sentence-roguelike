import { G } from './state.js';

let audioCtx = null, masterGain = null, musicInterval = null;

// ---- Real MP3 BGM ----
// Drop files in public/bgm/ and reference by the absolute "/bgm/..." path.
// If a file is missing/unplayable we fall back to the synthesized loop, so the
// game never breaks when a track isn't provided yet.
//   public/bgm/ambient.mp3  地图/休息/平时
//   public/bgm/combat.mp3   普通战斗
//   public/bgm/boss.mp3     Boss 战
const BGM_TRACKS = {
  ambient: '/bgm/ambient.mp3',
  combat: '/bgm/combat.mp3',
  boss: '/bgm/boss.mp3',
};
const BGM_VOLUME = 0.4;
let bgmEl = null;        // current <audio>
let bgmKey = null;       // which track is playing

// 线性音量渐变(<audio> 无原生 fade)。返回 interval id 以便取消。
function fadeAudio(el, from, to, ms, onDone) {
  const steps = 12, dt = ms / steps;
  let i = 0;
  el.volume = Math.max(0, Math.min(1, from));
  const iv = setInterval(() => {
    i++;
    try { el.volume = Math.max(0, Math.min(1, from + (to - from) * (i / steps))); } catch (e) { /* detached */ }
    if (i >= steps) { clearInterval(iv); if (onDone) onDone(); }
  }, dt);
  return iv;
}

// Play an MP3 track for `key`. If the file is missing/blocked, run `fallback`
// (the synthesized loop) instead — so the game always has music.
// 换曲走 500ms crossfade:旧轨淡出后释放,新轨从 0 淡入,场景切换不再硬切。
function playBgmTrack(key, fallback) {
  const src = BGM_TRACKS[key];
  if (bgmEl && bgmKey === key && !bgmEl.paused) return; // already on
  // Stop the synth loop NOW so it never layers under the mp3 while it loads.
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  const old = bgmEl;
  if (old) {
    bgmEl = null; bgmKey = null;
    fadeAudio(old, old.volume, 0, 500, () => { try { old.pause(); old.src = ''; } catch (e) { /* ignore */ } });
  }
  const el = new Audio(src);
  el.loop = true;
  el.volume = 0;
  bgmEl = el; bgmKey = key;
  const useFallback = () => {
    if (bgmEl === el) { stopBgmTrack(); }
    if (fallback) fallback();
  };
  el.addEventListener('error', useFallback, { once: true });
  const fadeIn = () => { if (!G.muted && bgmEl === el) fadeAudio(el, 0, BGM_VOLUME, 500); };
  const p = el.play();
  if (p && p.then) p.then(fadeIn).catch(useFallback); // autoplay blocked → synth
  else fadeIn();
}

// ---- 胜利小调(Maker text_to_music 生成的 10s 古筝短曲) ----
// 结算时压低当前 BGM 播一次,放完恢复;文件缺失/被拦则静默跳过。
export function playVictoryJingle() {
  if (G.muted) return;
  const el = new Audio('/bgm/victory.mp3');
  el.volume = 0.5;
  const prev = bgmEl;
  const prevVol = prev ? prev.volume : null;
  if (prev) fadeAudio(prev, prev.volume, 0.06, 250);
  const restore = () => {
    if (prev && prevVol != null && bgmEl === prev) fadeAudio(prev, prev.volume, G.muted ? 0 : BGM_VOLUME, 600);
  };
  el.addEventListener('ended', restore, { once: true });
  el.addEventListener('error', restore, { once: true });
  const p = el.play();
  if (p && p.catch) p.catch(restore);
}

function stopBgmTrack() {
  if (bgmEl) { try { bgmEl.pause(); bgmEl.src = ''; } catch (e) { /* ignore */ } }
  bgmEl = null; bgmKey = null;
}

export function initAudio() {
  if (audioCtx) return;
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.12;
  masterGain.connect(audioCtx.destination);
}

export function toggleMute() {
  G.muted = !G.muted;
  document.getElementById('mute-btn').textContent = G.muted ? '🔇' : '♪';
  if (masterGain) masterGain.gain.value = G.muted ? 0 : 0.12;
  if (bgmEl) bgmEl.volume = G.muted ? 0 : BGM_VOLUME;
}

function playNote(freq, dur, type, t, gain) {
  if (!audioCtx) return;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type || 'sine';
  o.frequency.value = freq;
  // 短促的线性 attack 让每个音有"音头"——直接从峰值起跳的包络听起来
  // 像廉价 MIDI。极短音符按时长比例缩短 attack, 不吃掉主体。
  const atk = Math.min(0.015, dur * 0.25);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain || 0.2, t + atk);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  g.connect(masterGain);
  o.start(t);
  o.stop(t + dur);
}

export function stopMusic() {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  stopBgmTrack();
}

// Synth loop helper: clears any prior interval, then ticks notes on a timer.
function synthLoop(notes, period, perTick) {
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  if (!audioCtx) return;
  let i = 0;
  function tick() {
    if (!audioCtx || G.muted) return;
    perTick(notes[i % notes.length], audioCtx.currentTime);
    i++;
  }
  tick();
  musicInterval = setInterval(tick, period);
}

// 胜利小调播完后再起环境乐;若期间已有别的曲子(如又进战斗)则不打扰。
export function playAmbientMusicDeferred(ms = 10800) {
  setTimeout(() => { if (!bgmKey && !musicInterval) playAmbientMusic(); }, ms);
}

export function playAmbientMusic() {
  playBgmTrack('ambient', () => synthLoop(
    [261.6, 293.7, 329.6, 392.0, 440.0], 3500,
    (n, t) => { playNote(n, 3, 'sine', t, 0.06); playNote(n * 0.5, 3, 'triangle', t, 0.03); }
  ));
}

export function playCombatMusic() {
  playBgmTrack('combat', () => synthLoop(
    [196.0, 220.0, 261.6, 220.0, 196.0, 164.8, 196.0, 261.6], 550,
    (n, t) => { playNote(n, 0.25, 'triangle', t, 0.1); playNote(98, 0.15, 'sine', t, 0.08); }
  ));
}

export function playBossMusic() {
  playBgmTrack('boss', () => synthLoop(
    [164.8, 196.0, 220.0, 261.6, 220.0, 196.0, 164.8, 146.8], 380,
    (n, t) => { playNote(n, 0.2, 'sawtooth', t, 0.06); playNote(82.4, 0.12, 'triangle', t, 0.1); }
  ));
}

function playNoise(duration, t, gain) {
  if (!audioCtx) return;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1);
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + duration);
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 800;
  filter.Q.value = 0.5;
  noise.connect(filter);
  filter.connect(g);
  g.connect(masterGain);
  noise.start(t);
  noise.stop(t + duration);
}

export function playSFX(type) {
  if (!audioCtx || G.muted) return;
  const t = audioCtx.currentTime;
  switch (type) {
    case 'hit':
      playNote(80, 0.06, 'square', t, 0.2);
      playNote(120, 0.08, 'square', t + 0.02, 0.15);
      playNote(60, 0.12, 'triangle', t, 0.18);
      playNoise(0.08, t, 0.12);
      break;
    case 'hit_heavy':
      playNote(50, 0.1, 'square', t, 0.25);
      playNote(80, 0.08, 'sawtooth', t + 0.02, 0.2);
      playNote(40, 0.15, 'triangle', t, 0.22);
      playNoise(0.12, t, 0.18);
      playNote(30, 0.2, 'sine', t + 0.05, 0.15);
      break;
    case 'hit_crit':
      playNote(60, 0.08, 'square', t, 0.25);
      playNote(200, 0.04, 'sine', t + 0.03, 0.15);
      playNote(40, 0.15, 'sawtooth', t, 0.2);
      playNoise(0.15, t, 0.2);
      playNote(100, 0.06, 'square', t + 0.08, 0.12);
      break;
    case 'block':
      playNote(300, 0.05, 'triangle', t, 0.1);
      playNote(450, 0.04, 'sine', t + 0.03, 0.08);
      playNoise(0.04, t, 0.06);
      break;
    case 'card':
      playNote(500, 0.03, 'sine', t, 0.06);
      playNote(700, 0.03, 'sine', t + 0.02, 0.04);
      break;
    case 'card_stamp':
      playNote(200, 0.04, 'square', t, 0.1);
      playNoise(0.03, t, 0.08);
      playNote(400, 0.03, 'sine', t + 0.02, 0.06);
      break;
    case 'heal':
      playNote(400, 0.15, 'sine', t, 0.08);
      playNote(500, 0.15, 'sine', t + 0.1, 0.08);
      playNote(600, 0.2, 'sine', t + 0.2, 0.1);
      break;
    case 'death':
      playNote(150, 0.3, 'sawtooth', t, 0.1);
      playNote(100, 0.4, 'sawtooth', t + 0.1, 0.08);
      playNote(60, 0.5, 'triangle', t + 0.2, 0.06);
      playNoise(0.3, t, 0.08);
      break;
    case 'chant':
      playNote(392, 0.15, 'sine', t, 0.1);
      playNote(523.3, 0.15, 'sine', t + 0.1, 0.1);
      playNote(659.3, 0.2, 'sine', t + 0.2, 0.12);
      playNote(784, 0.3, 'sine', t + 0.3, 0.1);
      break;
    case 'selfharm':
      playNote(180, 0.15, 'sawtooth', t, 0.1);
      playNote(140, 0.12, 'sawtooth', t + 0.08, 0.08);
      playNoise(0.1, t + 0.05, 0.1);
      break;
    case 'ink_splash':
      playNoise(0.15, t, 0.15);
      playNote(100, 0.08, 'triangle', t, 0.1);
      playNote(150, 0.06, 'sine', t + 0.04, 0.06);
      break;
    // ---- AVG puppet state-change cues (subtle, short) ----
    case 'charm': // 🌈 魅惑 — a lilting rise
      playNote(523.3, 0.1, 'sine', t, 0.07);
      playNote(659.3, 0.1, 'sine', t + 0.07, 0.07);
      playNote(880, 0.14, 'sine', t + 0.14, 0.08);
      break;
    case 'doom': // 💀 寄了 — ominous drop
      playNote(220, 0.14, 'sawtooth', t, 0.09);
      playNote(165, 0.18, 'sawtooth', t + 0.1, 0.08);
      playNote(110, 0.24, 'triangle', t + 0.22, 0.07);
      break;
    case 'daze': // 😵 麻木/眩晕 — wobble
      playNote(330, 0.08, 'triangle', t, 0.07);
      playNote(294, 0.08, 'triangle', t + 0.07, 0.06);
      playNote(330, 0.08, 'triangle', t + 0.14, 0.06);
      break;
    case 'old': // 👴 衰老 — creaky descend
      playNote(200, 0.12, 'sawtooth', t, 0.06);
      playNote(170, 0.14, 'sawtooth', t + 0.1, 0.05);
      break;
    case 'summon': // 🥷 独立个体登场 — bright pop
      playNote(440, 0.06, 'square', t, 0.06);
      playNote(660, 0.06, 'square', t + 0.05, 0.06);
      playNote(880, 0.1, 'sine', t + 0.1, 0.07);
      break;
    case 'forbidden': // 🚫 僭越 — harsh buzz
      playNote(140, 0.12, 'sawtooth', t, 0.12);
      playNoise(0.1, t, 0.1);
      break;
    // ---- 交互反馈层(轻, 0.07-0.13):每个玩家动作都要有声音回应 ----
    case 'pickup': // 拖拽拾起 — 竖琴般的"叮", 预示"拿起来了"
      playNote(392, 0.07, 'triangle', t, 0.11);
      playNote(784, 0.05, 'sine', t + 0.02, 0.05);
      break;
    case 'card_land': // 拖拽落下 — 双音下行, 对应视觉落地
      playNote(330, 0.05, 'sine', t, 0.1);
      playNote(261.6, 0.07, 'sine', t + 0.04, 0.09);
      break;
    case 'card_insert': // 点卡入句 — 钟声感双频
      playNote(523.3, 0.1, 'sine', t, 0.12);
      playNote(1046.5, 0.08, 'sine', t + 0.01, 0.05);
      break;
    case 'card_remove': // 移出造句区 — 轻微 pop-off
      playNote(196, 0.07, 'triangle', t, 0.08);
      break;
    case 'invalid_drop': // 无效拖放 — 低沉的"不行"
      playNote(146.8, 0.12, 'sawtooth', t, 0.07);
      playNote(130.8, 0.1, 'triangle', t + 0.06, 0.05);
      break;
    case 'denied': // 按钮拒绝 — 比 forbidden 轻的双跳嗡
      playNote(165, 0.08, 'triangle', t, 0.09);
      playNote(165, 0.08, 'triangle', t + 0.1, 0.07);
      break;
    // ---- 玩家受击(0.15-0.18, 醒目但不扎心):与打敌人的 hit 区分开 ----
    case 'impact_player': // 钝重闷响
      playNote(90, 0.12, 'sawtooth', t, 0.15);
      playNote(60, 0.18, 'sine', t + 0.02, 0.14);
      playNoise(0.1, t, 0.1);
      break;
    case 'impact_player_heavy': // 挨了大的 — 更低更长 + 余震
      playNote(65, 0.16, 'sawtooth', t, 0.18);
      playNote(45, 0.26, 'sine', t + 0.03, 0.16);
      playNoise(0.16, t, 0.14);
      playNote(35, 0.3, 'sine', t + 0.1, 0.1);
      break;
    // ---- 节拍层:回合与抽卡 ----
    case 'turn_start': // 五声音阶三连上行, 温暖的"该你了"
      playNote(261.6, 0.12, 'sine', t, 0.09);
      playNote(329.6, 0.12, 'sine', t + 0.06, 0.09);
      playNote(392, 0.16, 'sine', t + 0.12, 0.1);
      break;
    case 'card_draw': // 洗牌般的快速上行
      playNote(330, 0.04, 'triangle', t, 0.08);
      playNote(392, 0.04, 'triangle', t + 0.035, 0.08);
      playNote(440, 0.05, 'triangle', t + 0.07, 0.09);
      break;
    // ---- 爆点(0.15+):高倍率句的专属声音 ----
    case 'combo_break': // 扫弦感 — 升腾 + 墨刷
      playNote(523.3, 0.08, 'sine', t, 0.12);
      playNote(659.3, 0.08, 'sine', t + 0.05, 0.13);
      playNote(880, 0.18, 'sine', t + 0.1, 0.15);
      playNoise(0.12, t + 0.08, 0.1);
      break;
  }
}

export { audioCtx, playNote };
