import { G } from '../game/state.js';
import { randomCard } from './cards.js';

export const EVENTS_BY_ACT = {
  1: [
    {
      title: '漂浮的书页',
      titleEn: 'A Floating Page',
      text: '一张发光的书页飘到你面前。上面的字迹会随着你的呼吸闪烁。这是某本被拆散的魔法书的碎片。',
      textEn: 'A glowing page drifts up to you. The script on it flickers in time with your breath—a fragment torn from some scattered spellbook.',
      choices: [
        { label: '念出上面的咒语', labelEn: 'Read the spell aloud', effect: '获得随机非凡词牌', effectEn: 'Gain a random Uncommon card', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '小心收起来', labelEn: 'Tuck it away carefully', effect: '+25文银', effectEn: '+25 Gold', fn() { G.gold += 25; } },
        { label: '让它飘走吧', labelEn: 'Let it drift away', effect: '+8最大生命', effectEn: '+8 max HP', fn() { G.maxHp += 8; G.hp += 8; } },
      ]
    },
    {
      title: '词语泉',
      titleEn: 'The Word Spring',
      text: '一汪小小的泉水，水面上漂浮着模糊的文字。泡在水里的字似乎在微微发光，温暖又舒服的样子。',
      textEn: 'A tiny spring, its surface dotted with blurry words. The letters soaking in the water seem to glow faintly—warm and inviting.',
      choices: [
        { label: '喝一口泉水', labelEn: 'Take a sip', effect: '随机升级一张词牌', effectEn: 'Upgrade a random card', fn() { upgradeRandomCard(); } },
        { label: '把脚泡进去', labelEn: 'Soak your feet', effect: '+6最大生命', effectEn: '+6 max HP', fn() { G.maxHp += 6; G.hp += 6; } },
      ]
    },
    {
      title: '旧书架',
      titleEn: 'The Old Bookshelf',
      text: '角落里有一个旧书架，上面摆着几本布满灰尘的书。其中一本封面在微微发光——《漱玉词》。翻开时指尖有电流感。',
      textEn: 'An old bookshelf in the corner holds a few dusty volumes. One cover glows faintly. Opening it sends a tingle through your fingertips.',
      choices: [
        { label: '读完它', labelEn: 'Read it cover to cover', effect: '获得稀有词牌，失去10生命', effectEn: 'Gain a Rare card, lose 10 HP', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 10); } },
        { label: '只看目录', labelEn: 'Skim the contents', effect: '+15文银', effectEn: '+15 Gold', fn() { G.gold += 15; } },
        { label: '带走', labelEn: 'Take it with you', effect: '恢复全部生命', effectEn: 'Restore all HP', fn() { G.hp = G.maxHp; } },
      ]
    },
  ],
  2: [
    {
      title: '回声碎片',
      titleEn: 'Echo Fragment',
      text: '走廊拐角处，有一个被冻住的句子悬浮在半空中。仔细看，是一句没说完的话——"其实我想说……"',
      textEn: 'Around a bend in the corridor, a frozen sentence hangs in midair. Look closely and it is unfinished—"What I really wanted to say…"',
      choices: [
        { label: '帮它续写完', labelEn: 'Finish the sentence for it', effect: '获得随机非凡词牌', effectEn: 'Gain a random Uncommon card', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '把它收集起来', labelEn: 'Collect it', effect: '+30文银', effectEn: '+30 Gold', fn() { G.gold += 30; } },
        { label: '轻轻吹散', labelEn: 'Blow it gently away', effect: '恢复全部生命', effectEn: 'Restore all HP', fn() { G.hp = G.maxHp; } },
      ]
    },
    {
      title: '文字精灵',
      titleEn: 'Word Sprite',
      text: '一个由字符组成的小精灵跳到你肩膀上。它很喜欢你的句子，想跟着你冒险。',
      textEn: 'A little sprite made of letters hops onto your shoulder. It loves your sentences and wants to come adventuring with you.',
      choices: [
        { label: '收它做伙伴', labelEn: 'Take it as a companion', effect: '随机升级一张词牌', effectEn: 'Upgrade a random card', fn() { upgradeRandomCard(); } },
        { label: '教它一个新词', labelEn: 'Teach it a new word', effect: '+2力量', effectEn: '+2 Strength', fn() { G.strength += 2; } },
        { label: '给它一颗糖', labelEn: 'Give it a candy', effect: '+25文银，-8生命', effectEn: '+25 Gold, -8 HP', fn() { G.gold += 25; G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
    {
      title: '纸鹤',
      titleEn: 'Paper Crane',
      text: '有人叠了一只纸鹤放在窗台上。展开来看，里面写着一行字："你的文字有力量。"落款是一颗小星星。',
      textEn: 'Someone left a folded paper crane on the windowsill. Unfold it and a single line reads: "Your words have power." Signed with a little star.',
      choices: [
        { label: '折一只回去', labelEn: 'Fold one in return', effect: '移除一张基础词牌', effectEn: 'Remove a starter card', fn() { removeRandomStarter(); } },
        { label: '把星星画下来', labelEn: 'Draw the star', effect: '获得稀有词牌，-8生命', effectEn: 'Gain a Rare card, -8 HP', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
  ],
  3: [
    {
      title: '最后一个字',
      titleEn: 'The Last Word',
      text: '塔顶的架子上只剩最后一个字了。它在发抖，像是害怕被收走。你认出来了——这是一个"光"字。',
      textEn: 'On the shelf at the tower\'s top sits one last word. It trembles, as if afraid of being taken. You recognize it—the word "light".',
      choices: [
        { label: '守护这个字', labelEn: 'Guard the word', effect: '+3力量', effectEn: '+3 Strength', fn() { G.strength += 3; } },
        { label: '用它写一首诗', labelEn: 'Write a poem with it', effect: '获得稀有词牌', effectEn: 'Gain a Rare card', fn() { G.deck.push(randomCard('rare')); } },
        { label: '让它自由', labelEn: 'Set it free', effect: '+10最大生命，恢复15', effectEn: '+10 max HP, heal 15', fn() { G.maxHp += 10; G.hp = Math.min(G.maxHp, G.hp + 15); } },
      ]
    },
    {
      title: '文字壁画',
      titleEn: 'Word Mural',
      text: '墙上有一幅巨大的壁画，全部由文字组成。有些字已经暗淡了，但你触碰的地方会重新发光。',
      textEn: 'A vast mural covers the wall, made entirely of words. Some have dimmed, but wherever you touch, they glow anew.',
      choices: [
        { label: '点亮整面墙', labelEn: 'Light up the whole wall', effect: '将随机基础牌替换为非凡牌', effectEn: 'Turn a random starter card into an Uncommon', fn() { transformRandomCard(); } },
        { label: '站着欣赏', labelEn: 'Stand and admire it', effect: '恢复15生命', effectEn: 'Heal 15 HP', fn() { G.hp = Math.min(G.maxHp, G.hp + 15); } },
        { label: '拍下来', labelEn: 'Snap a picture', effect: '+40文银', effectEn: '+40 Gold', fn() { G.gold += 40; } },
      ]
    },
  ],
};

export const EVENTS_FALLBACK = [
  {
    title: '文字雨',
    titleEn: 'Rain of Words',
    text: '天空下起了文字雨。每一滴都是一个汉字，落在地上会化成小水洼。好奇怪的天气。',
    textEn: 'It begins to rain words. Each drop is a character that pools into a little puddle where it lands. What strange weather.',
    choices: [
      { label: '用手接住几个字', labelEn: 'Catch a few in your hands', effect: '移除一张基础词牌', effectEn: 'Remove a starter card', fn() { removeRandomStarter(); } },
      { label: '撑把伞看着', labelEn: 'Watch under an umbrella', effect: '+6最大生命', effectEn: '+6 max HP', fn() { G.maxHp += 6; G.hp += 6; } },
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
