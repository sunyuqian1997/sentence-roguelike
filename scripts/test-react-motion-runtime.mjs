import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bridgeModuleUrl = new URL('../src/react/runtime/uiBridge.js', import.meta.url);
const runtimeIndexPath = resolve(projectRoot, 'src/react/runtime/index.js');

const { createUiBridge } = await import(bridgeModuleUrl);

const state = { hp: 10, sentence: [] };
const bridge = createUiBridge(state);

const initial = bridge.getSnapshot();
assert.equal(initial, bridge.getSnapshot(), 'getSnapshot must be cached between emits');
assert.equal(initial, bridge.getServerSnapshot(), 'server snapshot must share the cached snapshot');
assert.equal(initial.version, 0);
assert.equal(initial.event, 'init');
assert.equal(initial.state, state, 'snapshot must retain the mutable game state reference');

let notifications = 0;
const unsubscribe = bridge.subscribe(() => { notifications += 1; });
state.hp = 7;
const emitted = bridge.emit('player:damaged', { amount: 3 });

assert.notEqual(emitted, initial, 'emit must publish a new snapshot identity');
assert.equal(emitted, bridge.getSnapshot(), 'new snapshot must remain cached');
assert.equal(emitted.version, 1);
assert.equal(bridge.getVersion(), 1);
assert.equal(emitted.event, 'player:damaged');
assert.deepEqual(emitted.detail, { amount: 3 });
assert.equal(emitted.state.hp, 7);
assert.equal(notifications, 1, 'subscriber must run once per emit');

unsubscribe();
bridge.emit('after-unsubscribe');
assert.equal(notifications, 1, 'unsubscribed listeners must not run');
assert.equal(bridge.getVersion(), 2);

let healthyNotifications = 0;
bridge.subscribe(() => { throw new Error('expected observer failure'); });
bridge.subscribe(() => { healthyNotifications += 1; });

const originalConsoleError = console.error;
let isolatedErrorLogged = false;
console.error = (...args) => {
  isolatedErrorLogged = args[0] === '[uiBridge] subscriber failed';
};
try {
  bridge.emit('observer-isolation');
} finally {
  console.error = originalConsoleError;
}

assert.equal(isolatedErrorLogged, true, 'faulty subscriber should be reported');
assert.equal(healthyNotifications, 1, 'faulty subscriber must not block later subscribers');
assert.equal(bridge.getVersion(), 3);

const runtimeIndex = await readFile(runtimeIndexPath, 'utf8');
for (const exportedName of [
  'ReactRuntimeErrorBoundary',
  'ReactInteractionRuntime',
  'createUiBridge',
  'uiBridge',
  'mountReactMotionRuntime',
]) {
  assert.match(
    runtimeIndex,
    new RegExp(`\\b${exportedName}\\b`),
    `runtime index must expose ${exportedName}`,
  );
}

console.log('react-motion runtime assertions passed');
