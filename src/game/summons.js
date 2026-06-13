// Summon system (召唤): exclamation + comma + a known name, no verb.
// Kept out of the evaluator so the evaluation pipeline stays DOM-free.
import { G } from './state.js';
import { showFloatingText } from '../utils.js';
import { playSFX } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { dealDamageToEnemy } from './damage.js';
import { drawCards } from './combat.js';

export const SUMMON_EFFECTS = {
  '初音未来': {
    name: '初音唱歌', emoji: '🎤', desc: '音波伤害全体敌人4点',
    apply() {
      G.enemies.forEach((e, i) => {
        if (e.hp > 0) dealDamageToEnemy(i, 4, false);
      });
      showFloatingText(document.querySelector('#enemy-area'), '🎤 音波攻击！', '#3A7B8C');
    }
  },
  '李清照': {
    name: '李清照吟诗', emoji: '📜', desc: '下回合所有句子质量+0.5',
    apply() {
      G.poeticAuraNext = true;
      showFloatingText(document.querySelector('#combat-top'), '📜 诗意加持！下回合+0.5', '#c9a84c');
    }
  },
  '猫': {
    name: '猫出来了', emoji: '🐱', desc: '50%全体伤害6，50%啥也不干',
    apply() {
      if (Math.random() < 0.5) {
        G.enemies.forEach((e, i) => { if (e.hp > 0) dealDamageToEnemy(i, 6, false); });
        showFloatingText(document.querySelector('#enemy-area'), '🐱 猫猫发威！全体6伤害', '#e8873a');
      } else {
        showFloatingText(document.querySelector('#combat-top'), '🐱 喵？（啥也没干）', '#7A7872');
      }
    }
  },
  '僧人': {
    name: '僧人念经', emoji: '🙏', desc: '回血8',
    apply() {
      G.hp = Math.min(G.maxHp, G.hp + 8);
      playSFX('heal');
      VFX.damageNum(document.getElementById('player-status-bar'), '+8♥', '#4A7C6B', 2.5);
      VFX.rollHp(document.getElementById('combat-hp'));
    }
  },
  '女侠': {
    name: '女侠出场', emoji: '⚔️', desc: '随机敌人穿透攻击10',
    apply() {
      const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        dealDamageToEnemy(t, 10, true);
        showFloatingText(G.enemies[t].element, '⚔️ 女侠穿透！', '#C54B3C');
      }
    }
  },
  '剑客': {
    name: '剑客砍一刀', emoji: '🗡️', desc: '单体伤害12',
    apply() {
      const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        dealDamageToEnemy(t, 12, false);
        showFloatingText(G.enemies[t].element, '🗡️ 剑客一刀！', '#B8862B');
      }
    }
  },
  '酒仙': {
    name: '酒仙上场', emoji: '🍶', desc: '随机+1~3力量',
    apply() {
      const gain = Math.floor(Math.random() * 3) + 1;
      G.strength += gain;
      showFloatingText(document.querySelector('#combat-top'), `🍶 酒仙+${gain}力量`, '#70d490');
    }
  },
  '月兔': {
    name: '月兔祝福', emoji: '🐰', desc: '回血5+下回合+1能量',
    apply() {
      G.hp = Math.min(G.maxHp, G.hp + 5);
      G._bonusEnergyNext = (G._bonusEnergyNext || 0) + 1;
      playSFX('heal');
      VFX.damageNum(document.getElementById('player-status-bar'), '+5♥', '#4A7C6B', 2.2);
      showFloatingText(document.querySelector('#combat-top'), '🐰 下回合+1能量', '#c9a84c');
      VFX.rollHp(document.getElementById('combat-hp'));
    }
  },
  '狐仙': {
    name: '狐仙魅惑', emoji: '🦊', desc: '敌人全体易伤2回合',
    apply() {
      G.enemies.forEach(e => { if (e.hp > 0) e.vulnerable = (e.vulnerable || 0) + 2; });
      showFloatingText(document.querySelector('#enemy-area'), '🦊 全体易伤！', '#6B4C6E');
    }
  },
  '书生': {
    name: '书生献策', emoji: '📚', desc: '抽2张牌',
    apply() {
      drawCards(2);
      showFloatingText(document.querySelector('#combat-top'), '📚 抽2牌！', '#7090d4');
    }
  },
};

// Detect summon pattern: exclamation + comma + subject(non-我), no verb.
// Returns { summonName, exclamationCards, text } or null.
export function detectSummon(cards) {
  const hasVerb = cards.some(c => c.pos === 'verb');
  if (hasVerb) return null;

  const hasExclamation = cards.some(c => c.pos === 'exclamation');
  const hasComma = cards.some(c => c.pos === 'punctuation' && c.punctType === 'comma');
  const subjects = cards.filter(c => c.pos === 'subject' && c.word !== '我');

  if (!hasExclamation || !hasComma || subjects.length === 0) return null;

  const summonName = subjects[0].word;
  if (!SUMMON_EFFECTS[summonName]) return null;

  return {
    summonName,
    exclamationCards: cards.filter(c => c.pos === 'exclamation'),
    text: cards.map(c => c.word).join(''),
  };
}
