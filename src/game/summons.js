// Summon system (召唤): exclamation + comma + a known name, no verb.
// Kept out of the evaluator so the evaluation pipeline stays DOM-free.
import { G } from './state.js';
import { showFloatingText } from '../utils.js';
import { playSFX } from './audio.js';
import { VFX } from '../ui/vfx.js';
import { dealDamageToEnemy } from './damage.js';
import { drawCards } from './combat.js';
import { scaleSummonValue } from './sentenceJudgeCore.js';
import { detectSummonPattern } from './summonPattern.js';

export const SUMMON_EFFECTS = {
  '初音未来': {
    name: '初音未来', emoji: '🎤', desc: '音波伤害全体敌人4点',
    apply(judge) {
      const damage = scaleSummonValue(4, judge);
      G.enemies.forEach((e, i) => {
        if (e.hp > 0) dealDamageToEnemy(i, damage, false);
      });
      showFloatingText(document.querySelector('#enemy-area'), `🎤 音波攻击！全体${damage}`, '#3A7B8C');
    }
  },
  '李清照': {
    name: '李清照吟诗', emoji: '📜', desc: '下回合所有句子质量+0.5',
    apply(_judge) {
      G.poeticAuraNext = true;
      showFloatingText(document.querySelector('#combat-top'), '📜 诗意加持！下回合+0.5', '#c9a84c');
    }
  },
  '猫': {
    name: '猫出来了', emoji: '🐱', desc: '50%全体伤害6，50%啥也不干',
    apply(judge) {
      if (Math.random() < 0.5) {
        const damage = scaleSummonValue(6, judge);
        G.enemies.forEach((e, i) => { if (e.hp > 0) dealDamageToEnemy(i, damage, false); });
        showFloatingText(document.querySelector('#enemy-area'), `🐱 猫猫发威！全体${damage}伤害`, '#e8873a');
      } else {
        showFloatingText(document.querySelector('#combat-top'), '🐱 喵？（啥也没干）', '#7A7872');
      }
    }
  },
  '僧人': {
    name: '僧人念经', emoji: '🙏', desc: '回血8',
    apply(judge) {
      const heal = scaleSummonValue(8, judge);
      G.hp = Math.min(G.maxHp, G.hp + heal);
      playSFX('heal');
      VFX.damageNum(document.getElementById('player-status-bar'), `+${heal}♥`, '#4A7C6B', 2.5);
      VFX.rollHp(document.getElementById('combat-hp'));
    }
  },
  '女侠': {
    name: '女侠出场', emoji: '⚔️', desc: '随机敌人穿透攻击10',
    apply(judge) {
      const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        const damage = scaleSummonValue(10, judge);
        dealDamageToEnemy(t, damage, true);
        showFloatingText(G.enemies[t].element, `⚔️ 女侠穿透${damage}！`, '#C54B3C');
      }
    }
  },
  '剑客': {
    name: '剑客砍一刀', emoji: '🗡️', desc: '单体伤害12',
    apply(judge) {
      const alive = G.enemies.map((e, i) => e.hp > 0 ? i : -1).filter(i => i >= 0);
      if (alive.length > 0) {
        const t = alive[Math.floor(Math.random() * alive.length)];
        const damage = scaleSummonValue(12, judge);
        dealDamageToEnemy(t, damage, false);
        showFloatingText(G.enemies[t].element, `🗡️ 剑客一刀${damage}！`, '#B8862B');
      }
    }
  },
  '酒仙': {
    name: '酒仙上场', emoji: '🍶', desc: '随机+1~3力量',
    apply(judge) {
      const gain = scaleSummonValue(Math.floor(Math.random() * 3) + 1, judge);
      G.strength += gain;
      showFloatingText(document.querySelector('#combat-top'), `🍶 酒仙+${gain}力量`, '#70d490');
    }
  },
  '月兔': {
    name: '月兔祝福', emoji: '🐰', desc: '回血5+下回合+1能量',
    apply(judge) {
      const heal = scaleSummonValue(5, judge);
      G.hp = Math.min(G.maxHp, G.hp + heal);
      G._bonusEnergyNext = (G._bonusEnergyNext || 0) + 1;
      playSFX('heal');
      VFX.damageNum(document.getElementById('player-status-bar'), `+${heal}♥`, '#4A7C6B', 2.2);
      showFloatingText(document.querySelector('#combat-top'), '🐰 下回合+1能量', '#c9a84c');
      VFX.rollHp(document.getElementById('combat-hp'));
    }
  },
  '狐仙': {
    name: '狐仙魅惑', emoji: '🦊', desc: '敌人全体易伤2回合',
    apply(judge) {
      const turns = scaleSummonValue(2, judge);
      G.enemies.forEach(e => { if (e.hp > 0) e.vulnerable = (e.vulnerable || 0) + turns; });
      showFloatingText(document.querySelector('#enemy-area'), '🦊 全体易伤！', '#6B4C6E');
    }
  },
  '书生': {
    name: '书生献策', emoji: '📚', desc: '抽2张牌',
    apply(judge) {
      const count = scaleSummonValue(2, judge);
      drawCards(count);
      showFloatingText(document.querySelector('#combat-top'), `📚 抽${count}牌！`, '#7090d4');
    }
  },
};

// Detect summon pattern: exclamation + comma + subject(non-我), no verb.
// Returns { summonName, exclamationCards, text } or null.
export function detectSummon(cards) {
  const match = detectSummonPattern(cards);
  return match && SUMMON_EFFECTS[match.summonName] ? match : null;
}
