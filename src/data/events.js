import { G } from '../game/state.js';
import { randomCard } from './cards.js';

export const EVENTS_BY_ACT = {
  1: [
    {
      title: '多出来的点名册',
      titleEn: 'The Extra Attendance Sheet',
      text: '讲台上躺着一本点名册。全班四十二人，它却留了第四十三行；那一行正随着窗帘的摆动慢慢显出淡蓝色字迹。',
      textEn: 'A glowing page drifts up to you. The script on it flickers in time with your breath—a fragment torn from some scattered spellbook.',
      choices: [
        { label: '念出最后的名字', labelEn: 'Read the final name', effect: '获得随机非凡词牌', effectEn: 'Gain a random Uncommon card', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '撕下最后一页', labelEn: 'Tear out the last page', effect: '+25校章', effectEn: '+25 Gold', fn() { G.gold += 25; } },
        { label: '写上「缺席」', labelEn: 'Mark it absent', effect: '+8最大生命', effectEn: '+8 max HP', fn() { G.maxHp += 8; G.hp += 8; } },
      ]
    },
    {
      title: '没有接电的饮水机',
      titleEn: 'The Broken Water Dispenser',
      text: '饮水机没有接电，指示灯却亮着柔和的蓝色。纸杯里的水有雨后操场的味道，杯底浮着一句忘记写完的校规。',
      textEn: 'A tiny spring, its surface dotted with blurry words. The letters soaking in the water seem to glow faintly—warm and inviting.',
      choices: [
        { label: '喝一口', labelEn: 'Take a sip', effect: '随机升级一张词牌', effectEn: 'Upgrade a random card', fn() { upgradeRandomCard(); } },
        { label: '只洗掉手上的墨', labelEn: 'Wash the ink from your hands', effect: '+6最大生命', effectEn: '+6 max HP', fn() { G.maxHp += 6; G.hp += 6; } },
      ]
    },
    {
      title: '锁住的作文簿',
      titleEn: 'The Locked Composition Book',
      text: '储物柜里锁着一本作文簿。每篇作文都以「那天放学后，我绕了远路」开头，末页的字迹和你一模一样。',
      textEn: 'An old bookshelf in the corner holds a few dusty volumes. One cover glows faintly. Opening it sends a tingle through your fingertips.',
      choices: [
        { label: '读到最后', labelEn: 'Read to the end', effect: '获得稀有词牌，失去10生命', effectEn: 'Gain a Rare card, lose 10 HP', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 10); } },
        { label: '只抄下页码', labelEn: 'Copy only the page number', effect: '+15校章', effectEn: '+15 Gold', fn() { G.gold += 15; } },
        { label: '把锁重新扣好', labelEn: 'Lock it again', effect: '恢复全部生命', effectEn: 'Restore all HP', fn() { G.hp = G.maxHp; } },
      ]
    },
  ],
  2: [
    {
      title: '广播里的半句话',
      titleEn: 'Half a Sentence on the PA',
      text: '广播在走廊拐角突然中断，只剩一句话悬在空气里：「林夕同学其实已经……」',
      textEn: 'Around a bend in the corridor, a frozen sentence hangs in midair. Look closely and it is unfinished—"What I really wanted to say…"',
      choices: [
        { label: '替它补上结尾', labelEn: 'Finish it yourself', effect: '获得随机非凡词牌', effectEn: 'Gain a random Uncommon card', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '录进手机', labelEn: 'Record it', effect: '+30校章', effectEn: '+30 Gold', fn() { G.gold += 30; } },
        { label: '拔掉喇叭线', labelEn: 'Pull the speaker wire', effect: '恢复全部生命', effectEn: 'Restore all HP', fn() { G.hp = G.maxHp; } },
      ]
    },
    {
      title: '没有主人的校服',
      titleEn: 'The Ownerless Uniform',
      text: '一件晾得很整齐的旧校服总出现在下一个拐角。胸牌处轮流浮现不同的名字，像在安静地试台词。',
      textEn: 'A little sprite made of letters hops onto your shoulder. It loves your sentences and wants to come adventuring with you.',
      choices: [
        { label: '替它别好领口', labelEn: 'Straighten its collar', effect: '随机升级一张词牌', effectEn: 'Upgrade a random card', fn() { upgradeRandomCard(); } },
        { label: '写上一个假名', labelEn: 'Write a false name', effect: '+2力量', effectEn: '+2 Strength', fn() { G.strength += 2; } },
        { label: '把自己的胸牌给它', labelEn: 'Give it your name tag', effect: '+25校章，-8生命', effectEn: '+25 Gold, -8 HP', fn() { G.gold += 25; G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
    {
      title: '窗外的纸鹤',
      titleEn: 'The Crane Outside the Window',
      text: '纸鹤停在三楼窗外——可窗外看起来像地下室。展开后只有一句话：「蓝灯亮起时，跟着影子相反的方向走。」',
      textEn: 'Someone left a folded paper crane on the windowsill. Unfold it and a single line reads: "Your words have power." Signed with a little star.',
      choices: [
        { label: '写「我记住了」', labelEn: 'Write “I remember”', effect: '移除一张基础词牌', effectEn: 'Remove a starter card', fn() { removeRandomStarter(); } },
        { label: '记住它的折法', labelEn: 'Memorize its folds', effect: '获得稀有词牌，-8生命', effectEn: 'Gain a Rare card, -8 HP', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
  ],
  3: [
    {
      title: '自己的借阅档案',
      titleEn: 'Your Own Missing-Person File',
      text: '档案袋写着你的名字。借出时间是今天18:47，归还时间一栏却盖着三十年前的校章。',
      textEn: 'On the shelf at the tower\'s top sits one last word. It trembles, as if afraid of being taken. You recognize it—the word "light".',
      choices: [
        { label: '改写归还时间', labelEn: 'Rewrite the time', effect: '+3力量', effectEn: '+3 Strength', fn() { G.strength += 3; } },
        { label: '撕下自己的名字', labelEn: 'Tear out your name', effect: '获得稀有词牌', effectEn: 'Gain a Rare card', fn() { G.deck.push(randomCard('rare')); } },
        { label: '将档案归还原位', labelEn: 'Return the file', effect: '+10最大生命，恢复15', effectEn: '+10 max HP, heal 15', fn() { G.maxHp += 10; G.hp = Math.min(G.maxHp, G.hp + 15); } },
      ]
    },
    {
      title: '毕业照',
      titleEn: 'The Graduation Photo',
      text: '墙上的毕业照没有拍摄年份。所有人都像正好眨了眼，只有站在最角落的你看向窗外。',
      textEn: 'A vast mural covers the wall, made entirely of words. Some have dimmed, but wherever you touch, they glow anew.',
      choices: [
        { label: '在背面写下日期', labelEn: 'Write the date on the back', effect: '将随机基础牌替换为非凡牌', effectEn: 'Turn a random starter card into an Uncommon', fn() { transformRandomCard(); } },
        { label: '替所有人睁开眼', labelEn: 'Open everyone’s eyes', effect: '恢复15生命', effectEn: 'Heal 15 HP', fn() { G.hp = Math.min(G.maxHp, G.hp + 15); } },
        { label: '拍下来作为证据', labelEn: 'Take a photo as proof', effect: '+40校章', effectEn: '+40 Gold', fn() { G.gold += 40; } },
      ]
    },
  ],
};

export const EVENTS_FALLBACK = [
  {
    title: '逆行的晚自习',
    titleEn: 'Study Hall in Reverse',
    text: '教室里的学生从最后一行往前抄写，粉笔字像倒放的录像一样回到黑板。没有人说话，但窗边一直留着一个座位。',
    textEn: 'It begins to rain words. Each drop is a character that pools into a little puddle where it lands. What strange weather.',
    choices: [
      { label: '坐下抄一行', labelEn: 'Sit and copy one line', effect: '移除一张基础词牌', effectEn: 'Remove a starter card', fn() { removeRandomStarter(); } },
      { label: '从后门离开', labelEn: 'Leave through the back door', effect: '+6最大生命', effectEn: '+6 max HP', fn() { G.maxHp += 6; G.hp += 6; } },
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
