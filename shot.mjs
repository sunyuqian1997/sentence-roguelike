// Reusable headless-Chrome screenshot tool over raw CDP.
//   node shot.mjs <path> <url> [waitMs]
// Captures runtime console errors too (printed to stderr).
// Assumes a dev/preview server is already running.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';

const [, , OUT = 'shot.png', URL = 'http://localhost:5173/', WAIT = '3500'] = process.argv;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const httpGet = (url) => new Promise((res, rej) => {
  http.get(url, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); }).on('error', rej);
});

let chrome;
try {
  chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--remote-debugging-port=9222', '--window-size=1280,720', 'about:blank',
  ], { stdio: 'ignore' });

  let targets;
  for (let i = 0; i < 40; i++) {
    try { targets = JSON.parse(await httpGet('http://localhost:9222/json')); if (targets.length) break; }
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
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 720, deviceScaleFactor: 2, mobile: false,
  });
  await send('Page.navigate', { url: URL });
  await sleep(parseInt(WAIT, 10));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  if (errors.length) console.error('RUNTIME ERRORS:\n' + errors.join('\n'));
  else console.error('no runtime errors');
  console.log('saved ' + OUT);
  ws.close();
} finally {
  if (chrome) try { chrome.kill(); } catch {}
}
