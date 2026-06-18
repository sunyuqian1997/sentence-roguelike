// English well-formedness gate — 镜像 zh/rules/wellformed.js,但用英语 SVO 句法。
//
// 这是唯一一处会「拒绝」一串卡牌（判定为不成句）的地方。下游一切(grammar/quality…)
// 都是「软」评分,只降低倍率、永远放行。分工:
//   - 成句性 (is this a sentence?)        → 这里硬拒绝。
//   - 文学性/语序 (is it a GOOD sentence?) → 下游倍率层。
//
// English is SVO, stricter than Chinese. 一个合法分句必须满足以下之一:
//   1. VP 核心   : (subject 0~1) + verb-chain(>=1) + (object <=1)  —— "I slay" / "I slay dragon" / "Slay!" / "I fiercely slay" / "I go buy"
//   2. 判断句/copula: NP + be + (NP | ADJ)  —— "I am cat" / "I am red"
//   3. 非主谓感叹 : 叹词单独成句 "Alas!", 或 NP(+MOD) + 叹词 "Moon, oh!"
//   否则拒绝(纯名词堆砌 / 纯修饰 / 纯连词 / 悬空连词 / leading coordinator / 动词堆 / bare copula …)。
//
// Input: 原始卡牌数组(combat.js 里 G.sentence 的形状)。
// 每张卡有 .pos 与可能的运行时目标标记 _isEnemyTarget/_isSelfTarget/_isFixedWo。
// Returns { ok: true } 或 { ok: false, reason: '<player-readable reason>' }。

import { isSelfRefEn, isEnemyRefEn } from './context.js';

// 系词 be 家族。pos 可能是 'connector' 或 'verb',按 .word 小写判定。
const COPULA_SET = new Set(['is', 'am', 'are', 'be', 'was', 'were', 'been', 'being']);
// 并列连词。本身不成核,连接同类成分。
const COORD_SET = new Set(['and', 'or', 'but', 'nor', 'yet', 'so']);

function isCopulaWord(c) {
  return COPULA_SET.has((c.word || '').toLowerCase());
}

// 把一张卡映射到它的句法功能角色。
function roleOf(c) {
  // be 家族优先识别为系词,无论 pos 标成 connector 还是 verb。
  if (isCopulaWord(c)) return 'COPULA';
  if (c._isEnemyTarget || c._isSelfTarget || c._isFixedWo) return 'NP';
  switch (c.pos) {
    case 'subject':
    case 'object':   return 'NP';
    case 'verb':
    case 'special':  return 'V';
    case 'modifier': return 'MOD';
    case 'exclamation': return 'EXCL';
    case 'connector':
      if (COORD_SET.has((c.word || '').toLowerCase())) return 'COORD';
      return 'COORD'; // 未知连词按并列处理(最弱,不成核)
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
  if (words.length === 0) return { ok: false, reason: 'empty clause' };

  const roles = words.map(roleOf);

  const has = r => roles.includes(r);
  const count = r => roles.filter(x => x === r).length;

  const firstNonExcl = roles.find(r => r !== 'EXCL');
  const lastNonExcl = [...roles].reverse().find(r => r !== 'EXCL');

  const hasV = has('V');
  const hasCopula = has('COPULA');
  const hasExcl = has('EXCL');

  // 谓语核心 = 能成谓语/判断的成分。纯 NP/MOD/COORD 都不算核心。
  const hasPredicateCore = hasV || hasCopula;

  // ---- 1. 连接词悬空检查(任何句型先过这关) ----
  // 句尾是连词性/系词成分 → 悬空,没说完。("I slay and" / "I am")
  if (lastNonExcl === 'COORD' || lastNonExcl === 'COPULA')
    return { ok: false, reason: 'dangling connector at end' };

  // 句首是并列连词且整句无谓语核心 → leading coordinator。("and I" / "and but")
  if (firstNonExcl === 'COORD' && !hasPredicateCore)
    return { ok: false, reason: 'leading coordinator with no predicate' };

  // ---- 2. 判断句 / copula: NP? + be + (NP | ADJ) ----
  if (hasCopula) {
    const ci = roles.indexOf('COPULA');
    const after = roles.slice(ci + 1).filter(r => r !== 'EXCL');
    if (after.length === 0)
      return { ok: false, reason: 'copula with nothing after ("…is" needs a complement)' };
    // be 后必须有 NP(名词表语)或 MOD(形容词表语)。光连词(我 am and)不算。
    if (!after.includes('NP') && !after.includes('MOD'))
      return { ok: false, reason: 'copula needs a noun or adjective complement' };
    return { ok: true };
  }

  // ---- 3. VP 核心句(主谓/主谓宾/祈使/连动/省略) ----
  // 「verb-chain 骨架」: 合法分句 = (subject 0~1) + verb-chain(>=1) + (object <=1)。
  if (hasV) {
    // 骨架保留 NP / V / COORD,用来区分「I and you fight」(并列主语,合法)与
    // 「slay you me cat」(动词后裸名词堆砌,非法)。先把 NP COORD NP 折叠成一个 NP。
    let skel = roles.filter(r => r === 'NP' || r === 'V' || r === 'COORD');
    // 折叠并列名词: NP COORD NP → NP (反复折叠 I and you and he)
    for (let k = 1; k < skel.length - 1; ) {
      if (skel[k] === 'COORD' && skel[k - 1] === 'NP' && skel[k + 1] === 'NP') {
        skel.splice(k, 2); // 删掉 COORD 和其后的 NP,合成一个主语
      } else k++;
    }
    skel = skel.filter(r => r !== 'COORD'); // 残留并列连词(悬空已在别处校验)不计入骨架

    const firstV = skel.indexOf('V');
    const preN = skel.slice(0, firstV).filter(r => r === 'NP').length;   // 动词前名词(主语)
    let j = firstV;
    while (j + 1 < skel.length && skel[j + 1] === 'V') j++;              // 动词链
    const tail = skel.slice(j + 1);
    const tailN = tail.filter(r => r === 'NP').length;
    const tailHasV = tail.includes('V');

    if (preN > 1) return { ok: false, reason: 'too many subjects before verb' };   // N N V…
    if (tailN > 1) return { ok: false, reason: 'noun pile after verb chain' };     // …V N N (slay you me cat)
    if (tailHasV) return { ok: false, reason: 'verb-object interleaving' };         // …V N V…
    // 纯动词堆: 动词链 >=3 且全程无主语无宾语 → 不像人话(run jump slay)。
    // 放行: 单动词祈使「Slay」、双动词连动「go run」、有主/宾的「I go buy potion」「Slay dragon」。
    const vChainLen = j - firstV + 1;
    if (vChainLen >= 3 && preN === 0 && tailN === 0)
      return { ok: false, reason: 'verb pile with no subject or object' };
    return { ok: true }; // I slay / I slay dragon / I go buy / I and you fight / Slay / Slay dragon
  }

  // ---- 4. 非主谓感叹句 ----
  // 合法只有两种: (a) 纯叹词「Alas!」; (b) 单一名词性主体(+修饰) + 叹词「Moon, oh!」。
  // 多个裸名词 / 名词里混动词 = 乱堆, 不是呼告。
  if (hasExcl) {
    let body = roles.filter(r => r !== 'EXCL');
    for (let k = 1; k < body.length - 1; ) {
      if (body[k] === 'COORD' && body[k - 1] === 'NP' && body[k + 1] === 'NP') body.splice(k, 2);
      else k++;
    }
    body = body.filter(r => r !== 'COORD'); // 并列连词不构成主体
    const npCount = body.filter(r => r === 'NP').length;
    const hasVInBody = body.includes('V');

    if (body.length === 0) return { ok: true };               // 纯叹词「Alas!」
    if (body.every(r => r === 'MOD'))                          // 只有修饰「red big oh!」→ 缺主体
      return { ok: false, reason: 'exclamation has no subject (only modifiers)' };
    if (hasVInBody) return { ok: false, reason: 'not a sentence (verb mixed into exclamation)' };
    if (npCount === 1) return { ok: true };                    // 单一主体 + 叹词「Moon, oh!」
    return { ok: false, reason: 'not a sentence (noun pile plus exclamation)' };
  }

  // ---- 5. 其余: 无谓语核心、无感叹 → 纯堆砌,拒绝 ----
  if (count('NP') >= 1 && !hasPredicateCore)
    return { ok: false, reason: 'only nouns, no verb' };
  if (has('MOD') && !hasPredicateCore)
    return { ok: false, reason: 'only modifiers, no verb' };
  return { ok: false, reason: 'not a sentence' };
}

export function isWellFormed(rawCards) {
  const resolved = rawCards || [];

  const meaningful = resolved.filter(c => c.pos !== 'punctuation');
  if (meaningful.length === 0) return { ok: false, reason: 'empty sentence' };

  // 末尾句号/问号/感叹号不参与分句切分; 逗号才切。
  const body = resolved.filter(c => !(c.pos === 'punctuation' && c.punctType !== 'comma'));
  const clauses = splitClauses(body);

  for (const clause of clauses) {
    const r = clauseOk(clause);
    if (!r.ok) return r;
  }
  return { ok: true };
}

// 保留 import 以满足语言包契约(敌我指代复用,未来扩展呼告/指代规则时用)。
export { isSelfRefEn, isEnemyRefEn };
