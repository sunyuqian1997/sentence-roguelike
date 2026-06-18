import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const httpGet=u=>new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});
async function cap(port){
  const ch=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/gv${port}`,'about:blank'],{stdio:'ignore'});
  try{ let t;for(let i=0;i<40;i++){try{t=JSON.parse(await httpGet(`http://localhost:${port}/json`));if(t.length)break;}catch{await sleep(200);}}
    const p=t.find(x=>x.type==='page'); const ws=new WebSocket(p.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:1<<28});
    const pend=new Map();let id=0; await new Promise((r,j)=>{ws.on('open',r);ws.on('error',j);});
    ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
    const send=(me,pa={})=>new Promise((rs,rj)=>{const i=++id;pend.set(i,r=>r.error?rj(new Error(me)):rs(r.result));ws.send(JSON.stringify({id:i,method:me,params:pa}));});
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.navigate',{url:'http://localhost:5173/scripts/golden-capture.html'}); await sleep(2500);
    const r=await send('Runtime.evaluate',{expression:'window.__GOLDEN__',returnByValue:true}); ws.close();
    return JSON.parse(r.result.value);
  } finally { ch.kill(); }
}
const now=await cap(9271);
const base=JSON.parse(readFileSync('golden-zh.json','utf8'));
const diff=base.map((b,i)=>JSON.stringify(b)!==JSON.stringify(now[i])?b.s:null).filter(Boolean);
console.log(diff.length? '❌ zh 回归:'+JSON.stringify(diff) : '✅ zh golden 一致,零回归');
