import { G, META, saveMeta, LEGACY_PERKS, UNLOCKABLE_CARDS_META } from '../game/state.js';
import { showFloatingText } from '../utils.js';
import { playSFX, stopMusic, playAmbientMusic } from '../game/audio.js';
import { randomCardWeighted } from '../data/cards.js';
import { EVENTS_BY_ACT, EVENTS_FALLBACK } from '../data/events.js';
import { audioCtx, playNote } from '../game/audio.js';
import { createCardElement } from './render.js';
import { showScreen } from './render.js';
import { renderMap } from '../game/map.js';

// ============================================================
// REST
// ============================================================
export function showRestScreen() {
  showScreen('rest-screen');
  const restThemes = [
    { title: '月下独酌', flavor: '明月松间照，清泉石上流。暂且搁笔，品一盏清茶...' },
    { title: '庭院小憩', flavor: '「兴尽晚回舟，误入藕花深处。」花香入梦，暂且歇息...' },
    { title: '雨窗听竹', flavor: '「梧桐更兼细雨，到黄昏、点点滴滴。」雨声如诗，且待天明...' },
  ];
  const theme = restThemes[Math.floor(Math.random() * restThemes.length)];
  document.getElementById('rest-title').textContent = theme.title;
  document.getElementById('rest-flavor').textContent = theme.flavor;
  const h = Math.floor(G.maxHp * 0.3);
  document.getElementById('rest-heal-desc').textContent = `恢复${h}生命 (${G.hp}/${G.maxHp})`;
}
export function restHeal() {
  G.hp = Math.min(G.maxHp, G.hp + Math.floor(G.maxHp * 0.3));
  playSFX('heal'); showScreen('map-screen'); renderMap();
}
export function restUpgrade() {
  const grid = document.getElementById('upgrade-cards-grid');
  grid.innerHTML = '';
  G.deck.forEach((card) => {
    if (card.upgraded) return;
    const preview = { ...card, upgraded: true };
    const el = createCardElement(preview, null, { noClick: true });
    el.style.cursor = 'pointer';
    el.onclick = () => {
      card.upgraded = true;
      playSFX('card'); closeUpgrade();
      showScreen('map-screen'); renderMap();
    };
    grid.appendChild(el);
  });
  document.getElementById('upgrade-overlay').classList.add('active');
}
export function closeUpgrade() { document.getElementById('upgrade-overlay').classList.remove('active'); }

// ============================================================
// EVENT
// ============================================================
export function showEventScreen() {
  const actEvents = EVENTS_BY_ACT[G.act] || EVENTS_FALLBACK;
  const ev = actEvents[Math.floor(Math.random() * actEvents.length)];
  document.getElementById('event-title').textContent = ev.title;
  document.getElementById('event-text').textContent = ev.text;
  const el = document.getElementById('event-choices');
  el.innerHTML = '';
  ev.choices.forEach(ch => {
    const d = document.createElement('div');
    d.className = 'event-choice';
    d.innerHTML = `<div class="choice-label">${ch.label}</div><div class="choice-effect">${ch.effect}</div>`;
    d.onclick = () => { ch.fn(); showScreen('map-screen'); renderMap(); };
    el.appendChild(d);
  });
  showScreen('event-screen');
}

// ============================================================
// SHOP
// ============================================================
export function showShopScreen() { showScreen('shop-screen'); renderShop(); }
export function renderShop() {
  document.getElementById('shop-gold').textContent = G.gold;
  const c = document.getElementById('shop-cards');
  c.innerHTML = '';
  if (!G.shopInventory) {
    G.shopInventory = [];
    for (let i=0; i<5; i++) {
      const roll = Math.random();
      let rarity, price;
      if (roll<0.4) { rarity='common'; price=45+Math.floor(Math.random()*25); }
      else if (roll<0.8) { rarity='uncommon'; price=75+Math.floor(Math.random()*35); }
      else { rarity='rare'; price=110+Math.floor(Math.random()*30); }
      G.shopInventory.push({ card: randomCardWeighted(rarity), price, sold: false });
    }
  }
  G.shopInventory.forEach((item, idx) => {
    if (item.sold) return;
    const w = document.createElement('div');
    w.className = 'shop-card-slot';
    const el = createCardElement(item.card, null, { noClick: true });
    el.style.cursor = 'pointer';
    el.onclick = () => {
      if (G.gold >= item.price && !item.sold) {
        G.gold -= item.price; G.deck.push(item.card); item.sold = true;
        playSFX('card'); renderShop();
      }
    };
    const p = document.createElement('div');
    p.className = `shop-price ${G.gold<item.price?'cannot-afford':''}`;
    p.textContent = `${item.price}文银`;
    w.appendChild(el); w.appendChild(p); c.appendChild(w);
  });
  document.getElementById('shop-remove-btn').style.opacity = G.gold >= 75 ? '1' : '0.4';
}
export function shopRemoveCard() {
  if (G.gold < 75) return;
  const grid = document.getElementById('remove-cards-grid');
  grid.innerHTML = '';
  G.deck.forEach((card, idx) => {
    const el = createCardElement(card, null, { noClick: true });
    el.style.cursor = 'pointer';
    el.onclick = () => { G.deck.splice(idx,1); G.gold-=75; playSFX('card'); closeRemove(); renderShop(); };
    grid.appendChild(el);
  });
  document.getElementById('remove-overlay').classList.add('active');
}
export function closeRemove() { document.getElementById('remove-overlay').classList.remove('active'); }
export function leaveShop() { G.shopInventory=null; showScreen('map-screen'); renderMap(); }

// ============================================================
// DECK VIEW
// ============================================================
export function viewDeck() {
  const grid = document.getElementById('deck-cards-grid');
  grid.innerHTML = '';
  document.getElementById('deck-count').textContent = G.deck.length;
  G.deck.forEach(card => grid.appendChild(createCardElement(card, null, { noClick: true })));
  document.getElementById('deck-overlay').classList.add('active');
}
export function closeDeck() { document.getElementById('deck-overlay').classList.remove('active'); }

// ============================================================
// GAME OVER / VICTORY
// ============================================================
export function calculateInkReward(isVictory) {
  const b = []; let total = 0;
  const add = (l,v) => { if(v>0){b.push({label:l,value:v});total+=v;} };
  add(`行过${G.floorsCleared}层`, G.floorsCleared*2);
  add(`斩精英${G.elitesKilled}`, G.elitesKilled*5);
  add(`败Boss${G.bossesKilled}`, G.bossesKilled*15);
  add(`吟诵${G.sentencesChanted}句`, Math.floor(G.sentencesChanted/3));
  if(G.act>=2) add('至第二章', 5);
  if(G.act>=3) add('至第三章', 10);
  if(isVictory) add('大作已成！', 20);
  if(total<3) { add('最低奖励', 3-total); total=3; }
  return { breakdown:b, total };
}

export function updateMetaAfterRun(isV) {
  const r = calculateInkReward(isV);
  META.ink += r.total; META.totalInk += r.total;
  if(G.act>META.bestAct) META.bestAct=G.act;
  if(G.floorsCleared>META.bestFloor) META.bestFloor=G.floorsCleared;
  saveMeta();
  return { reward: r };
}

export function renderInkBreakdown(id, reward) {
  const el = document.getElementById(id);
  let h = '<div class="ink-reward-breakdown">';
  reward.breakdown.forEach(i => { h+=`<div class="ink-line"><span>${i.label}</span><span style="color:var(--gold)">+${i.value}文气</span></div>`; });
  h += `<div class="ink-line ink-total"><span>总计</span><span>+${reward.total}文气</span></div></div>`;
  el.innerHTML = h;
}

export function gameOver() {
  stopMusic(); playSFX('death');
  const r = updateMetaAfterRun(false);
  showScreen('gameover-screen');
  document.getElementById('gameover-stats').innerHTML = `
    <div>章节：<span>${G.actNames[G.act]}</span></div>
    <div>行过：<span>${G.floorsCleared}层</span></div>
    <div>精英：<span>${G.elitesKilled}</span></div>
    <div>Boss：<span>${G.bossesKilled}</span></div>
    <div>吟诵：<span>${G.sentencesChanted}句</span></div>
    <div>文银：<span>${G.gold}</span></div>
  `;
  renderInkBreakdown('gameover-ink-breakdown', r.reward);
}

export function showVictoryScreen() {
  stopMusic();
  if(audioCtx) {
    const t=audioCtx.currentTime;
    [261.6,329.6,392.0,523.3].forEach((f,i)=>{
      playNote(f,1.5,'sine',t+i*0.4,0.12);
    });
  }
  const r = updateMetaAfterRun(true);
  showScreen('victory-screen');
  document.getElementById('victory-stats').innerHTML = `
    <div>三章完结！</div>
    <div>行过：<span>${G.floorsCleared}层</span></div>
    <div>精英：<span>${G.elitesKilled}</span></div>
    <div>Boss：<span>${G.bossesKilled}</span></div>
    <div>吟诵：<span>${G.sentencesChanted}句</span></div>
    <div>词库：<span>${G.deck.length}张</span></div>
  `;
  renderInkBreakdown('victory-ink-breakdown', r.reward);
}

// ============================================================
// META SCREEN
// ============================================================
export function showMetaScreen() {
  document.getElementById('meta-overlay').classList.add('active');
  renderMetaScreen();
}
export function closeMetaScreen() { document.getElementById('meta-overlay').classList.remove('active'); }

export function renderMetaScreen() {
  document.getElementById('meta-stats').innerHTML = `
    <div class="meta-stat"><div class="stat-val">${META.ink}</div><div class="stat-label">文气</div></div>
    <div class="meta-stat"><div class="stat-val">${META.totalInk}</div><div class="stat-label">累计</div></div>
    <div class="meta-stat"><div class="stat-val">${META.runs}</div><div class="stat-label">冒险</div></div>
    <div class="meta-stat"><div class="stat-val">${META.bestFloor}</div><div class="stat-label">最深</div></div>
  `;

  let ph = '<h3>文房四宝（永久加成）</h3>';
  for (const [key, perk] of Object.entries(LEGACY_PERKS)) {
    const owned = META.perks.includes(key);
    ph += `<div class="meta-item${owned?' purchased':''}">
      <div class="item-info"><div class="item-name">${perk.name}</div><div class="item-desc">${perk.desc}</div></div>
      <div class="item-cost">${perk.cost}文气</div>
      ${owned?'':`<button class="buy-btn" onclick="buyPerk('${key}')" ${META.ink>=perk.cost?'':'disabled'}>购买</button>`}
    </div>`;
  }
  document.getElementById('meta-perks-section').innerHTML = ph;

  let ch = '<h3>解锁新词牌</h3>';
  for (const [key, info] of Object.entries(UNLOCKABLE_CARDS_META)) {
    const owned = META.unlockedCards.includes(key);
    ch += `<div class="meta-item${owned?' purchased':''}">
      <div class="item-info"><div class="item-name">${info.name}</div></div>
      <div class="item-cost">${info.cost}文气</div>
      ${owned?'':`<button class="buy-btn" onclick="buyCardMeta('${key}')" ${META.ink>=info.cost?'':'disabled'}>解锁</button>`}
    </div>`;
  }
  document.getElementById('meta-cards-section').innerHTML = ch;
}

export function buyPerk(key) {
  const p = LEGACY_PERKS[key];
  if(!p||META.perks.includes(key)||META.ink<p.cost) return;
  META.ink-=p.cost; META.perks.push(key); saveMeta(); playSFX('card'); renderMetaScreen();
}
export function buyCardMeta(key) {
  const info = UNLOCKABLE_CARDS_META[key];
  if(!info||META.unlockedCards.includes(key)||META.ink<info.cost) return;
  META.ink-=info.cost; META.unlockedCards.push(key); saveMeta(); playSFX('card'); renderMetaScreen();
}
