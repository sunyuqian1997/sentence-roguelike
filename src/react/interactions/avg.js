import { animate } from 'motion/react';

export const DEFAULT_AVG_SELECTOR = '[data-motion-avg], .tutorial-dialogue, .story-center';

const LINE_TRANSITION = Object.freeze({ duration: 0.24, ease: [0.22, 1, 0.36, 1] });
const ENTER_TRANSITION = Object.freeze({ duration: 0.3, ease: [0.16, 1, 0.3, 1] });
const running = new Map();

function prefersReducedMotion(override) {
  if (typeof override === 'boolean') return override;
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function rememberInlineStyle(element) {
  return {
    opacity: element.style.opacity,
    transform: element.style.transform,
  };
}

function restoreInlineStyle(element, snapshot) {
  if (snapshot.opacity) element.style.opacity = snapshot.opacity;
  else element.style.removeProperty('opacity');
  if (snapshot.transform) element.style.transform = snapshot.transform;
  else element.style.removeProperty('transform');
}

function track(element, controls, restore = () => {}) {
  const previous = running.get(element);
  if (previous) {
    previous.controls.stop?.();
    previous.restore();
  }
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    restore();
    if (running.get(element)?.controls === controls) running.delete(element);
  };
  running.set(element, { controls, restore: finish });
  Promise.resolve(controls).then(finish, finish);
  return controls;
}

function stop(element) {
  const record = running.get(element);
  if (!record) return;
  record.controls.stop?.();
  record.restore();
  running.delete(element);
}

function animatePart(element, keyframes, transition) {
  if (!(element instanceof HTMLElement)) return null;
  stop(element);
  const snapshot = rememberInlineStyle(element);
  const controls = animate(element, keyframes, transition);
  return track(element, controls, () => restoreInlineStyle(element, snapshot));
}

function partsFor(dialogue) {
  return {
    speaker: dialogue.querySelector('[data-motion-avg-speaker], .tutorial-speaker, .story-speaker'),
    copy: dialogue.querySelector('[data-motion-avg-copy], .tutorial-copy, .story-box'),
    text: dialogue.querySelector('[data-motion-avg-text], .tutorial-text, .story-text'),
    portrait: dialogue.querySelector('[data-motion-avg-portrait], .tutorial-portrait, .story-portrait'),
  };
}

export function animateAvgEnter(dialogue, options = {}) {
  if (!(dialogue instanceof HTMLElement)) return null;
  stop(dialogue);
  dialogue.dataset.motionAvgState = 'entering';
  if (prefersReducedMotion(options.reducedMotion)) {
    dialogue.dataset.motionAvgState = 'open';
    options.onComplete?.();
    return null;
  }
  const snapshot = rememberInlineStyle(dialogue);
  const targetOpacity = Number.parseFloat(window.getComputedStyle(dialogue).opacity) || 1;
  const controls = animate(
    dialogue,
    { opacity: [0, targetOpacity] },
    { ...ENTER_TRANSITION, ...options.transition },
  );
  track(dialogue, controls, () => {
    restoreInlineStyle(dialogue, snapshot);
    dialogue.dataset.motionAvgState = 'open';
    options.onComplete?.();
  });
  return controls;
}

/** Animate only AVG child layers. The portrait receives opacity/translation,
 * never filter, so original artwork remains untouched. */
export function animateAvgLine(dialogue, options = {}) {
  if (!(dialogue instanceof HTMLElement)) return [];
  const { speaker, copy, portrait } = partsFor(dialogue);
  dialogue.dataset.motionAvgLine = String((Number(dialogue.dataset.motionAvgLine) || 0) + 1);
  if (prefersReducedMotion(options.reducedMotion)) return [];
  const transition = { ...LINE_TRANSITION, ...options.transition };
  return [
    animatePart(copy, { opacity: [0.5, 1], y: [5, 0] }, transition),
    animatePart(speaker, { opacity: [0.25, 1], x: [-4, 0] }, { ...transition, duration: 0.18 }),
    animatePart(portrait, { opacity: [0.72, 1], x: [-3, 0] }, transition),
  ].filter(Boolean);
}

function ensureAdvancePulse(dialogue) {
  const host = dialogue.querySelector('.story-box, [data-motion-avg-pulse-host]') || dialogue;
  let pulse = host.querySelector(':scope > .motion-avg-advance-pulse');
  if (!pulse) {
    pulse = document.createElement('span');
    pulse.className = 'motion-avg-advance-pulse';
    pulse.setAttribute('aria-hidden', 'true');
    host.appendChild(pulse);
  }
  return { host, pulse };
}

export function animateAvgAdvance(dialogue, point, options = {}) {
  if (!(dialogue instanceof HTMLElement)) return null;
  const { host, pulse } = ensureAdvancePulse(dialogue);
  const rect = host.getBoundingClientRect();
  const x = point?.clientX ?? rect.right - 28;
  const y = point?.clientY ?? rect.bottom - 22;
  pulse.style.left = `${Math.max(8, Math.min(rect.width - 8, x - rect.left))}px`;
  pulse.style.top = `${Math.max(8, Math.min(rect.height - 8, y - rect.top))}px`;
  if (prefersReducedMotion(options.reducedMotion)) return null;
  stop(pulse);
  const controls = animate(
    pulse,
    { opacity: [0, 0.72, 0], scale: [0.5, 1.35, 1.65] },
    { duration: 0.28, times: [0, 0.38, 1], ease: [0.25, 1, 0.5, 1] },
  );
  track(pulse, controls, () => {
    pulse.style.removeProperty('opacity');
    pulse.style.removeProperty('transform');
  });
  return controls;
}

function isVisible(dialogue) {
  if (!dialogue.isConnected || dialogue.hidden || dialogue.closest('[hidden], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(dialogue);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && dialogue.getClientRects().length > 0;
}

function dialoguesWithin(node, selector) {
  if (!node?.querySelectorAll) return [];
  const result = [];
  if (node instanceof Element && node.matches(selector)) result.push(node);
  node.querySelectorAll(selector).forEach((dialogue) => result.push(dialogue));
  return result;
}

/**
 * Adds Motion feedback to legacy tutorial/story AVG surfaces. It observes line
 * replacement, forwards non-control clicks on tutorial dialogue to its visible
 * Next button, and returns a complete teardown function.
 */
export function createAvgMotionObserver(options = {}) {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {};
  const root = options.root || document.body;
  if (!root) return () => {};
  const selector = options.selector || DEFAULT_AVG_SELECTOR;
  const snapshots = new Map();
  let disposed = false;

  const snapshotFor = (dialogue) => {
    const { speaker, text } = partsFor(dialogue);
    return {
      visible: isVisible(dialogue),
      speaker: speaker?.textContent || '',
      textLength: text?.textContent?.length || 0,
    };
  };

  const sync = (dialogue, initial = false) => {
    if (!(dialogue instanceof HTMLElement)) return;
    const next = snapshotFor(dialogue);
    const previous = snapshots.get(dialogue);
    snapshots.set(dialogue, next);
    if ((initial && next.visible) || (previous && !previous.visible && next.visible)) {
      animateAvgEnter(dialogue, options);
      animateAvgLine(dialogue, options);
      return;
    }
    if (!previous || !next.visible) return;
    const speakerChanged = next.speaker !== previous.speaker;
    const textRestarted = next.textLength < previous.textLength;
    if (speakerChanged || textRestarted) animateAvgLine(dialogue, options);
  };

  const syncTree = (node, initial = false) => dialoguesWithin(node, selector).forEach((dialogue) => sync(dialogue, initial));
  const removeTree = (node) => dialoguesWithin(node, selector).forEach((dialogue) => {
    stop(dialogue);
    Object.values(partsFor(dialogue)).forEach(stop);
    dialogue.querySelectorAll('.motion-avg-advance-pulse').forEach(stop);
    snapshots.delete(dialogue);
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
      const owner = record.target instanceof Element ? record.target.closest(selector) : record.target.parentElement?.closest(selector);
      if (owner) pending.add(owner);
      if (record.target instanceof Element) dialoguesWithin(record.target, selector).forEach((dialogue) => pending.add(dialogue));
    });
    queueMicrotask(() => {
      if (disposed) return;
      pending.forEach((dialogue) => sync(dialogue));
    });
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'hidden', 'aria-hidden', 'style'],
  });

  const onPointerDown = (event) => {
    const dialogue = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!(dialogue instanceof HTMLElement) || !root.contains(dialogue)) return;
    animateAvgAdvance(dialogue, event, options);
  };

  const onClick = (event) => {
    const dialogue = event.target instanceof Element ? event.target.closest(selector) : null;
    if (!(dialogue instanceof HTMLElement) || !root.contains(dialogue)) return;
    if (event.target.closest('button, a, input, select, textarea, [role="button"]')) return;
    const next = dialogue.querySelector('.tutorial-next:not([hidden])');
    if (next instanceof HTMLButtonElement && !next.disabled) next.click();
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('click', onClick, true);
  syncTree(root, options.animateInitial !== false);

  return () => {
    disposed = true;
    observer.disconnect();
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('click', onClick, true);
    snapshots.forEach((_, dialogue) => {
      stop(dialogue);
      Object.values(partsFor(dialogue)).forEach((part) => part && stop(part));
      dialogue.removeAttribute('data-motion-avg-state');
      dialogue.removeAttribute('data-motion-avg-line');
      dialogue.querySelectorAll('.motion-avg-advance-pulse').forEach((pulse) => {
        stop(pulse);
        pulse.remove();
      });
    });
    snapshots.clear();
  };
}

export const initAvgInteractions = createAvgMotionObserver;
