import React from 'react';
import { initCardInteractions } from './interactions/cards.js';
import { initButtonInteractions } from './interactions/buttons.js';
import { initWindowInteractions } from './interactions/windows.js';
import { initAvgInteractions } from './interactions/avg.js';
import { mountReactMotionRuntime, uiBridge } from './runtime/index.js';

import './styles/card-motion.css';
import './styles/window-motion.css';

const MODE_STORAGE_KEY = 'sentence_rogue_motion_runtime';
let runtimeApi = null;
let runtimeMode = 'uninitialized';

function queryMode() {
  const value = new URLSearchParams(window.location.search).get('motion');
  if (value === 'off' || value === 'legacy' || value === '0') return 'legacy';
  if (value === 'on' || value === 'react' || value === '1') return 'react';
  try {
    return localStorage.getItem(MODE_STORAGE_KEY) === 'legacy' ? 'legacy' : 'react';
  } catch {
    return 'react';
  }
}

function bindCardAndButtonInteractions({ root }) {
  const releaseCards = initCardInteractions(root);
  const releaseButtons = initButtonInteractions(root);
  return () => {
    releaseButtons();
    releaseCards();
  };
}

function bindWindows({ root }) {
  return initWindowInteractions({ root, animateInitial: true });
}

function bindAvg({ root }) {
  return initAvgInteractions({ root, animateInitial: true });
}

function backFromDebug() {
  const url = new URL(window.location.href);
  url.searchParams.delete('motiondebug');
  window.location.href = url.toString();
}

async function mountDebugLab(host) {
  try {
    const { MotionDebugLab } = await import('./debug/MotionDebugLab.jsx');
    runtimeApi = mountReactMotionRuntime(host, {
      bridge: uiBridge,
      interactionRoot: host,
      children: <MotionDebugLab onBack={backFromDebug} />,
    });
    runtimeMode = 'debug';
    uiBridge.emit('motion:debug-mounted');
  } catch (error) {
    runtimeMode = 'debug-error';
    console.error('[react-motion] debug lab failed to mount', error);
  }
}

function installDebugApi() {
  window.__motionQA = () => ({
    mode: runtimeMode,
    react: React.version,
    bridgeVersion: uiBridge.getVersion(),
    cards: document.querySelectorAll('.motion-card-interaction').length,
    buttons: document.querySelectorAll('.motion-button-interaction').length,
    windows: document.querySelectorAll('[data-motion-window-state]').length,
    avg: document.querySelectorAll('[data-motion-avg-state]').length,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  });
  window.__setMotionMode = (mode) => {
    const next = mode === false || mode === 'legacy' || mode === 'off' ? 'legacy' : 'react';
    try { localStorage.setItem(MODE_STORAGE_KEY, next); } catch { /* storage is optional */ }
    window.location.reload();
  };
}

/**
 * Starts the React-owned interaction runtime. Returns false only when the
 * explicit legacy fallback is selected, allowing main.js to start the old
 * CSS/DOM micro-transition adapter instead.
 */
export function initReactMotionRuntime() {
  const host = document.getElementById('react-motion-root');
  if (!host) return false;

  installDebugApi();

  const debug = import.meta.env.DEV
    && new URLSearchParams(window.location.search).get('motiondebug') === '1';
  if (debug) {
    host.removeAttribute('aria-hidden');
    document.body.classList.add('react-motion-debug-active');
    const game = document.getElementById('game');
    if (game) game.hidden = true;
    runtimeMode = 'debug-loading';
    void mountDebugLab(host);
    return true;
  }

  if (queryMode() === 'legacy') {
    runtimeMode = 'legacy';
    document.documentElement.dataset.motionRuntime = 'legacy';
    return false;
  }

  runtimeApi = mountReactMotionRuntime(host, {
    bridge: uiBridge,
    interactionRoot: document,
    binders: {
      cards: bindCardAndButtonInteractions,
      windows: bindWindows,
      avg: bindAvg,
    },
    onError(error, info) {
      console.error('[react-motion] runtime error', info, error);
    },
  });
  runtimeMode = 'react-motion';
  document.documentElement.dataset.motionRuntime = 'react';
  uiBridge.emit('motion:runtime-mounted');
  return true;
}

export function getReactMotionRuntime() {
  return runtimeApi;
}

