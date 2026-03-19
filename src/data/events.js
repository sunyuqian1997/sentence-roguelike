import { G } from '../game/state.js';
import { randomCard } from './cards.js';

export const EVENTS_BY_ACT = {
  1: [
    {
      title: '漂浮的书页',
      text: '一张发光的书页飘到你面前。上面的字迹会随着你的呼吸闪烁。这是某本被拆散的魔法书的碎片。',
      choices: [
        { label: '念出上面的咒语', effect: '获得随机非凡词牌', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '小心收起来', effect: '+25文银', fn() { G.gold += 25; } },
        { label: '让它飘走吧', effect: '+8最大生命', fn() { G.maxHp += 8; G.hp += 8; } },
      ]
    },
    {
      title: '词语泉',
      text: '一汪小小的泉水，水面上漂浮着模糊的文字。泡在水里的字似乎在微微发光，温暖又舒服的样子。',
      choices: [
        { label: '喝一口泉水', effect: '随机升级一张词牌', fn() { upgradeRandomCard(); } },
        { label: '把脚泡进去', effect: '+6最大生命', fn() { G.maxHp += 6; G.hp += 6; } },
      ]
    },
    {
      title: '旧书架',
      text: '角落里有一个旧书架，上面摆着几本布满灰尘的书。其中一本封面在微微发光——《漱玉词》。翻开时指尖有电流感。',
      choices: [
        { label: '读完它', effect: '获得稀有词牌，失去10生命', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 10); } },
        { label: '只看目录', effect: '+15文银', fn() { G.gold += 15; } },
        { label: '带走', effect: '恢复全部生命', fn() { G.hp = G.maxHp; } },
      ]
    },
  ],
  2: [
    {
      title: '回声碎片',
      text: '走廊拐角处，有一个被冻住的句子悬浮在半空中。仔细看，是一句没说完的话——"其实我想说……"',
      choices: [
        { label: '帮它续写完', effect: '获得随机非凡词牌', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '把它收集起来', effect: '+30文银', fn() { G.gold += 30; } },
        { label: '轻轻吹散', effect: '恢复全部生命', fn() { G.hp = G.maxHp; } },
      ]
    },
    {
      title: '文字精灵',
      text: '一个由字符组成的小精灵跳到你肩膀上。它很喜欢你的句子，想跟着你冒险。',
      choices: [
        { label: '收它做伙伴', effect: '随机升级一张词牌', fn() { upgradeRandomCard(); } },
        { label: '教它一个新词', effect: '+2力量', fn() { G.strength += 2; } },
        { label: '给它一颗糖', effect: '+25文银，-8生命', fn() { G.gold += 25; G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
    {
      title: '纸鹤',
      text: '有人叠了一只纸鹤放在窗台上。展开来看，里面写着一行字："你的文字有力量。"落款是一颗小星星。',
      choices: [
        { label: '折一只回去', effect: '移除一张基础词牌', fn() { removeRandomStarter(); } },
        { label: '把星星画下来', effect: '获得稀有词牌，-8生命', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
  ],
  3: [
    {
      title: '最后一个字',
      text: '塔顶的架子上只剩最后一个字了。它在发抖，像是害怕被收走。你认出来了——这是一个"光"字。',
      choices: [
        { label: '守护这个字', effect: '+3力量', fn() { G.strength += 3; } },
        { label: '用它写一首诗', effect: '获得稀有词牌', fn() { G.deck.push(randomCard('rare')); } },
        { label: '让它自由', effect: '+10最大生命，恢复15', fn() { G.maxHp += 10; G.hp = Math.min(G.maxHp, G.hp + 15); } },
      ]
    },
    {
      title: '文字壁画',
      text: '墙上有一幅巨大的壁画，全部由文字组成。有些字已经暗淡了，但你触碰的地方会重新发光。',
      choices: [
        { label: '点亮整面墙', effect: '将随机基础牌替换为非凡牌', fn() { transformRandomCard(); } },
        { label: '站着欣赏', effect: '恢复15生命', fn() { G.hp = Math.min(G.maxHp, G.hp + 15); } },
        { label: '拍下来', effect: '+40文银', fn() { G.gold += 40; } },
      ]
    },
  ],
};

export const EVENTS_FALLBACK = [
  {
    title: '文字雨',
    text: '天空下起了文字雨。每一滴都是一个汉字，落在地上会化成小水洼。好奇怪的天气。',
    choices: [
      { label: '用手接住几个字', effect: '移除一张基础词牌', fn() { removeRandomStarter(); } },
      { label: '撑把伞看着', effect: '+6最大生命', fn() { G.maxHp += 6; G.hp += 6; } },
    ]
  },
];

function upgradeRandomCard() {
  const u = G.deck.filter(c => !c.upgraded);
  if (u.length > 0) { const c = u[Math.floor(Math.random() * u.length)]; c.upgraded = true; }
}
function removeRandomStarter() {
  const idx = G.deck.findIndex(c => c.rarity === 'starter');
  if (idx >= 0) G.deck.splice(idx, 1);
}
function transformRandomCard() {
  const idx = G.deck.findIndex(c => c.rarity === 'starter' || c.rarity === 'common');
  if (idx >= 0) { G.deck.splice(idx, 1); G.deck.push(randomCard('uncommon')); }
}
