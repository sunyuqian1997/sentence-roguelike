import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const httpGet=u=>new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});
const ch=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--remote-debugging-port=9291','--user-data-dir=/tmp/enui','--window-size=1366,768','about:blank'],{stdio:'ignore'});
try{
  let t;for(let i=0;i<40;i++){try{t=JSON.parse(await httpGet('http://localhost:9291/json'));if(t.length)break;}catch{await sleep(200);}}
  const p=t.find(x=>x.type==='page'); const ws=new WebSocket(p.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:1<<28});
  const pend=new Map();let id=0; await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
  ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(me,pa={})=>new Promise((rs,rj)=>{const i=++id;pend.set(i,r=>r.error?rj(new Error(me)):rs(r.result));ws.send(JSON.stringify({id:i,method:me,params:pa}));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'http://localhost:5173/'}); await sleep(700);
  await send('Runtime.evaluate',{expression:`(()=>{const m=JSON.parse(localStorage.getItem('sentence_rogue_meta')||'{}');m.lang='en';localStorage.setItem('sentence_rogue_meta',JSON.stringify(m));})()`});
  // TITLE screen shot
  await send('Page.navigate',{url:'http://localhost:5173/'}); await sleep(1500);
  let s=await send('Page.captureScreenshot',{format:'png'}); writeFileSync('/tmp/en-title.png',Buffer.from(s.data,'base64'));
  // COMBAT shot with English sentence staged
  await send('Page.navigate',{url:'http://localhost:5173/?autocombat=1'}); await sleep(2800);
  await send('Runtime.evaluate',{expression:`(async()=>{
    const G=window.G; const enc=(await import('/src/lang/en/cards.json')).default;
    const bw={}; for(const k in enc){const d=enc[k]; if(d&&d.word) bw[d.word.toLowerCase()]={...d,key:k};}
    const mk=w=>({...bw[w],id:'e'+Math.random()});
    G.sentence=[mk('i'),mk('silently'),mk('slay')];
    window.__renderCombat();
  })()`,awaitPromise:true}); await sleep(700);
  s=await send('Page.captureScreenshot',{format:'png'}); writeFileSync('/tmp/en-combat2.png',Buffer.from(s.data,'base64'));
  console.log('saved title + combat'); ws.close();
} finally { ch.kill(); }
