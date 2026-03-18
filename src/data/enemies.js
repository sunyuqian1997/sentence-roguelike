import { G } from '../game/state.js';
import { showFloatingText } from '../utils.js';
import { dealDamageToPlayer } from '../game/damage.js';

export const ENEMY_DEFS = {
  moyao: {
    name: '墨妖', hp: 20, act: 1, type: 'normal', emoji: '🖤',
    ai(e) { e.nextIntent = { type:'attack', value: 6+Math.floor(Math.random()*3), icon:'⚔' }; },
    act_fn(e) { dealDamageToPlayer(e.nextIntent.value, e); }
  },
  zhigui: {
    name: '纸鬼', hp: 24, act: 1, type: 'normal', emoji: '📜',
    ai(e) {
      if(!e.tc) e.tc=0; e.tc++;
      if(e.tc%2===1) e.nextIntent={type:'attack',value:3,hits:3,icon:'⚔'};
      else e.nextIntent={type:'defend',value:6,icon:'🛡',label:'挡6'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') { for(let i=0;i<3;i++){if(e.hp<=0)break;dealDamageToPlayer(3,e);} }
      else { e.block+=6; }
    }
  },
  canju: {
    name: '残句怪', hp: 16, act: 1, type: 'normal', emoji: '❓',
    ai(e) { e.nextIntent={type:'attack',value:9,icon:'⚔'}; },
    act_fn(e) { dealDamageToPlayer(9,e); }
  },
  wenqu: {
    name: '文曲星', hp: 48, act: 1, type: 'elite', emoji: '⭐',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(e.tc%3===0) e.nextIntent={type:'special',value:0,icon:'✂',label:'消耗'};
      else e.nextIntent={type:'attack',value:11,icon:'⚔'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') dealDamageToPlayer(11,e);
      else {
        if(G.hand.length>0) {
          const idx=Math.floor(Math.random()*G.hand.length);
          G.exhaustPile.push(G.hand.splice(idx,1)[0]);
          showFloatingText(document.querySelector('#combat-top'),'词牌消耗！','#d4a870');
        }
      }
    }
  },
  bijing: {
    name: '笔精', hp: 55, act: 2, type: 'elite', emoji: '🖊️',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(e.tc%3===0) e.nextIntent={type:'debuff',value:0,icon:'↓',label:'易伤2'};
      else e.nextIntent={type:'attack',value:10,icon:'⚔'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') dealDamageToPlayer(10,e);
      else { G.vulnerable+=2; showFloatingText(document.querySelector('#combat-top'),'易伤！','#d47070'); }
    }
  },
  cangjie: {
    name: '仓颉之影', hp: 95, act: 1, type: 'boss', emoji: '👁️',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(!e.phase2&&e.hp<=47){e.phase2=true;e.tc=1;}
      if(!e.phase2) {
        if(e.tc%3===0) e.nextIntent={type:'buff',value:2,icon:'↑',label:'+2力'};
        else e.nextIntent={type:'attack',value:12,icon:'⚔'};
      } else e.nextIntent={type:'attack',value:9,hits:2,icon:'⚔'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') {
        const h=e.nextIntent.hits||1;
        for(let i=0;i<h;i++){if(e.hp<=0)break;dealDamageToPlayer(e.nextIntent.value,e);}
      } else if(e.nextIntent.type==='buff') {
        e.strength=(e.strength||0)+2;
        showFloatingText(e.element,'+2力','#70d490');
      }
    }
  },
  mohun: {
    name: '墨魂', hp: 28, act: 2, type: 'normal', emoji: '💀',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(e.tc%2===1) e.nextIntent={type:'attack',value:8,icon:'⚔'};
      else e.nextIntent={type:'buff',value:4,icon:'♥',label:'回4血'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') dealDamageToPlayer(8,e);
      else { e.hp=Math.min(e.maxHp,e.hp+4); showFloatingText(e.element,'+4','#6bff6b'); }
    }
  },
  luoren: {
    name: '落人', hp: 36, act: 2, type: 'normal', emoji: '👤',
    ai(e) { e.nextIntent={type:'attack',value:14+Math.floor(Math.random()*4),icon:'⚔'}; },
    act_fn(e) { dealDamageToPlayer(e.nextIntent.value,e); }
  },
  jingmo: {
    name: '镜墨', hp: 32, act: 2, type: 'normal', emoji: '🪞',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(e.tc%2===1) e.nextIntent={type:'attack',value:7,icon:'⚔'};
      else { e.nextIntent={type:'defend',value:7,icon:'🛡',label:'反射'}; e.reflecting=true; }
    },
    act_fn(e) {
      e.reflecting=false;
      if(e.nextIntent.type==='attack') dealDamageToPlayer(7,e);
      else { e.block+=7; e.reflecting=true; }
    }
  },
  shisheng: {
    name: '诗圣残魂', hp: 115, act: 2, type: 'boss', emoji: '📖',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      const p=[
        {type:'attack',value:11,icon:'⚔'},
        {type:'attack',value:7,hits:2,icon:'⚔'},
        {type:'defend',value:12,icon:'🛡',label:'挡12'},
        {type:'attack',value:15,icon:'⚔'},
      ];
      e.nextIntent={...p[(e.tc-1)%p.length]};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') {
        const h=e.nextIntent.hits||1;
        for(let i=0;i<h;i++){if(e.hp<=0)break;dealDamageToPlayer(e.nextIntent.value,e);}
      } else e.block+=12;
    }
  },
  xuwen: {
    name: '虚文', hp: 34, act: 3, type: 'normal', emoji: '🌀',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      e.nextIntent={type:'attack',value:6+(e.strength||0),icon:'⚔'};
    },
    act_fn(e) {
      dealDamageToPlayer(e.nextIntent.value,e);
      e.strength=(e.strength||0)+1;
      showFloatingText(e.element,'+1力','#70d490');
    }
  },
  mojie: {
    name: '墨劫', hp: 65, act: 3, type: 'elite', emoji: '🌑',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(e.tc%3===1) e.nextIntent={type:'debuff',value:0,icon:'↓',label:'虚弱+易伤'};
      else e.nextIntent={type:'attack',value:12,icon:'⚔'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') dealDamageToPlayer(12,e);
      else { G.vulnerable+=2; G.weak+=2; showFloatingText(document.querySelector('#combat-top'),'虚弱+易伤！','#d47070'); }
    }
  },
  cidi: {
    name: '词帝幽灵', hp: 135, act: 3, type: 'boss', emoji: '👑',
    ai(e) {
      if(!e.tc)e.tc=0; e.tc++;
      if(!e.phase)e.phase=1;
      if(e.phase===1&&e.hp<=95){e.phase=2;showFloatingText(e.element,'第二阶段！','#b470d4');}
      if(e.phase===2&&e.hp<=50){e.phase=3;showFloatingText(e.element,'最终阶段！','#ff6b6b');}
      if(e.phase===1) {
        if(e.tc%2===1) e.nextIntent={type:'attack',value:11,icon:'⚔'};
        else e.nextIntent={type:'buff',value:2,icon:'↑',label:'+2力'};
      } else if(e.phase===2) {
        if(e.tc%3===0) e.nextIntent={type:'debuff',value:0,icon:'↓',label:'虚弱+易伤'};
        else e.nextIntent={type:'attack',value:14,icon:'⚔'};
      } else e.nextIntent={type:'attack',value:8,hits:3,icon:'⚔'};
    },
    act_fn(e) {
      if(e.nextIntent.type==='attack') {
        const h=e.nextIntent.hits||1;
        for(let i=0;i<h;i++){if(e.hp<=0)break;dealDamageToPlayer(e.nextIntent.value,e);}
      } else if(e.nextIntent.type==='buff') {
        e.strength=(e.strength||0)+2;
        showFloatingText(e.element,'+2力','#70d490');
      } else {
        G.vulnerable+=2; G.weak+=2;
        showFloatingText(document.querySelector('#combat-top'),'虚弱+易伤！','#d47070');
      }
    }
  },
};
