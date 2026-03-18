import { G } from '../game/state.js';
import { randomCard } from './cards.js';

export const EVENTS_BY_ACT = {
  1: [
    {
      title: '溪亭日暮',
      text: '「常记溪亭日暮，沉醉不知归路。」你在溪边拾到一枚残玉，隐隐有灵光...',
      choices: [
        { label: '把玩残玉', effect: '+8最大生命', fn:()=>{G.maxHp+=8;G.hp+=8;} },
        { label: '将灵气吸入笔端', effect: '获得随机非凡词牌', fn:()=>{G.deck.push(randomCard('uncommon'));} },
        { label: '置于溪水中', effect: '+25文银', fn:()=>{G.gold+=25;} },
      ]
    },
    {
      title: '昨夜雨疏风骤',
      text: '「昨夜雨疏风骤，浓睡不消残酒。试问卷帘人，却道海棠依旧。」一阵风雨后，庭中花瓣散落...',
      choices: [
        { label: '拾花入墨', effect: '随机升级一张词牌', fn:()=>{upgradeRandomCard();} },
        { label: '踏花归去', effect: '+6最大生命', fn:()=>{G.maxHp+=6;G.hp+=6;} },
      ]
    },
    {
      title: '赌书泼茶',
      text: '「赌书消得泼茶香。」书房中，一卷古籍翻到某页，字迹竟活了过来...',
      choices: [
        { label: '与字中人对赌', effect: '获得稀有词牌，失去10生命', fn:()=>{G.deck.push(randomCard('rare'));G.hp=Math.max(1,G.hp-10);} },
        { label: '合上书卷', effect: '+15文银', fn:()=>{G.gold+=15;} },
        { label: '沏茶静读', effect: '恢复全部生命', fn:()=>{G.hp=G.maxHp;} },
      ]
    },
  ],
  2: [
    {
      title: '南渡孤舟',
      text: '「风住尘香花已尽，日晚倦梳头。物是人非事事休，欲语泪先流。」渡船上，一位老翁递来包裹...',
      choices: [
        { label: '打开包裹', effect: '获得随机非凡词牌', fn:()=>{G.deck.push(randomCard('uncommon'));} },
        { label: '接过干粮', effect: '恢复全部生命', fn:()=>{G.hp=G.maxHp;} },
        { label: '婉拒好意', effect: '+30文银', fn:()=>{G.gold+=30;} },
      ]
    },
    {
      title: '寻寻觅觅',
      text: '「寻寻觅觅，冷冷清清，凄凄惨惨戚戚。」废墟中，你发现一方古砚...',
      choices: [
        { label: '以血研墨', effect: '+2力量，失去8生命', fn:()=>{G.hp=Math.max(1,G.hp-8);G.strength+=2;} },
        { label: '收入囊中', effect: '随机升级一张词牌', fn:()=>{upgradeRandomCard();} },
        { label: '弃之不顾', effect: '+25文银', fn:()=>{G.gold+=25;} },
      ]
    },
    {
      title: '金石录残篇',
      text: '「乍暖还寒时候，最难将息。」流离途中，你在废宅中发现散落的金石录残页...',
      choices: [
        { label: '仔细收集残页', effect: '移除一张基础词牌', fn:()=>{removeRandomStarter();} },
        { label: '将残页入梦', effect: '获得稀有词牌，失去8生命', fn:()=>{G.deck.push(randomCard('rare'));G.hp=Math.max(1,G.hp-8);} },
      ]
    },
  ],
  3: [
    {
      title: '人杰鬼雄',
      text: '「生当作人杰，死亦为鬼雄。至今思项羽，不肯过江东。」一股浩然正气充盈四周...',
      choices: [
        { label: '吸收正气', effect: '+3力量', fn:()=>{G.strength+=3;} },
        { label: '以正气铸词', effect: '获得稀有词牌', fn:()=>{G.deck.push(randomCard('rare'));} },
        { label: '任其消散', effect: '+10最大生命，恢复15', fn:()=>{G.maxHp+=10;G.hp=Math.min(G.maxHp,G.hp+15);} },
      ]
    },
    {
      title: '镜中年华',
      text: '「莫道不销魂，帘卷西风，人比黄花瘦。」铜镜中映出年少时的自己...',
      choices: [
        { label: '与镜中人对话', effect: '将随机基础牌替换为非凡牌', fn:()=>{transformRandomCard();} },
        { label: '静坐回忆', effect: '恢复15生命', fn:()=>{G.hp=Math.min(G.maxHp,G.hp+15);} },
        { label: '击碎铜镜', effect: '+40文银', fn:()=>{G.gold+=40;} },
      ]
    },
  ],
};

export const EVENTS_FALLBACK = [
  {
    title: '断句之谜',
    text: '石壁上刻着一段没有标点的文字。你凝神细看，发现每一种断句方式都通向不同的命运...',
    choices: [
      { label: '按古法断句', effect: '移除一张基础词牌', fn:()=>{removeRandomStarter();} },
      { label: '不敢妄断', effect: '+6最大生命', fn:()=>{G.maxHp+=6;G.hp+=6;} },
    ]
  },
];

export function upgradeRandomCard() {
  const u = G.deck.filter(c => !c.upgraded);
  if (u.length > 0) { const c = u[Math.floor(Math.random()*u.length)]; c.upgraded = true; }
}
export function removeRandomStarter() {
  const idx = G.deck.findIndex(c => c.rarity === 'starter');
  if (idx >= 0) G.deck.splice(idx, 1);
}
export function transformRandomCard() {
  const idx = G.deck.findIndex(c => c.rarity==='starter'||c.rarity==='common');
  if (idx >= 0) { G.deck.splice(idx, 1); G.deck.push(randomCard('uncommon')); }
}
