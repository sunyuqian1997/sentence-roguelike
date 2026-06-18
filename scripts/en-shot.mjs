import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const httpGet=u=>new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});
const ch=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox','--hide-scrollbars','--remote-debugging-port=9281','--user-data-dir=/tmp/ens','--window-size=1366,768','about:blank'],{stdio:'ignore'});
try{
  let t;for(let i=0;i<40;i++){try{t=JSON.parse(await httpGet('http://localhost:9281/json'));if(t.length)break;}catch{await sleep(200);}}
  const p=t.find(x=>x.type==='page'); const ws=new WebSocket(p.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:1<<28});
  const pend=new Map();let id=0; await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
  ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
  const send=(me,pa={})=>new Promise((rs,rj)=>{const i=++id;pend.set(i,r=>r.error?rj(new Error(me)):rs(r.result));ws.send(JSON.stringify({id:i,method:me,params:pa}));});
  await send('Runtime.enable');await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1366,height:768,deviceScaleFactor:1,mobile:false});
  // set lang=en in localStorage BEFORE load so cards.js picks en
  await send('Page.navigate',{url:'http://localhost:5173/'}); await sleep(800);
  await send('Runtime.evaluate',{expression:`(()=>{const m=JSON.parse(localStorage.getItem('sentence_rogue_meta')||'{}');m.lang='en';localStorage.setItem('sentence_rogue_meta',JSON.stringify(m));})()`});
  await send('Page.navigate',{url:'http://localhost:5173/?autocombat=1'}); await sleep(2800);
  // stage an English sentence in the tray
  await send('Runtime.evaluate',{expression:`(async()=>{
    const G=window.G; const enc=(await import('/src/lang/en/cards.json')).default;
    const bw={}; for(const k in enc){const d=enc[k]; if(d&&d.word) bw[d.word.toLowerCase()]={...d,key:k};}
    const mk=w=>({...bw[w],id:'e'+Math.random()});
    G.sentence=[mk('i'),mk('fiercely'),mk('slay'),{word:G.enemies[0].name,pos:'object',_isEnemyTarget:true,_enemyIdx:0,id:'z'}];
    window.__renderCombat();
  })()`,awaitPromise:true});
  await sleep(700);
  const {data}=await send('Page.captureScreenshot',{format:'png'});
  writeFileSync(process.argv[2]||'/tmp/en.png',Buffer.from(data,'base64'));
  // also report hand words + deck size to prove en deck loaded
  const r=await send('Runtime.evaluate',{expression:'JSON.stringify({hand:window.G.hand.map(c=>c.word), deck:window.G.deck.length, lang:window.G.META?window.G.META.lang:"?"})',returnByValue:true});
  console.log(r.result.value);
  ws.close();
} finally { ch.kill(); }
