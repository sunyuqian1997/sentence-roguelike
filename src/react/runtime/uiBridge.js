import { G } from '../../game/state.js';

function makeSnapshot(state, version, event, detail) {
  return Object.freeze({
    version,
    event,
    detail,
    state,
  });
}

/**
 * Adapts the game's mutable state to React's external-store contract.
 * Mutate `state` through existing game code, then call emit() once settlement
 * is complete. getSnapshot() stays referentially stable between emissions.
 */
export function createUiBridge(state = G) {
  if (!state || typeof state !== 'object') {
    throw new TypeError('createUiBridge(state) expects a mutable state object.');
  }

  const listeners = new Set();
  let version = 0;
  let snapshot = makeSnapshot(state, version, 'init', undefined);

  const getSnapshot = () => snapshot;
  const getServerSnapshot = () => snapshot;
  const getVersion = () => version;

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('uiBridge.subscribe(listener) expects a function.');
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function emit(event = 'change', detail) {
    version += 1;
    snapshot = makeSnapshot(state, version, event, detail);
    [...listeners].forEach((listener) => {
      try {
        listener();
      } catch (error) {
        // One faulty observer must not prevent React or the remaining UI from
        // seeing the committed game-state change.
        console.error('[uiBridge] subscriber failed', error);
      }
    });
    return snapshot;
  }

  return Object.freeze({
    state,
    getSnapshot,
    getServerSnapshot,
    getVersion,
    subscribe,
    emit,
  });
}

export const uiBridge = createUiBridge(G);

