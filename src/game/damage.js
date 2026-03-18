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
      if (enemy.element) {
        showFloatingText(enemy.element, `-${amount}`, 'var(--blue-ink)');
        VFX.enemyHit(enemy.element);
      }
      playSFX('block');
      return;
    }
    amount -= enemy.block;
    if (enemy.element) showFloatingText(enemy.element, `-${enemy.block}挡`, 'var(--blue-ink)');
    enemy.block = 0;
  }

  enemy.hp -= amount;
  if (enemy.hp < 0) enemy.hp = 0;

  const isBig = amount >= 20;
  const isCrit = amount >= 30;
  playSFX(isCrit ? 'hit_crit' : isBig ? 'hit_heavy' : 'hit');

  if (enemy.element) {
    const numColor = 'var(--vermillion)';
    const numSize = isCrit ? 3.5 : isBig ? 2.8 : amount >= 10 ? 2.3 : 1.8;
    VFX.damageNum(enemy.element, `-${amount}`, numColor, numSize);
    VFX.enemyHit(enemy.element);

    if (isCrit) {
      VFX.shake('lg');
      VFX.brushStrike();
      const rect = enemy.element.getBoundingClientRect();
      VFX.inkSplash(rect.left + rect.width / 2, rect.top + rect.height / 2, 'rgba(197,75,60,0.4)');
      playSFX('ink_splash');
    } else if (isBig) {
      VFX.shake('md');
      const rect = enemy.element.getBoundingClientRect();
      VFX.inkSplash(rect.left + rect.width / 2, rect.top + rect.height / 2);
    } else if (amount >= 10) {
      VFX.shake('sm');
    }

    if (enemy.hp <= 0) {
      setTimeout(() => {
        VFX.enemyDeath(enemy.element);
        playSFX('death');
      }, 200);
    }
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
    if (source.element) showFloatingText(source.element, `-${thornsDmg}反伤`, 'var(--orange)');
  }

  if (G.block > 0) {
    if (amount <= G.block) {
      G.block -= amount;
      showFloatingText(document.querySelector('#combat-top'), `挡住${amount}`, 'var(--blue-ink)');
      playSFX('block');
      return;
    }
    const blocked = G.block;
    amount -= G.block;
    G.block = 0;
    showFloatingText(document.querySelector('#combat-top'), `挡住${blocked}`, 'var(--blue-ink)');
    playSFX('block');
  }

  G.hp -= amount;
  if (G.hp < 0) G.hp = 0;

  const isBig = amount >= 15;
  playSFX(isBig ? 'hit_heavy' : 'hit');
  VFX.damageNum(document.getElementById('player-status-bar'), `-${amount}`, 'var(--vermillion)', isBig ? 3 : 2.2);
  VFX.shake(isBig ? 'md' : 'sm');
  VFX.rollHp(document.getElementById('combat-hp'));

  if (isBig) {
    VFX.inkSplash(window.innerWidth / 2, window.innerHeight * 0.7, 'rgba(197,75,60,0.3)');
  }

  if (G.hp <= 0) setTimeout(gameOver, 500);
}

export function checkEnemies() {
  if (G.enemies.every(e => e.hp <= 0)) setTimeout(combatVictory, 600);
}
