// Run: node scripts/test-wellformed.mjs
// 成句性判定器的带标准答案语料。每条: 词序列(word/pos) + 期望成句与否。
// 失败会打印, 用来暴露 special case / 规则漏洞。
// pos 简写: s=subject v=verb o=object m=modifier c=connector
//   x=exclamation .=period ,=comma !=exclMark ?=question sp=special
//   T=enemy target  S=self target
import { isWellFormed } from '../src/lang/zh/rules/wellformed.js';

const POS = { s:'subject', v:'verb', o:'object', m:'modifier', c:'connector',
  x:'exclamation', sp:'special' };
function card(tok) {
  const [word, tag] = tok.split('/');
  if (tag === '.') return { word:'。', pos:'punctuation', punctType:'period' };
  if (tag === ',') return { word:'，', pos:'punctuation', punctType:'comma' };
  if (tag === '?') return { word:'？', pos:'punctuation', punctType:'question' };
  if (tag === '!') return { word:'！', pos:'punctuation', punctType:'exclamation' };
  if (tag === 'T') return { word, pos:'object', _isEnemyTarget:true, _enemyIdx:0 };
  if (tag === 'S') return { word, pos:'subject', _isSelfTarget:true };
  // 系词 是/为 在卡数据里带 copulaConn:true
  if ((word === '是' || word === '为') && tag === 'c')
    return { word, pos:'connector', copulaConn:true };
  return { word, pos: POS[tag] || tag };
}
function parse(s) { return s.trim().split(/\s+/).map(card); }

// [句子, 词序列, 期望成句, 句型/理由]
const CASES = [
  // ===== 主谓句 / 主谓宾 (accept) =====
  ['我走',        '我/s 走/v',                  true,  '主谓'],
  ['我打你',      '我/s 打/v 敌/T',             true,  '主谓宾(目标)'],
  ['我吃苹果',    '我/s 吃/v 苹果/o',           true,  '主谓宾'],
  ['红日升',      '红/m 日/s 升/v',             true,  '定+主+谓'],
  ['我猛地斩你',  '我/s 猛地/m 斩/v 敌/T',      true,  '状语副词'],
  ['明月高悬',    '明月/o 高悬/v',              true,  '宾前置·倒装'],

  // ===== 无主祈使 / 连动 / 副词起首 (accept) =====
  ['走',          '走/v',                       true,  '单动词成句·祈使'],
  ['跑！',        '跑/v 跑/!',                   true,  '祈使裸谓语'],
  ['快跑',        '快/m 跑/v',                   true,  '修饰+动词祈使'],
  ['不去',        '不/c 去/v',                   true,  '副词不+动词'],
  ['就走',        '就/c 走/v',                   true,  '副词就+动词'],
  ['我去买药',    '我/s 去/v 买/v 药/o',         true,  '连动句'],
  ['我去买',      '我/s 去/v 买/v',              true,  '连动·省略宾语'],

  // ===== 判断句 (accept) =====
  ['我是猫',      '我/s 是/c 猫/o',             true,  '判断句(系词)'],
  ['我为王',      '我/s 为/c 王/o',             true,  '判断句(系词为)'],
  ['皇帝是我',    '皇帝/s 是/c 我/s',           true,  '判断句'],

  // ===== 兼语 / 致使 (accept) =====
  ['我让你走',    '我/s 让/c 敌/T 走/v',        true,  '兼语句'],
  ['让他跑',      '让/c 敌/T 跑/v',             true,  '无主致使祈使'],
  ['帮我打',      '帮/c 我/s 打/v',             true,  '兼语·帮'],

  // ===== 并列主语 + 谓语 (accept) =====
  ['我和你走',    '我/s 和/c 你/s 走/v',        true,  '并列主语+谓语'],
  ['我和你跑',    '我/s 和/c 敌/T 跑/v',        true,  '并列主语+谓语'],

  // ===== 非主谓感叹句 (accept) =====
  ['啊！',        '啊/x',                        true,  '叹词独立成句'],
  ['哎呀！',      '哎呀/x',                      true,  '叹词句'],
  ['啊啊啊',      '啊/x 啊/x 啊/x',             true,  '多重叹词'],
  ['你啊！',      '你/s 啊/x',                   true,  '呼告 NP+叹词'],
  ['明月啊',      '明月/s 啊/x',                 true,  '宣言句 NP+叹词'],
  ['明月啊啊',    '明月/s 啊/x 啊/x',           true,  '多感叹宣言句'],

  // ===== 复句 (accept) =====
  ['我打，你逃',  '我/s 打/v 敌/T ，/, 你/s 逃/v', true, '并列复句'],
  ['我打，你逃2', '我/s 打/v ，/, 你/s 逃/v',    true,  '承前省略宾语'],

  // ===== 纯堆砌 (reject) =====
  ['苹果桌子',    '苹果/o 桌子/o',              false, '纯名词堆砌'],
  ['石头石头',    '石头/s 石头/s',              false, '纯主语堆砌'],
  ['我你他',      '我/s 你/s 他/s',             false, '纯主语'],
  ['红红的大大的','红红的/m 大大的/m',          false, '纯修饰'],
  ['很非常',      '很/m 非常/m',                false, '纯修饰堆砌'],

  // ===== 纯连词 / 悬空连词 (reject) =====
  ['和但是',      '和/c 而/c',                   false, '纯并列连词'],
  ['和我',        '和/c 我/s',                   false, '并列连词起首无谓语'],
  ['我跑和',      '我/s 跑/v 和/c',             false, '并列连词句尾悬空'],
  ['我是',        '我/s 是/c',                   false, '系词悬空·缺宾语'],
  ['然后你',      '然后/c 你/s',                 false, '顺承词起首无谓语'],
  // 设计取舍: 「然后+谓语」放行。它是合法的顺承续句(然后你逃), 只是缺前文;
  // 本游戏吟诵独立短句, 强行要求前置分句会误杀, 故只要有谓语核心即放行。
  ['然后你逃',    '然后/c 你/s 逃/v',           true,  '顺承续句·有谓语核心(游戏内放行)'],
  ['他就',        '他/s 就/c',                   false, '副词句尾悬空'],
  ['不我',        '不/c 我/s',                   false, '副词起首无谓语'],

  // ===== 兼语残缺 / 连动残缺 (reject) =====
  ['我让你',      '我/s 让/c 敌/T',             false, '兼语缺后续动作'],
  ['我去让你',    '我/s 去/v 让/c 敌/T',        false, '尾部兼语残缺(句尾连词悬空)'],

  // ===== 复句中某分句不成句 (reject) =====
  ['我打，',      '我/s 打/v ，/,',             false, '尾分句为空'],
  ['，你逃',      '，/, 你/s 逃/v',             false, '首分句为空'],
  ['我跑，和但是','我/s 跑/v ，/, 和/c 而/c',    false, '第二分句纯连词'],
  ['明月，啊',    '明月/s ，/, 啊/x',           false, '首分句无谓语无感叹'],
  ['敌，斩',      '敌/T ，/, 斩/v',             false, '首分句无谓语'],

  // ===== 感叹句边界 (reject) =====
  ['红红的啊',    '红红的/m 啊/x',              false, '感叹句缺主体(光修饰)'],

  // ===== codex 对实现的对抗集 (标签按本游戏语义判定) =====
  ['和你打',      '和/c 你/s 打/v',             true,  '并列起首+谓语核心(续句,放行)'],
  ['我就和打',    '我/s 就/c 和/c 打/v',        true,  '副词+并列+动词(有谓语核心)'],
  ['我让跑你',    '我/s 让/c 打/v 敌/T',        false, '兼语语序错(动作在人前)'],
  ['让跑他',      '让/c 跑/v 敌/T',             false, '兼语语序错'],
  ['我是很',      '我/s 是/c 很/m',             false, '判断句缺表语(是+光修饰)'],
  ['我是和猫',    '我/s 是/c 和/c 猫/o',        true,  '是后有NP表语(和为并列修饰)'],
  ['我打,,你逃',  '我/s 打/v ，/, ，/, 你/s 逃/v', false, '双逗号切出空分句'],

  // ===== 系词表语: 谐音/特殊词作表语 (accept) — 复现截图 bug =====
  ['残句怪是给',  '残句怪/T 是/c 给/c',         true,  '判断句·给(gay)作表语(谐音connector)'],
  ['残句怪是给,你守我','残句怪/T 是/c 给/c ，/, 你/s 守/v 我/s', true, '复句:判断句+主谓宾(截图原句)'],
  ['我是日',      '我/s 是/c 日/c',             true,  '判断句·日(昼明)作表语'],

  // ===== 动词链骨架: 拒绝动词+裸名词乱堆 (复现截图 bug) =====
  ['守戳挡我猫',  '守/v 戳/v 挡/v 我/s 猫/s',   false, 'V V V N N 乱堆,动词后名词堆砌'],
  ['残句怪是给,守戳挡我猫','残句怪/T 是/c 给/c ，/, 守/v 戳/v 挡/v 我/s 猫/s', false, '第二分句乱堆(截图原句)'],
  ['我吃饭我跑',  '我/s 吃/v 饭/o 我/s 跑/v',   false, '动宾后又冒主谓,交错'],
  ['猫我斩',      '猫/s 我/s 斩/v',             false, '动词前两主语'],
  // 仍须放行的合法连动/省略:
  ['我去买药',    '我/s 去/v 买/v 药/o',         true,  '连动句 主+V+V+O'],
  ['我去买',      '我/s 去/v 买/v',              true,  '连动·省略宾语'],
  ['我吃饭',      '我/s 吃/v 饭/o',             true,  '主谓宾'],

  // ===== 纯动词堆 (reject) — fuzzer 暴露 =====
  ['溜怼卷',      '溜/v 怼/v 卷/v',             false, '三动词堆,无人无事'],
  ['必杀踹睡修',  '必杀/v 踹/v 睡/v 修/v',      false, '四动词堆'],
  // 仍放行的合法短式:
  ['碎砍',        '碎/v 砍/v',                   true,  '双动词连动祈使'],
  ['斩月',        '斩/v 月/o',                   true,  '动+宾(无主祈使)'],
  ['我去买药2',   '我/s 去/v 买/v 药/o',         true,  '连动有主有宾'],

  // ===== 感叹句收紧: 拒绝「一堆名词+叹词」乱堆 (fuzzer 暴露) =====
  ['牛逼远方心态吧','牛逼/x 远方/o 心态/o 吧/x',  false, '多名词混叹词乱堆'],
  ['狂人铁屋万物啊','狂人/s 铁屋/o 万物/o 啊/x',  false, '三名词+叹词,非呼告'],
  ['家乡月兔了',  '家乡/o 月兔/s 了/x',          false, '两名词+叹词'],
  // 仍放行的合法呼告/宣言:
  ['明月啊2',     '明月/o 啊/x',                 true,  '单名词+叹词呼告'],
  ['红红的太阳啊','红红的/m 太阳/s 啊/x',        true,  '修饰+单主体+叹词'],
  ['我和你啊',    '我/s 和/c 你/s 啊/x',         true,  '并列主体+叹词'],
];

let pass = 0, fail = 0;
const fails = [];
for (const [text, sh, expect, note] of CASES) {
  const r = isWellFormed(parse(sh));
  if (r.ok === expect) pass++;
  else fails.push({ text, expect, got: r, note });
}

console.log(`\n成句性测试: ${pass}/${CASES.length} 通过, ${fails.length} 失败\n`);
if (fails.length) {
  console.log('=== 失败案例 ===');
  for (const f of fails) {
    const exp = f.expect ? '应成句' : '应拒绝';
    const got = f.got.ok ? '判为成句' : `判为拒绝(${f.got.reason})`;
    console.log(`✗ 「${f.text}」(${f.note})  期望:${exp}  实际:${got}`);
  }
  process.exit(1);
} else {
  console.log('全部通过 ✓');
}
