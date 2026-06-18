// 用 probe 同款 CDP 跑 golden-capture 两次,比对确定性,一致则写 golden-zh.json。
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import http from 'node:http';
import { WebSocket } from 'ws';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const httpGet=u=>new Promise((res,rej)=>{http.get(u,r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>res(d));}).on('error',rej);});
async function capture(port){
  const chrome=spawn(CHROME,['--headless=new','--disable-gpu','--no-sandbox',`--remote-debugging-port=${port}`,`--user-data-dir=/tmp/cg${port}`,'about:blank'],{stdio:'ignore'});
  try{
    let t;for(let i=0;i<40;i++){try{t=JSON.parse(await httpGet(`http://localhost:${port}/json`));if(t.length)break;}catch{await sleep(200);}}
    const page=t.find(x=>x.type==='page');
    const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false,maxPayload:1<<28});
    const pend=new Map();let id=0;
    await new Promise((res,rej)=>{ws.on('open',res);ws.on('error',rej);});
    ws.on('message',b=>{const m=JSON.parse(b.toString());if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}});
    const send=(method,params={})=>new Promise((rs,rj)=>{const i=++id;pend.set(i,r=>r.error?rj(new Error(method)):rs(r.result));ws.send(JSON.stringify({id:i,method,params}));});
    await send('Runtime.enable');await send('Page.enable');
    await send('Page.navigate',{url:'http://localhost:5173/scripts/golden-capture.html'});
    await sleep(2500);
    const r=await send('Runtime.evaluate',{expression:'window.__GOLDEN__',returnByValue:true});
    ws.close();
    return JSON.parse(r.result.value);
  } finally { chrome.kill(); }
}
const a=await capture(9261); const b=await capture(9262);
const diff=a.map((x,i)=>JSON.stringify(x)!==JSON.stringify(b[i])?x.s:null).filter(Boolean);
console.log('两次差异:', diff.length?diff:'无—确定性✓','| 句数',a.length);
if(!diff.length){ writeFileSync('golden-zh.json', JSON.stringify(a,null,1)); console.log('已基线 golden-zh.json'); }
else process.exit(1);
