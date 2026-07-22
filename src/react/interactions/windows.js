import { animate } from 'motion/react';

export const DEFAULT_WINDOW_SELECTOR = [
  '[data-motion-window]',
  '.os-window',
  '.reward-content',
  '.rest-content',
  '.event-content',
  '.shop-content',
  '.poetry-content',
  '.end-content',
  '.meta-section',
].join(',');

const ENTER_TRANSITION = Object.freeze({ duration: 0.28, ease: [0.22, 1, 0.36, 1] });
const EXIT_TRANSITION = Object.freeze({ duration: 0.18, ease: [0.4, 0, 1, 1] });
const FOCUS_TRANSITION = Object.freeze({ duration: 0.24, ease: [0.25, 1, 0.5, 1] });

const running = new Map();

function prefersReducedMotion(override) {
  if (typeof override === 'boolean') return override;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function registerAnimation(element, controls, restore = () => {}) {
  const record = { controls, restored: false, restore };
  let records = running.get(element);
  if (!records) {
    records = new Set();
    running.set(element, records);
  }
  records.add(record);

  const finish = () => {
    if (!record.restored) {
      record.restored = true;
      record.restore();
    }
    records.delete(record);
    if (records.size === 0) running.delete(element);
  };

  Promise.resolve(controls).then(finish, finish);
  return { controls, finish };
}

function stopAnimations(element) {
  const records = running.get(element);
  if (!records) return;
  [...records].forEach((record) => {
    record.controls.stop?.();
    if (!record.restored) {
      record.restored = true;
      record.restore();
    }
  });
  running.delete(element);
}

function animateOpacity(element, keyframes, transition, onComplete) {
  stopAnimations(element);
  const inlineOpacity = element.style.opacity;
  const controls = animate(element, { opacity: keyframes }, transition);
  const { finish } = registerAnimation(element, controls, () => {
    if (inlineOpacity) element.style.opacity = inlineOpacity;
    else element.style.removeProperty('opacity');
    onComplete?.();
  });
  return { controls, finished: Promise.resolve(controls).then(finish, finish) };
}

function targetOpacity(element) {
  if (typeof window === 'undefined') return 1;
  const value = Number.parseFloat(window.getComputedStyle(element).opacity);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function ensureFocusRail(element) {
  const titleSelector = '.os-window-title, .audio-settings-title, [data-motion-window-title]';
  const title = element.querySelector(`:scope > :is(${titleSelector})`)
    || element.querySelector(titleSelector);
  if (!(title instanceof HTMLElement)) return null;
  let rail = title.querySelector(':scope > .motion-window-focus-rail');
  if (!rail) {
    rail = document.createElement('span');
    rail.className = 'motion-window-focus-rail';
    rail.setAttribute('aria-hidden', 'true');
    title.appendChild(rail);
  }
  return rail;
}

export function animateWindowEnter(element, options = {}) {
  if (!(element instanceof HTMLElement)) return null;
  element.dataset.motionWindowState = 'entering';
  const finish = () => { element.dataset.motionWindowState = 'open'; };
  if (prefersReducedMotion(options.reducedMotion)) {
    finish();
    options.onComplete?.();
    return null;
  }
  return animateOpacity(
    element,
    [0, targetOpacity(element)],
    { ...ENTER_TRANSITION, ...options.transition },
    () => { finish(); options.onComplete?.(); },
  );
}

export function animateWindowExit(element, options = {}) {
  if (!(element instanceof HTMLElement)) return null;
  element.dataset.motionWindowState = 'exiting';
  const finish = () => { element.dataset.motionWindowState = 'closed'; };
  if (prefersReducedMotion(options.reducedMotion)) {
    finish();
    options.onComplete?.();
    return null;
  }
  return animateOpacity(
    element,
    [targetOpacity(element), 0],
    { ...EXIT_TRANSITION, ...options.transition },
    () => { finish(); options.onComplete?.(); },
  );
}

export function animateWindowFocus(element, options = {}) {
  if (!(element instanceof HTMLElement)) return null;
  const rail = ensureFocusRail(element);
  if (!rail) return null;
  element.dataset.motionWindowFocused = 'true';
  if (prefersReducedMotion(options.reducedMotion)) {
    rail.style.opacity = '0';
    return null;
  }
  stopAnimations(rail);
  const controls = animate(
    rail,
    { opacity: [0, 0.82, 0], scaleX: [0.18, 1, 1] },
    { ...FOCUS_TRANSITION, times: [0, 0.38, 1], ...options.transition },
  );
  registerAnimation(rail, controls, () => {
    rail.style.removeProperty('opacity');
    rail.style.removeProperty('transform');
  });
  return controls;
}

function isVisible(element) {
  if (!element.isConnected || element.hidden || element.getAttribute('aria-hidden') === 'true') return false;
  if (element.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && element.getClientRects().length > 0;
}

function windowsWithin(node, selector) {
  if (!node?.querySelectorAll) return [];
  const result = [];
  if (node instanceof Element && node.matches(selector)) result.push(node);
  node.querySelectorAll(selector).forEach((element) => result.push(element));
  return result;
}

/**
 * Observes legacy DOM windows without taking ownership of their markup.
 * The returned function disconnects the observer, stops Motion controls and
 * removes only the focus rails created by this module.
 */
export function createWindowMotionObserver(options = {}) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const root = options.root || document.body;
  if (!root) return () => {};
  const selector = options.selector || DEFAULT_WINDOW_SELECTOR;
  const states = new Map();
  let focusedWindow = null;
  let disposed = false;

  const sync = (element, initial = false) => {
    if (!(element instanceof HTMLElement)) return;
    const visible = isVisible(element);
    const previous = states.get(element);
    states.set(element, visible);
    if (initial && visible) animateWindowEnter(element, options);
    else if (previous === false && visible) animateWindowEnter(element, options);
    else if (previous === true && !visible) animateWindowExit(element, options);
  };

  const syncTree = (node, initial = false) => windowsWithin(node, selector).forEach((element) => sync(element, initial));
  const removeTree = (node) => windowsWithin(node, selector).forEach((element) => {
    stopAnimations(element);
    element.querySelectorAll('.motion-window-focus-rail').forEach((rail) => stopAnimations(rail));
    states.delete(element);
  });

  const observer = new MutationObserver((records) => {
    if (disposed) return;
    const pending = new Set();
    records.forEach((record) => {
      if (record.type === 'childList') {
        record.addedNodes.forEach((node) => {
          if (node instanceof Element) syncTree(node, true);
        });
        record.removedNodes.forEach(removeTree);
      }
      if (record.target instanceof Element) pending.add(record.target);
    });
    queueMicrotask(() => {
      if (disposed) return;
      pending.forEach((node) => syncTree(node));
    });
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'],
  });

  const focusWindow = (event) => {
    const target = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!(target instanceof HTMLElement) || !root.contains(target)) return;
    if (focusedWindow && focusedWindow !== target) focusedWindow.removeAttribute('data-motion-window-focused');
    focusedWindow = target;
    animateWindowFocus(target, options);
  };

  root.addEventListener('pointerdown', focusWindow, true);
  root.addEventListener('focusin', focusWindow, true);
  syncTree(root, options.animateInitial !== false);

  return () => {
    disposed = true;
    observer.disconnect();
    root.removeEventListener('pointerdown', focusWindow, true);
    root.removeEventListener('focusin', focusWindow, true);
    states.forEach((_, element) => {
      stopAnimations(element);
      element.removeAttribute('data-motion-window-state');
      element.removeAttribute('data-motion-window-focused');
      element.querySelectorAll('.motion-window-focus-rail').forEach((rail) => {
        stopAnimations(rail);
        rail.remove();
      });
    });
    states.clear();
    focusedWindow = null;
  };
}

export const initWindowInteractions = createWindowMotionObserver;
