import { G } from './state.js';
import { shuffleArray } from '../utils.js';
import { ENEMY_DEFS } from '../data/enemies.js';
import { showScreen } from '../ui/render.js';
import { startCombat } from './combat.js';
import { showRestScreen, showEventScreen, showShopScreen } from '../ui/screens.js';
import { playStory } from '../ui/storyOverlay.js';
import STORY_CHAPTERS from '../data/story.json';

// ============================================================
// MAP
// ============================================================
export function generateMap(act) {
  const rows = [];
  rows.push([{ type:'fight', connections:[], visited:false, available:true, col:0 }]);
  const slots = [1,2,3,4,5]; shuffleArray(slots);
  const [eliteR, restR, eventR, shopR] = slots;

  for (let r=1; r<=5; r++) {
    const nc = 2 + Math.floor(Math.random()*2);
    const rn = [];
    for (let i=0; i<nc; i++) {
      let type = 'fight';
      if (r===eliteR && i===0) type='elite';
      else if (r===restR && i===Math.floor(nc/2)) type='rest';
      else if (r===eventR && i===0) type='event';
      else if (r===shopR && i===nc-1) type='shop';
      rn.push({ type, connections:[], visited:false, available:false, col:i });
    }
    rows.push(rn);
  }
  rows.push([{ type:'boss', connections:[], visited:false, available:false, col:0 }]);

  for (let r=0; r<rows.length-1; r++) {
    const cur = rows[r], nxt = rows[r+1];
    cur.forEach((node, ni) => {
      if (nxt.length === 1) { node.connections.push(0); }
      else {
        const ratio = ni / Math.max(1, cur.length-1);
        const ti = Math.round(ratio * (nxt.length-1));
        node.connections.push(ti);
        if (Math.random()<0.5) {
          const alt = ti + (Math.random()<0.5?1:-1);
          if (alt>=0 && alt<nxt.length && !node.connections.includes(alt)) node.connections.push(alt);
        }
      }
    });
    nxt.forEach((_, ni) => {
      if (!cur.some(n => n.connections.includes(ni))) {
        cur[Math.floor(Math.random()*cur.length)].connections.push(ni);
      }
    });
  }
  return rows;
}

export function renderMap() {
  const c = document.getElementById('map-container');
  c.innerHTML = ''; c.style.position = 'relative';
  document.getElementById('map-hp').textContent = `${G.hp}/${G.maxHp}`;
  document.getElementById('map-gold').textContent = G.gold;
  document.getElementById('map-act-label').textContent = G.actNames[G.act];

  const icons = { fight:'⚔️', elite:'💀', rest:'🌙', event:'❓', shop:'🏮', boss:'👑' };
  const nodePositions = [];

  G.map.forEach((row, ri) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'map-row';
    const rowPos = [];
    row.forEach((node, ni) => {
      const nd = document.createElement('div');
      nd.className = 'map-node';
      nd.textContent = icons[node.type] || '?';
      if (node.visited) nd.classList.add('visited');
      if (node.available) nd.classList.add('available');
      if (ri===G.currentRow && ni===G.currentNodeIndex) nd.classList.add('current');
      if (node.available && !node.visited) nd.onclick = () => visitNode(ri, ni);
      rowDiv.appendChild(nd);
      rowPos.push({ node:nd, connections: node.connections });
    });
    nodePositions.push(rowPos);
    c.appendChild(rowDiv);
  });

  requestAnimationFrame(() => {
    const old = c.querySelector('svg.map-lines');
    if (old) old.remove();
    const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.classList.add('map-lines');
    Object.assign(svg.style, { position:'absolute', top:'0', left:'0', width:'100%', height:'100%', pointerEvents:'none', zIndex:'0' });
    const cr = c.getBoundingClientRect();
    nodePositions.forEach((row, ri) => {
      if (ri >= G.map.length-1) return;
      row.forEach(({node:fn, connections}) => {
        const fr = fn.getBoundingClientRect();
        const fx = fr.left+fr.width/2-cr.left, fy = fr.top+fr.height/2-cr.top;
        connections.forEach(ci => {
          if (ri+1<nodePositions.length && ci<nodePositions[ri+1].length) {
            const tn = nodePositions[ri+1][ci].node;
            const tr = tn.getBoundingClientRect();
            const line = document.createElementNS('http://www.w3.org/2000/svg','line');
            line.setAttribute('x1',fx); line.setAttribute('y1',fy);
            line.setAttribute('x2',tr.left+tr.width/2-cr.left); line.setAttribute('y2',tr.top+tr.height/2-cr.top);
            line.setAttribute('stroke','rgba(201,168,76,0.15)'); line.setAttribute('stroke-width','1.5');
            svg.appendChild(line);
          }
        });
      });
    });
    c.appendChild(svg);
  });
}

export function visitNode(row, ni) {
  const node = G.map[row][ni];
  if (!node.available || node.visited) return;
  node.visited = true;
  G.currentRow = row; G.currentNodeIndex = ni;
  G.map.forEach(r => r.forEach(n => n.available = false));
  if (row < G.map.length-1) node.connections.forEach(ci => { if(ci<G.map[row+1].length) G.map[row+1][ci].available = true; });
  G.floorsCleared++;
  switch(node.type) {
    case 'fight': startCombat(getRandomEnemies(G.act,'normal')); break;
    case 'elite': startCombat(getRandomEnemies(G.act,'elite')); break;
    case 'boss': {
      const bossStoryKey = 'act' + G.act + '_boss';
      const enemies = getRandomEnemies(G.act,'boss');
      if (STORY_CHAPTERS[bossStoryKey]) {
        playStory(bossStoryKey, function() { startCombat(enemies); });
      } else {
        startCombat(enemies);
      }
      break;
    }
    case 'rest': showRestScreen(); break;
    case 'event': showEventScreen(); break;
    case 'shop': showShopScreen(); break;
  }
}

export function getRandomEnemies(act, type) {
  const pool = [];
  for (const [key, def] of Object.entries(ENEMY_DEFS)) {
    if (def.act === act && def.type === type) pool.push({...def, enemyKey:key});
  }
  if (type === 'normal') {
    const count = Math.random()<0.4 ? 2 : 1;
    const avail = [...pool]; const res = [];
    for (let i=0; i<count && avail.length>0; i++) {
      const idx = Math.floor(Math.random()*avail.length);
      res.push({...avail[idx]}); avail.splice(idx,1);
    }
    return res;
  }
  return [{ ...pool[Math.floor(Math.random()*pool.length)] }];
}
