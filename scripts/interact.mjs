// CDP interaction driver — synthesizes REAL mouse/pointer input so the juicy
// pointer-events drag code runs exactly as it would under a human hand.
//   node scripts/interact.mjs <url> <actions.json | inline-JSON-array>
// Env: SHOT_W / SHOT_H viewport (deviceScaleFactor is always 1 = 100% zoom).
//
// Actions (array, executed in order):
//   { "a": "wait",  "ms": 500 }
//   { "a": "shot",  "path": "out.png" }
//   { "a": "click", "sel": ".card" , "nth": 0 }
//   { "a": "eval",  "expr": "G.sentence.length", "label": "len" }
//   { "a": "assert","expr": "...", "expect": <json>, "label": "..." }
//   { "a": "drag",  "from": ".sel"|{"x":1,"y":2}, "to": ".sel"|{"x":1,"y":2},
//     "nthFrom": 0, "nthTo": 0, "dx": 0, "dy": 0, "steps": 14,
//     "midShots": ["mid1.png"], "holdMs": 120, "settleMs": 350 }
// drag dispatches mousePressed → N× mouseMoved → mouseReleased; Chrome derives
// pointerdown/pointermove/pointerup from these, so setPointerCapture works.
// Exits 1 if any assert fails or uncaught page errors occur.
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';

const [, , URL_ARG, ACTIONS_ARG] = process.argv;
if (!URL_ARG || !ACTIONS_ARG) {
  console.error('usage: node scripts/interact.mjs <url> <actions.json|inline-json>');
  process.exit(2);
}
const ACTIONS = ACTIONS_ARG.trim().startsWith('[')
  ? JSON.parse(ACTIONS_ARG)
  : JSON.parse(readFileSync(ACTIONS_ARG, 'utf8'));

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = parseInt(process.env.CDP_PORT || '9223', 10); // avoid clashing with shot.mjs's 9222
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const httpGet = (url) => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
});

let chrome;
let failed = false;
try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = JSON.parse(await httpGet(`http://localhost:${PORT}/json`)); if (targets.length) break; }
    catch { await sleep(200); }
  }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
  const pending = new Map();
  let id = 0;
  const errors = [];
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', buf => {
    const m = JSON.parse(buf.toString());
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
      errors.push('console.error: ' + m.params.args.map(a => a.value || a.description || '').join(' '));
    else if (m.method === 'Runtime.exceptionThrown')
      errors.push('uncaught: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = ++id;
    pending.set(myId, r => r.error ? reject(new Error(method + ': ' + JSON.stringify(r.error))) : resolve(r.result));
    ws.send(JSON.stringify({ id: myId, method, params }));
  });

  await send('Runtime.enable');
  await send('Page.enable');
  const W = parseInt(process.env.SHOT_W || '1280', 10);
  const H = parseInt(process.env.SHOT_H || '720', 10);
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: URL_ARG });
  await sleep(parseInt(process.env.NAV_WAIT || '3500', 10));

  const evalJSON = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: `JSON.stringify((()=>{ return (${expr}); })() ?? null)`,
      returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return JSON.parse(r.result.value);
  };

  // Center of the nth element matching sel, in CSS px.
  const centerOf = async (sel, nth = 0) => {
    const pt = await evalJSON(`(() => {
      const els = document.querySelectorAll(${JSON.stringify(sel)});
      const el = els[${nth}];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!pt) throw new Error(`selector not found: ${sel} [${nth}]`);
    return pt;
  };
  const resolvePoint = async (spec, nth) =>
    (typeof spec === 'string') ? centerOf(spec, nth || 0) : spec;

  const mouse = (type, x, y, extra = {}) =>
    send('Input.dispatchMouseEvent', { type, x, y, button: 'left', pointerType: 'mouse', ...extra });

  const shot = async (path) => {
    const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(path, Buffer.from(s.data, 'base64'));
    console.log('shot →', path);
  };

  for (const act of ACTIONS) {
    if (act.a === 'wait') { await sleep(act.ms || 300); }
    else if (act.a === 'shot') { await shot(act.path); }
    else if (act.a === 'eval') {
      const v = await evalJSON(act.expr);
      console.log(`eval${act.label ? ' [' + act.label + ']' : ''}:`, JSON.stringify(v));
    }
    else if (act.a === 'assert') {
      const v = await evalJSON(act.expr);
      const ok = JSON.stringify(v) === JSON.stringify(act.expect);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${act.label || act.expr} → ${JSON.stringify(v)}${ok ? '' : ' (expected ' + JSON.stringify(act.expect) + ')'}`);
      if (!ok) failed = true;
    }
    else if (act.a === 'click') {
      const p = await resolvePoint(act.sel, act.nth);
      await mouse('mouseMoved', p.x, p.y);
      await mouse('mousePressed', p.x, p.y, { clickCount: 1 });
      await sleep(40);
      await mouse('mouseReleased', p.x, p.y, { clickCount: 1 });
      await sleep(act.settleMs ?? 250);
    }
    // fine-grained primitives — let the harness pause mid-drag to eval/shot
    else if (act.a === 'down') {
      const p = await resolvePoint(act.sel || act.at, act.nth);
      await mouse('mouseMoved', p.x, p.y);
      await mouse('mousePressed', p.x, p.y, { clickCount: 1 });
      globalThis._dragPos = p;
    }
    else if (act.a === 'move') {
      const from = globalThis._dragPos;
      const toBase = await resolvePoint(act.sel || act.at, act.nth);
      const to = { x: toBase.x + (act.dx || 0), y: toBase.y + (act.dy || 0) };
      const steps = act.steps || 8;
      for (let i = 1; i <= steps; i++) {
        await mouse('mouseMoved', from.x + (to.x - from.x) * (i / steps), from.y + (to.y - from.y) * (i / steps), { buttons: 1 });
        await sleep(18);
      }
      globalThis._dragPos = to;
    }
    else if (act.a === 'up') {
      const p = globalThis._dragPos;
      await mouse('mouseReleased', p.x, p.y, { clickCount: 1 });
      await sleep(act.settleMs ?? 400);
    }
    else if (act.a === 'drag') {
      const from = await resolvePoint(act.from, act.nthFrom);
      const toBase = await resolvePoint(act.to, act.nthTo);
      const to = { x: toBase.x + (act.dx || 0), y: toBase.y + (act.dy || 0) };
      const steps = act.steps || 14;
      const midShots = act.midShots || [];
      await mouse('mouseMoved', from.x, from.y);
      await mouse('mousePressed', from.x, from.y, { clickCount: 1 });
      await sleep(act.holdMs ?? 80);
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await mouse('mouseMoved', x, y, { buttons: 1 });
        await sleep(18);
        // midShots[k] fires at evenly spaced fractions of the way through
        // (1 shot → halfway, 2 shots → 1/3 & 2/3, …)
        const shotIdx = midShots.length ? Math.floor((i / steps) * (midShots.length + 1)) - 1 : -1;
        if (shotIdx >= 0 && midShots[shotIdx] && !midShots[shotIdx]._done) {
          await sleep(120); // let open-gap transitions settle into a readable frame
          await shot(midShots[shotIdx]);
          midShots[shotIdx] = { _done: true };
        }
      }
      await sleep(60);
      await mouse('mouseReleased', to.x, to.y, { clickCount: 1 });
      await sleep(act.settleMs ?? 400);
    }
    else { throw new Error('unknown action: ' + JSON.stringify(act)); }
  }

  // WebGL-context noise is expected under headless; anything else is real.
  const real = errors.filter(e => !/WebGL|GPU/i.test(e));
  if (real.length) { console.error('RUNTIME ERRORS:\n' + real.join('\n')); failed = true; }
} catch (e) {
  console.error('interact failed:', e.message);
  failed = true;
} finally {
  try { chrome?.kill(); } catch {}
}
process.exit(failed ? 1 : 0);
