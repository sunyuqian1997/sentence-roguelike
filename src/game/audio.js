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

// Play an MP3 track for `key`. If the file is missing/blocked, run `fallback`
// (the synthesized loop) instead — so the game always has music.
function playBgmTrack(key, fallback) {
  const src = BGM_TRACKS[key];
  if (bgmEl && bgmKey === key && !bgmEl.paused) return; // already on
  // Stop the synth loop NOW so it never layers under the mp3 while it loads.
  if (musicInterval) { clearInterval(musicInterval); musicInterval = null; }
  stopBgmTrack();
  const el = new Audio(src);
  el.loop = true;
  el.volume = G.muted ? 0 : BGM_VOLUME;
  bgmEl = el; bgmKey = key;
  const useFallback = () => {
    if (bgmEl === el) { stopBgmTrack(); }
    if (fallback) fallback();
  };
  el.addEventListener('error', useFallback, { once: true });
  const p = el.play();
  if (p && p.catch) p.catch(useFallback); // autoplay blocked → synth
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
  g.gain.setValueAtTime(gain || 0.2, t);
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
  }
}

export { audioCtx, playNote };
