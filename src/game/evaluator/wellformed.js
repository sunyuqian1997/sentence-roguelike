// 成句性硬门槛 (well-formedness gate) — 真·汉语句法版。
//
// 这是唯一一处会「拒绝」一串卡牌（判定为不成句）的地方。下游一切
// （grammar.js / quality.js …）都是「软」评分——只降低倍率、永远放行。分工：
//   - 成句性 (是不是一个句子)        → 这里硬拒绝。
//   - 文学性/语序 (是不是一个好句子)  → 下游倍率层。
//
// 理论依据(现代汉语句法 + codex 独立设计, 两者一致):
//   句子 = 主谓句 ∪ 非主谓句。
//   一个合法分句必须满足以下之一(codex「最终落地原则」):
//     1. VP 核心    : 含一个可独立陈述/命令的谓语 (主谓 / 主谓宾 / 无主祈使 / 连动 / 省略)
//     2. 判断句      : NP + 系词(是/为) + NP
//     3. 兼语/致使句 : (NP)? + 兼语词(让/帮) + NP + VP
//     4. 非主谓感叹  : 叹词 单独成句, 或 NP + 叹词 (呼告/宣言)
//   否则一律拒绝(纯名词堆砌 / 纯修饰 / 纯连词 / 悬空连词 / 兼语残缺 …)。
//
// 连词在本游戏是个大杂烩, 必须按功能细分(codex 的 lexRole 思路):
//   COORD     并列  : 和 或 而        —— 连接同类成分, 本身不成核
//   CAUSATIVE 兼语  : 让 帮            —— 触发「兼语词+NP+VP」, 需后续动词
//   COPULA    系词  : 是 为            —— 充当判断句谓语(copulaConn 标记)
//   ADV       副词性: 就 还 不 也是 倒是 —— 只修饰最近的 VP, 不能独立成核
//   SEQUENCE  顺承  : 然后            —— 句间连接, 不能单独悬空起句
//
// Input: 原始卡牌数组(combat.js 里 G.sentence 的形状, 已做多义解析)。
// 每张卡有 .pos 与可能的运行时目标标记 _isEnemyTarget/_isSelfTarget/_isFixedWo。
// Returns { ok: true } 或 { ok: false, reason: '<玩家可读中文原因>' }。

import { applyMeaningsToSentence } from '../meanings.js';

const CAUSATIVE_SET = new Set(['让', '帮', '叫', '使', '令', '请', '派']);
const COORD_SET = new Set(['和', '或', '而', '与', '并', '且']);
const SEQUENCE_SET = new Set(['然后', '于是', '接着', '之后']);
const ADV_SET = new Set(['就', '还', '不', '也是', '倒是', '都', '也', '再', '只', '才', '便']);

// 把一张卡映射到它的句法功能角色。
function roleOf(c) {
  if (c._isEnemyTarget || c._isSelfTarget || c._isFixedWo) return 'NP';
  switch (c.pos) {
    case 'subject':
    case 'object':   return 'NP';
    case 'verb':
    case 'special':  return 'V';
    case 'modifier': return 'MOD';
    case 'exclamation': return 'EXCL';
    case 'connector':
      if (c.copulaConn) return 'COPULA';
      if (CAUSATIVE_SET.has(c.word)) return 'CAUSATIVE';
      if (SEQUENCE_SET.has(c.word)) return 'SEQUENCE';
      if (COORD_SET.has(c.word)) return 'COORD';
      if (ADV_SET.has(c.word)) return 'ADV';
      return 'COORD'; // 未知连词按并列处理(最弱, 不成核)
    default: return 'OTHER';
  }
}

// 按逗号把句子切成分句。
function splitClauses(body) {
  const clauses = [[]];
  for (const c of body) {
    if (c.pos === 'punctuation' && c.punctType === 'comma') clauses.push([]);
    else clauses[clauses.length - 1].push(c);
  }
  return clauses;
}

// 单个分句是否成句。返回 { ok, reason? }。
function clauseOk(clause) {
  const words = clause.filter(c => c.pos !== 'punctuation');
  if (words.length === 0) return { ok: false, reason: '空分句' };

  const roles = words.map(roleOf);

  // 系词表语提升: 判断句 A 是 B 里, 紧跟系词的成分就是「表语」。谐音类词卡
  // (给≈gay、日≈昼明)名义上被标成 connector, 但在系词后就是表语, 提升为 NP 核心,
  // 否则会被「结尾连词悬空」误杀("残句怪是给" / "我是日")。
  // 但纯修饰(很/非常)不算表语, 不提升 —— "我是很" 仍判不成句。
  for (let i = 0; i < roles.length - 1; i++) {
    const next = roles[i + 1];
    if (roles[i] === 'COPULA' && next !== 'EXCL' && next !== 'MOD') roles[i + 1] = 'NP';
  }

  const has = r => roles.includes(r);
  const count = r => roles.filter(x => x === r).length;

  const firstNonExcl = roles.find(r => r !== 'EXCL');
  const lastRole = roles[roles.length - 1];
  const lastNonExcl = [...roles].reverse().find(r => r !== 'EXCL');

  const hasV = has('V');
  const hasCopula = has('COPULA');
  const hasCausative = has('CAUSATIVE');
  const hasExcl = has('EXCL');
  const hasNP = has('NP');

  // 实词核心 = 能成谓语/判断/兼语的成分。纯 NP/MOD/COORD/ADV/SEQUENCE 都不算核心。
  const hasPredicateCore = hasV || hasCopula;

  // ---- 1. 连接词悬空检查(任何句型都先过这关) ----
  // 句尾是连词性成分(并列/系词/兼语/副词/顺承)→ 悬空, 不成句。
  // ("我跑和" / "我是" / "我让" / "他就" / "我跑然后")
  if (['COORD', 'COPULA', 'CAUSATIVE', 'ADV', 'SEQUENCE'].includes(lastNonExcl))
    return { ok: false, reason: '结尾连词悬空，没说完' };

  // 句首是并列/顺承连词且整句无谓语核心 → 悬空起句。("和但是" / "然后你")
  // 兼语/副词/系词起首允许(无主祈使「让他跑」「不去」), 但仍需后续核心(下面校验)。
  if ((firstNonExcl === 'COORD' || firstNonExcl === 'SEQUENCE') && !hasPredicateCore)
    return { ok: false, reason: '开头连词悬空，没有谓语' };

  // ---- 2. 判断句: NP + 系词 + NP核心 ----
  if (hasCopula) {
    const ci = roles.indexOf('COPULA');
    const after = roles.slice(ci + 1).filter(r => r !== 'EXCL');
    if (after.length === 0)
      return { ok: false, reason: '判断句缺宾语（“…是”后面没词）' };
    // 系词后必须出现一个 NP 作表语(我是猫); 仅修饰词(我是很)不成判断句。
    if (!after.includes('NP'))
      return { ok: false, reason: '判断句缺表语（“是”后面要有名词）' };
    return { ok: true };
  }

  // ---- 3. 兼语/致使句: (NP)? + 兼语词 + NP + VP (顺序: NP 必须在 VP 之前) ----
  if (hasCausative) {
    const ki = roles.indexOf('CAUSATIVE');
    const after = roles.slice(ki + 1);
    const npPos = after.indexOf('NP');
    const vPos = after.indexOf('V');
    if (npPos < 0 || vPos < 0)
      return { ok: false, reason: '兼语句不完整（“让…”后面要有人+动作）' };
    if (npPos > vPos)
      return { ok: false, reason: '兼语句语序错（应是“让+人+动作”）' };
    return { ok: true }; // 让他跑 / 我让你走
  }

  // ---- 4. VP 核心句(主谓/主谓宾/祈使/连动/省略) ----
  if (hasV) return { ok: true };

  // ---- 5. 非主谓感叹句 ----
  if (hasExcl) {
    // 纯叹词「啊！」, 或 NP+叹词「明月啊！」/「你啊！」。
    // 但「红红的啊」(纯MOD+EXCL) 不是合法呼告 → 需要 NP 或纯叹词。
    if (!has('NP') && !has('MOD') && !has('COORD') && !has('ADV')) return { ok: true }; // 纯叹词
    if (hasNP) return { ok: true }; // NP + 叹词
    return { ok: false, reason: '感叹句缺主体（光有修饰词）' };
  }

  // ---- 6. 其余: 无谓语核心、无感叹 → 纯堆砌, 拒绝 ----
  if (count('NP') >= 1 && !hasPredicateCore)
    return { ok: false, reason: '只有名词，没有谓语' };
  if (has('MOD') && !hasPredicateCore)
    return { ok: false, reason: '只有修饰词，没有谓语' };
  return { ok: false, reason: '不成句' };
}

export function isWellFormed(rawCards) {
  // 先做多义解析, 让判定看到每张卡的「实际」词性(给 verb↔connector 等)。
  const resolved = applyMeaningsToSentence(rawCards || []);

  const meaningful = resolved.filter(c => c.pos !== 'punctuation');
  if (meaningful.length === 0) return { ok: false, reason: '空句' };

  // 末尾句号/问号/感叹号不参与分句切分; 逗号才切。
  const body = resolved.filter(c => !(c.pos === 'punctuation' && c.punctType !== 'comma'));
  const clauses = splitClauses(body);

  for (const clause of clauses) {
    const r = clauseOk(clause);
    if (!r.ok) return r;
  }
  return { ok: true };
}
