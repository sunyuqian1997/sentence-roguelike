import { G } from './state.js';

let audioCtx = null, masterGain = null, musicInterval = null;

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
}

export function playAmbientMusic() {
  stopMusic();
  if (!audioCtx) return;
  const notes = [261.6, 293.7, 329.6, 392.0, 440.0];
  let i = 0;
  function tick() {
    if (!audioCtx || G.muted) return;
    const t = audioCtx.currentTime;
    playNote(notes[i % notes.length], 3, 'sine', t, 0.06);
    playNote(notes[i % notes.length] * 0.5, 3, 'triangle', t, 0.03);
    i++;
  }
  tick();
  musicInterval = setInterval(tick, 3500);
}

export function playCombatMusic() {
  stopMusic();
  if (!audioCtx) return;
  const notes = [196.0, 220.0, 261.6, 220.0, 196.0, 164.8, 196.0, 261.6];
  let i = 0;
  function tick() {
    if (!audioCtx || G.muted) return;
    const t = audioCtx.currentTime;
    playNote(notes[i % notes.length], 0.25, 'triangle', t, 0.1);
    playNote(98, 0.15, 'sine', t, 0.08);
    i++;
  }
  tick();
  musicInterval = setInterval(tick, 550);
}

export function playBossMusic() {
  stopMusic();
  if (!audioCtx) return;
  const notes = [164.8, 196.0, 220.0, 261.6, 220.0, 196.0, 164.8, 146.8];
  let i = 0;
  function tick() {
    if (!audioCtx || G.muted) return;
    const t = audioCtx.currentTime;
    playNote(notes[i % notes.length], 0.2, 'sawtooth', t, 0.06);
    playNote(82.4, 0.12, 'triangle', t, 0.1);
    i++;
  }
  tick();
  musicInterval = setInterval(tick, 380);
}

export function playSFX(type) {
  if (!audioCtx || G.muted) return;
  const t = audioCtx.currentTime;
  switch (type) {
    case 'hit':
      playNote(150, 0.1, 'square', t, 0.15);
      playNote(100, 0.12, 'square', t + 0.05, 0.1);
      break;
    case 'block':
      playNote(400, 0.08, 'sine', t, 0.1);
      playNote(500, 0.06, 'sine', t + 0.04, 0.08);
      break;
    case 'card':
      playNote(600, 0.04, 'sine', t, 0.08);
      playNote(800, 0.04, 'sine', t + 0.03, 0.06);
      break;
    case 'heal':
      playNote(400, 0.15, 'sine', t, 0.08);
      playNote(500, 0.15, 'sine', t + 0.08, 0.08);
      playNote(600, 0.2, 'sine', t + 0.16, 0.08);
      break;
    case 'death':
      playNote(200, 0.3, 'sawtooth', t, 0.08);
      playNote(150, 0.3, 'sawtooth', t + 0.15, 0.06);
      break;
    case 'chant':
      playNote(523.3, 0.2, 'sine', t, 0.1);
      playNote(659.3, 0.2, 'sine', t + 0.1, 0.1);
      playNote(784, 0.3, 'sine', t + 0.2, 0.12);
      break;
    case 'selfharm':
      playNote(220, 0.2, 'sawtooth', t, 0.1);
      playNote(180, 0.15, 'sawtooth', t + 0.1, 0.08);
      playNote(440, 0.3, 'sine', t + 0.2, 0.12);
      break;
  }
}

export { audioCtx, playNote };
