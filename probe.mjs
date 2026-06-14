// Evaluate an arbitrary JS expression in the live page and print the result.
//   node probe.mjs "<url>" "<expression>"
import { spawn } from 'node:child_process';
import http from 'node:http';
import { WebSocket } from 'ws';

const [, , URL = 'http://localhost:5173/', EXPR = '1+1', WAIT = '3500'] = process.argv;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const httpGet = (url) => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
});

let chrome;
try {
  chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox', '--remote-debugging-port=9223', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 40; i++) { try { targets = JSON.parse(await httpGet('http://localhost:9223/json')); if (targets.length) break; } catch { await sleep(200); } }
  const page = targets.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  const pending = new Map(); let id = 0;
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.on('message', buf => { const m = JSON.parse(buf.toString()); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const myId = ++id; pending.set(myId, r => r.error ? reject(new Error(JSON.stringify(r.error))) : resolve(r.result)); ws.send(JSON.stringify({ id: myId, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: parseInt(process.env.SHOT_W || '1366', 10),
    height: parseInt(process.env.SHOT_H || '768', 10),
    deviceScaleFactor: 1, mobile: false,
  });
  await send('Page.navigate', { url: URL });
  await sleep(parseInt(WAIT, 10));
  const r = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) console.error('EXC:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  else console.log(JSON.stringify(r.result.value, null, 1));
  ws.close();
} finally { if (chrome) try { chrome.kill(); } catch {} }
