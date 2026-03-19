import { G } from '../game/state.js';
import { randomCard } from './cards.js';

export const EVENTS_BY_ACT = {
  1: [
    {
      title: '笔记本',
      text: '垃圾桶旁边有一本笔记本，封面被人用马克笔画了脏话。翻开来，里面的字迹很工整。最后一页夹着什么东西。',
      choices: [
        { label: '把它拿走', effect: '获得随机非凡词牌', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '只撕最后一页', effect: '+25文银', fn() { G.gold += 25; } },
        { label: '放回去', effect: '+8最大生命', fn() { G.maxHp += 8; G.hp += 8; } },
      ]
    },
    {
      title: '天台',
      text: '午休。天台的门没锁。风很大，能看到整个城市的轮廓。栏杆上有人用指甲刻了一行小字，已经看不清了。',
      choices: [
        { label: '试着辨认那行字', effect: '随机升级一张词牌', fn() { upgradeRandomCard(); } },
        { label: '在旁边刻一行自己的', effect: '+6最大生命', fn() { G.maxHp += 6; G.hp += 6; } },
      ]
    },
    {
      title: '旧书',
      text: '图书馆最里面的书架，积灰的那层。《漱玉词》，封面已经泛黄。翻开的时候，指尖有电流感。',
      choices: [
        { label: '读完它', effect: '获得稀有词牌，失去10生命', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 10); } },
        { label: '只读序言', effect: '+15文银', fn() { G.gold += 15; } },
        { label: '带走', effect: '恢复全部生命', fn() { G.hp = G.maxHp; } },
      ]
    },
  ],
  2: [
    {
      title: '凌晨三点',
      text: '睡不着。手机屏幕在黑暗里亮着。热搜第一条：某校学生跳楼，评论区仍在骂。你盯着那些字看了很久。',
      choices: [
        { label: '写一条评论', effect: '获得随机非凡词牌', fn() { G.deck.push(randomCard('uncommon')); } },
        { label: '截图，关机', effect: '+30文银', fn() { G.gold += 30; } },
        { label: '把手机翻过去', effect: '恢复全部生命', fn() { G.hp = G.maxHp; } },
      ]
    },
    {
      title: '已读不回',
      text: '给她发了道歉的消息。两个小时了，对话框安静地躺在那里。「对方正在输入」出现了一下，然后消失了。',
      choices: [
        { label: '再发一条', effect: '随机升级一张词牌', fn() { upgradeRandomCard(); } },
        { label: '把聊天记录写进日记', effect: '+2力量', fn() { G.strength += 2; } },
        { label: '删掉对话', effect: '+25文银，-8生命', fn() { G.gold += 25; G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
    {
      title: '纸条',
      text: '课桌抽屉里多了一张纸。没有署名。「你写的东西有人在看。」字迹陌生，墨水是蓝黑色的。',
      choices: [
        { label: '收起来', effect: '移除一张基础词牌', fn() { removeRandomStarter(); } },
        { label: '回一张纸条', effect: '获得稀有词牌，-8生命', fn() { G.deck.push(randomCard('rare')); G.hp = Math.max(1, G.hp - 8); } },
      ]
    },
  ],
  3: [
    {
      title: '电话',
      text: '妈妈打来的。「吃了没？」你说吃了。她说那就好。沉默了四秒。她说那挂了。你说嗯。',
      choices: [
        { label: '挂断之前说了句别的', effect: '+3力量', fn() { G.strength += 3; } },
        { label: '挂断之后写了封长信', effect: '获得稀有词牌', fn() { G.deck.push(randomCard('rare')); } },
        { label: '什么也没做', effect: '+10最大生命，恢复15', fn() { G.maxHp += 10; G.hp = Math.min(G.maxHp, G.hp + 15); } },
      ]
    },
    {
      title: '留言墙',
      text: '走廊尽头的墙。学长学姐留下的字，有的已经褪色了。有一句被人用修正液涂掉了，下面又有人重新写了一遍。',
      choices: [
        { label: '写一句', effect: '将随机基础牌替换为非凡牌', fn() { transformRandomCard(); } },
        { label: '站着看了很久', effect: '恢复15生命', fn() { G.hp = Math.min(G.maxHp, G.hp + 15); } },
        { label: '拍下来', effect: '+40文银', fn() { G.gold += 40; } },
      ]
    },
  ],
};

export const EVENTS_FALLBACK = [
  {
    title: '走神',
    text: '窗外有云。课本上的字在晃，像水面的倒影。也许是太累了，也许不是。',
    choices: [
      { label: '闭上眼', effect: '移除一张基础词牌', fn() { removeRandomStarter(); } },
      { label: '继续盯着看', effect: '+6最大生命', fn() { G.maxHp += 6; G.hp += 6; } },
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
