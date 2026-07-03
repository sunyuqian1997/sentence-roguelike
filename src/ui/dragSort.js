// Pointer-events drag & drop for the sentence dock — replaces HTML5 DnD.
// Two gestures share one engine:
//   · sentence card  → drag horizontally to reorder (siblings FLIP aside live)
//   · hand card      → drag up into the dock to insert at the drop point
// Click behaviors are untouched: a press that never travels past THRESHOLD px
// falls through to the normal click (remove / append).
// Everything animates via transform so no reflow mid-drag; the real re-render
// happens once, on commit.
import { G } from '../game/state.js';
import { playSFX } from '../game/audio.js';
import { renderCombat, hideTooltip } from './render.js';
import { addToSentenceAt, removeSentenceWord } from '../game/combat.js';

const THRESHOLD = 6;          // px of travel before a press becomes a drag
const LAND_MS = 170;          // ghost → slot landing flight
const DOCK_PAD = 24;          // forgiveness margin around the dock hit-zone

let active = null;            // the one in-flight drag, or null

// ---------------------------------------------------------------- helpers

const wrapsIn = () =>
  [...document.querySelectorAll('#sentence-slots-container .sentence-card-wrap')];

// Distance between adjacent slot left-edges = card width + flex gap.
function slotPitch(wraps, fallbackEl) {
  if (wraps.length >= 2) {
    const a = wraps[0].getBoundingClientRect();
    const b = wraps[1].getBoundingClientRect();
    if (b.left > a.left) return b.left - a.left;
  }
  const el = wraps[0] || fallbackEl;
  return el ? el.getBoundingClientRect().width + 10 : 90;
}

// Is point p "after" element center c, reading order (handles a wrapped row).
function isAfter(p, c, rowH) {
  if (p.y > c.y + rowH / 2) return true;
  if (p.y < c.y - rowH / 2) return false;
  return p.x > c.x;
}

// Insertion index for point p among els (count of centers that come before it).
function insertIndexAt(p, els) {
  let idx = 0;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    if (isAfter(p, { x: r.left + r.width / 2, y: r.top + r.height / 2 }, r.height)) idx++;
  }
  return idx;
}

function makeGhost(sourceEl) {
  const rect = sourceEl.getBoundingClientRect();
  const ghost = sourceEl.cloneNode(true);
  // the source just got its stay-behind fade — don't clone that onto the ghost
  ghost.classList.remove('drag-source', 'in-sentence', 'await-land');
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style, {
    position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
    width: rect.width + 'px', height: rect.height + 'px',
    margin: '0', zIndex: 9500, pointerEvents: 'none', transformOrigin: 'top left',
    animation: 'none', // don't replay the slot-enter fade on the ghost
  });
  document.body.appendChild(ghost);
  ghost._base = rect;
  // Lift happens on the inner card with its own transition so pickup eases in
  // while the ghost itself tracks the pointer with zero lag.
  const inner = ghost.querySelector('.card') || ghost;
  requestAnimationFrame(() => inner.classList.add('ghost-lift'));
  playSFX('pickup');
  return ghost;
}

function moveGhost(ghost, e) {
  const dx = e.clientX - active.start.x;
  const dy = e.clientY - active.start.y;
  ghost.style.transform = `translate(${dx}px, ${dy}px)`;
}

// Fly the ghost onto targetRect (scaling if sizes differ), then reveal the
// real card underneath with a squash-&-stretch pop.
function landGhost(ghost, targetRect, revealEl, done) {
  const base = ghost._base;
  const k = targetRect.width / base.width;
  ghost.style.transition = `transform ${LAND_MS}ms cubic-bezier(0.2, 0.8, 0.3, 1)`;
  ghost.style.transform =
    `translate(${targetRect.left - base.left}px, ${targetRect.top - base.top}px) scale(${k})`;
  const inner = ghost.querySelector('.card');
  if (inner) inner.classList.remove('ghost-lift');
  setTimeout(() => {
    ghost.remove();
    if (revealEl) {
      revealEl.classList.remove('await-land');
      const card = revealEl.querySelector('.card') || revealEl;
      card.classList.add('drop-pop');
      setTimeout(() => card.classList.remove('drop-pop'), 400);
    }
    playSFX('card_land');
    if (done) done();
  }, LAND_MS + 10);
}

// No valid drop — snap home with a little overshoot so it reads as a bounce.
function flyBack(ghost, sourceEl, done) {
  playSFX('invalid_drop');
  ghost.style.transition = `transform 260ms cubic-bezier(0.3, 1.4, 0.4, 1)`;
  ghost.style.transform = 'translate(0px, 0px)';
  const inner = ghost.querySelector('.card');
  if (inner) inner.classList.remove('ghost-lift');
  setTimeout(() => {
    ghost.remove();
    if (sourceEl) sourceEl.classList.remove('drag-source');
    if (done) done();
  }, 270);
}

function clearShifts(els) {
  els.forEach(el => { el.style.transform = ''; });
}

// A drag's pointerup is followed by a click on whatever is under the pointer;
// swallow exactly that one so drops don't also remove/append a card.
function swallowNextClick() {
  const stop = (e) => { e.stopPropagation(); e.preventDefault(); };
  window.addEventListener('click', stop, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 350);
}

function beginDragChrome() {
  hideTooltip();
  document.body.classList.add('dragging-card');
}
function endDragChrome() {
  document.body.classList.remove('dragging-card');
}

// ------------------------------------------- sentence reorder gesture

export function attachSentenceDrag(wrap) {
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || active) return;
    const idx = parseInt(wrap.dataset.sentenceIdx, 10);
    if (!Number.isInteger(idx)) return;
    startPress(e, wrap, {
      kind: 'sentence',
      onStart() {
        const wraps = wrapsIn();
        active.sourceEl = wraps[idx];
        active.others = wraps.filter((_, k) => k !== idx);
        active.sourceIdx = idx;
        active.pitch = slotPitch(wraps);
        active.insertIdx = -1;
        active.dock = document.getElementById('sentence-dock')
          || document.getElementById('sentence-area');
        active.sourceEl.classList.add('drag-source');
        active.ghost = makeGhost(active.sourceEl);
        active.others.forEach(el => el.classList.add('drag-shift'));
      },
      onMove(ev) {
        moveGhost(active.ghost, ev);
        // Dragged clear of the dock = "take it back" — gap closes, ghost dims.
        const r = active.dock.getBoundingClientRect();
        const over = ev.clientX > r.left - DOCK_PAD && ev.clientX < r.right + DOCK_PAD
          && ev.clientY > r.top - DOCK_PAD && ev.clientY < r.bottom + DOCK_PAD;
        if (!over) {
          if (active.insertIdx !== -2) {
            active.insertIdx = -2;
            clearShifts(active.others);
            active.ghost.classList.add('ghost-removing');
          }
          return;
        }
        active.ghost.classList.remove('ghost-removing');
        const p = { x: ev.clientX, y: ev.clientY };
        const insertIdx = insertIndexAt(p, active.others);
        if (insertIdx === active.insertIdx) return;
        active.insertIdx = insertIdx;
        // Open the gap: each sibling moves by (final − original) slots ∈ {-1,0,1}
        active.others.forEach((el, k) => {
          const p0 = k < active.sourceIdx ? k : k + 1;      // original position
          const p1 = k < insertIdx ? k : k + 1;              // position after drop
          const shift = p1 - p0;
          el.style.transform = shift ? `translateX(${shift * active.pitch}px)` : '';
        });
      },
      onDrop() {
        const { sourceIdx, insertIdx, ghost, others } = active;
        clearShifts(others);
        others.forEach(el => el.classList.remove('drag-shift'));
        if (insertIdx === -2) {
          // dropped outside the dock → remove from the sentence, card returns
          // to the hand; fly the ghost onto its hand card if it's there
          const card = G.sentence[sourceIdx];
          removeSentenceWord(sourceIdx);
          const handPos = G.hand.indexOf(card);
          const handEl = handPos >= 0
            ? document.querySelectorAll('#hand-cards .card')[handPos] : null;
          if (handEl) landGhost(ghost, handEl.getBoundingClientRect(), null);
          else {
            ghost.style.transition = 'transform 200ms ease, opacity 200ms ease';
            ghost.style.opacity = '0';
            setTimeout(() => ghost.remove(), 210);
          }
          return;
        }
        if (insertIdx < 0 || insertIdx === sourceIdx) {
          flyBack(ghost, active.sourceEl);
          return;
        }
        // A mid-drag re-render (chant resolution / enemy turn) may have changed
        // the sentence under us — indices from drag-start are then meaningless.
        if (sourceIdx >= G.sentence.length || insertIdx > G.sentence.length - 1) {
          ghost.remove();
          renderCombat();
          return;
        }
        const moved = G.sentence.splice(sourceIdx, 1)[0];
        G.sentence.splice(insertIdx, 0, moved);
        playSFX('card');
        renderCombat();
        const newWrap = wrapsIn()[insertIdx];
        if (newWrap) {
          newWrap.classList.add('await-land');
          landGhost(ghost, newWrap.getBoundingClientRect(), newWrap);
        } else {
          ghost.remove();
        }
      },
      onCancel() {
        clearShifts(active.others);
        active.others.forEach(el => el.classList.remove('drag-shift'));
        flyBack(active.ghost, active.sourceEl);
      },
    });
  });
}

// ------------------------------------------- hand → dock gesture

export function attachHandDrag(cardEl, handIndex) {
  cardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || active) return;
    const card = G.hand[handIndex];
    if (!card || G.sentence.includes(card)) return;
    startPress(e, cardEl, {
      kind: 'hand',
      onStart() {
        active.sourceEl = cardEl;
        active.dock = document.getElementById('sentence-dock')
          || document.getElementById('sentence-area');
        active.wraps = wrapsIn();
        active.pitch = slotPitch(active.wraps, cardEl);
        active.insertIdx = -1;
        active.overDock = false;
        cardEl.classList.add('drag-source');
        active.ghost = makeGhost(cardEl);
        active.wraps.forEach(el => el.classList.add('drag-shift'));
      },
      onMove(ev) {
        moveGhost(active.ghost, ev);
        const r = active.dock.getBoundingClientRect();
        const over = ev.clientX > r.left - DOCK_PAD && ev.clientX < r.right + DOCK_PAD
          && ev.clientY > r.top - DOCK_PAD && ev.clientY < r.bottom + DOCK_PAD;
        if (over !== active.overDock) {
          active.overDock = over;
          active.dock.classList.toggle('drop-ready', over);
          if (!over) { clearShifts(active.wraps); active.insertIdx = -1; }
        }
        if (!over) return;
        const insertIdx = insertIndexAt({ x: ev.clientX, y: ev.clientY }, active.wraps);
        if (insertIdx === active.insertIdx) return;
        active.insertIdx = insertIdx;
        active.wraps.forEach((el, k) => {
          el.style.transform = k >= insertIdx ? `translateX(${active.pitch}px)` : '';
        });
      },
      onDrop() {
        const { ghost, wraps, insertIdx, overDock, dock } = active;
        clearShifts(wraps);
        wraps.forEach(el => el.classList.remove('drag-shift'));
        dock.classList.remove('drop-ready');
        const ok = overDock && insertIdx >= 0 && addToSentenceAt(handIndex, insertIdx);
        if (!ok) {
          flyBack(ghost, cardEl);
          return;
        }
        cardEl.classList.remove('drag-source');
        const newWrap = wrapsIn()[insertIdx];
        if (newWrap) {
          newWrap.classList.add('await-land');
          landGhost(ghost, newWrap.getBoundingClientRect(), newWrap);
        } else {
          ghost.remove();
        }
      },
      onCancel() {
        clearShifts(active.wraps);
        active.wraps.forEach(el => el.classList.remove('drag-shift'));
        active.dock.classList.remove('drop-ready');
        flyBack(active.ghost, cardEl);
      },
    });
  });
}

// ------------------------------------------- shared press → drag engine
//
// Robustness contract (learned the hard way — a chant resolution or enemy turn
// can call renderCombat MID-DRAG and destroy the pressed element):
//   · move/up/cancel listeners live on WINDOW, not the element — they survive
//     the element being re-rendered away (pointer capture alone dies with it).
//   · finish() runs in try/finally — `active` and the body chrome ALWAYS reset,
//     even if a drop hook throws. A stuck `active` used to brick all dragging.
//   · ev.buttons === 0 mid-move ⇒ the real mouseup was lost somewhere; treat as
//     cancel instead of dragging a ghost with no button held.
//   · forceCleanupDrag() sweeps stray ghosts/classes; runs before every new
//     press as a belt-and-braces failsafe.

function forceCleanupDrag() {
  document.querySelectorAll('.drag-ghost').forEach(g => g.remove());
  document.querySelectorAll('.drag-source').forEach(el => el.classList.remove('drag-source'));
  document.querySelectorAll('.sentence-card-wrap.drag-shift, #hand-cards .drag-shift')
    .forEach(el => { el.style.transform = ''; el.classList.remove('drag-shift'); });
  const dock = document.getElementById('sentence-dock');
  if (dock) dock.classList.remove('drop-ready');
  endDragChrome();
  active = null;
}

function startPress(e, el, hooks) {
  if (active) forceCleanupDrag();   // a stale drag must never block the next one
  const pointerId = e.pointerId;
  active = {
    kind: hooks.kind, el, pointerId,
    start: { x: e.clientX, y: e.clientY },
    dragging: false,
  };
  try { el.setPointerCapture(pointerId); } catch { /* capture is best-effort */ }

  const onMove = (ev) => {
    if (!active || ev.pointerId !== pointerId) return;
    // The browser lost our pointerup (release outside window / element torn
    // down mid-capture). A drag with no button held is a zombie — cancel it.
    if (active.dragging && ev.pointerType === 'mouse' && ev.buttons === 0) {
      finish(ev, true);
      return;
    }
    try {
      if (!active.dragging) {
        const dx = ev.clientX - active.start.x;
        const dy = ev.clientY - active.start.y;
        if (dx * dx + dy * dy < THRESHOLD * THRESHOLD) return;
        active.dragging = true;
        beginDragChrome();
        hooks.onStart();
      }
      hooks.onMove(ev);
    } catch (err) {
      console.error('[dragSort] mid-drag error, cancelling:', err);
      finish(ev, true);
    }
  };
  const finish = (ev, cancelled) => {
    if (!active || ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
    try { el.releasePointerCapture(pointerId); } catch { /* already released */ }
    const wasDragging = active.dragging;
    try {
      if (wasDragging) {
        swallowNextClick();
        if (cancelled) hooks.onCancel();
        else hooks.onDrop();
      }
    } catch (err) {
      console.error('[dragSort] drop error, force-cleaning:', err);
      forceCleanupDrag();
    } finally {
      endDragChrome();
      active = null;
    }
    // Not a drag → fall through: the browser fires the normal click next.
  };
  const onUp = (ev) => finish(ev, false);
  const onCancel = (ev) => finish(ev, true);
  const onBlur = () => finish({ pointerId }, true);   // window lost focus mid-drag

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
}
