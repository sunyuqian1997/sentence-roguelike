import { G } from './state.js';
import { showFloatingText } from '../utils.js';
import { playSFX } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { gameOver } from '../ui/screens.js';
import { combatVictory } from './combat.js';

export function dealDamageToEnemy(idx, amount, ignoreBlock) {
  const enemy = G.enemies[idx];
  if (!enemy || enemy.hp <= 0) return;
  if (enemy.vulnerable > 0) amount = Math.floor(amount * 1.5);
  if (enemy.reflecting) dealDamageToPlayer(Math.floor(amount * 0.5), enemy);

  if (!ignoreBlock && enemy.block > 0) {
    if (amount <= enemy.block) {
      enemy.block -= amount;
      if (enemy.element) { showFloatingText(enemy.element, `-${amount}`, '#6b9fff'); VFX.enemyHit(enemy.element); }
      return;
    }
    amount -= enemy.block;
    if (enemy.element) showFloatingText(enemy.element, `-${enemy.block}挡`, '#6b9fff');
    enemy.block = 0;
  }
  enemy.hp -= amount;
  if (enemy.hp < 0) enemy.hp = 0;
  playSFX('hit');
  if (enemy.element) {
    VFX.damageNum(enemy.element, `-${amount}`, '#ff6b6b', amount >= 20 ? 3.2 : amount >= 10 ? 2.5 : 2);
    VFX.enemyHit(enemy.element);
    if (amount >= 15) VFX.shake('sm');
    if (amount >= 25) VFX.shake('md');
    if (enemy.hp <= 0) setTimeout(() => VFX.enemyDeath(enemy.element), 200);
  }
}

export function dealDamageToPlayer(amount, source) {
  if (source && source.strength) amount += source.strength;
  if (source && source.weak > 0) amount = Math.floor(amount * 0.75);
  if (G.vulnerable > 0) amount = Math.floor(amount * 1.5);

  if (G._thorns && G._thorns > 0 && source && source.hp > 0) {
    const thornsDmg = G._thorns;
    source.hp -= thornsDmg;
    if (source.hp < 0) source.hp = 0;
    if (source.element) showFloatingText(source.element, `-${thornsDmg}反伤`, '#d4a870');
  }

  if (G.block > 0) {
    if (amount <= G.block) {
      G.block -= amount;
      showFloatingText(document.querySelector('#combat-top'), `挡住${amount}`, '#6b9fff');
      playSFX('block');
      return;
    }
    const blocked = G.block; amount -= G.block; G.block = 0;
    showFloatingText(document.querySelector('#combat-top'), `挡住${blocked}`, '#6b9fff');
  }

  G.hp -= amount;
  if (G.hp < 0) G.hp = 0;
  VFX.damageNum(document.getElementById('player-status-bar'), `-${amount}`, '#ff6b6b', amount >= 15 ? 3 : 2.2);
  VFX.shake(amount >= 15 ? 'md' : 'sm');
  VFX.rollHp(document.getElementById('combat-hp'));
  if (G.hp <= 0) setTimeout(gameOver, 500);
}

export function checkEnemies() {
  if (G.enemies.every(e => e.hp <= 0)) setTimeout(combatVictory, 600);
}
