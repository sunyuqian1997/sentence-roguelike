#!/usr/bin/env node
// ============================================================================
// chant-stats.mjs — 解析根目录 chantlog.ndjson（真实玩家/试玩吟诵快照）,输出:
//   1. 句子使用频次 top20
//   2. 倍率分布（分桶）
//   3. 命中规则频次 top20（grammar/literary/punct/exc notes）
//   4. 平均句长
// 旧格式/坏行容错跳过并计数。
// 用法: node scripts/chant-stats.mjs [path/to/chantlog.ndjson]
// 字段口径见 src/game/chantLog.js#logChant。
// ============================================================================
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(root, 'chantlog.ndjson');

if (!fs.existsSync(file)) {
  console.error(`找不到 ${file}`);
  process.exit(1);
}

const lines = fs.readFileSync(file, 'utf8').split('\n').filter(l => l.trim());

let badLines = 0;      // JSON 解析失败
let oldFormat = 0;     // 能解析但缺关键字段（旧格式）
let summons = 0;
const entries = [];

for (const line of lines) {
  let e;
  try { e = JSON.parse(line); } catch { badLines++; continue; }
  if (!e || typeof e !== 'object') { badLines++; continue; }
  if (e.kind === 'summon') { summons++; continue; }
  // 新格式 sentence 行必须有 text + mult.total + notes；否则算旧格式跳过
  if (e.kind !== 'sentence' || typeof e.text !== 'string' || !e.mult || typeof e.mult.total !== 'number' || !e.notes) {
    oldFormat++;
    continue;
  }
  entries.push(e);
}

if (entries.length === 0) {
  console.log(`共 ${lines.length} 行: 有效句子 0, 召唤 ${summons}, 坏行 ${badLines}, 旧格式 ${oldFormat}。无可统计数据。`);
  process.exit(0);
}

const topN = (map, n = 20) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

// --- 1. 句子频次 ---
const textFreq = new Map();
for (const e of entries) textFreq.set(e.text, (textFreq.get(e.text) || 0) + 1);

// --- 2. 倍率分桶 ---
const BUCKETS = [
  ['< 1.0', x => x < 1],
  ['1.0-1.5', x => x >= 1 && x < 1.5],
  ['1.5-2.0', x => x >= 1.5 && x < 2],
  ['2.0-2.5', x => x >= 2 && x < 2.5],
  ['2.5-3.0', x => x >= 2.5 && x < 3],
  ['3.0-4.0', x => x >= 3 && x < 4],
  ['≥ 4.0', x => x >= 4],
];
const bucketCounts = BUCKETS.map(([label]) => [label, 0]);
const mults = entries.map(e => e.mult.total);
for (const m of mults) {
  const i = BUCKETS.findIndex(([, f]) => f(m));
  if (i >= 0) bucketCounts[i][1]++;
}
const avgMult = mults.reduce((a, b) => a + b, 0) / mults.length;

// --- 3. 命中规则频次（四类 notes 合并;去掉具体数字保留规则形态） ---
const ruleFreq = new Map();
for (const e of entries) {
  const notes = [
    ...(e.notes.grammar || []),
    ...(e.notes.literary || []),
    ...(e.notes.punct || []),
    ...(e.notes.exc || []),
  ];
  for (const n of notes) {
    if (typeof n !== 'string') continue;
    // 归一化: 「长句加成 +0.2」「+5%」等数字变体折叠为同一规则
    const key = n.replace(/[+×x-]?\d+(\.\d+)?%?/g, '#').trim();
    ruleFreq.set(key, (ruleFreq.get(key) || 0) + 1);
  }
}

// --- 4. 平均句长 ---
// 口径一: 卡牌张数(不含目标卡? cards 里含目标卡,按记录原样计)
// 口径二: 文本字符数(含标点)
const cardLens = entries.filter(e => Array.isArray(e.cards)).map(e => e.cards.length);
const charLens = entries.map(e => e.text.length);
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// --- 输出 ---
const out = [];
out.push(`# chant-stats — ${path.basename(file)}`);
out.push('');
out.push(`共 ${lines.length} 行 → 有效句子 ${entries.length}, 召唤 ${summons}, JSON 坏行 ${badLines}, 旧格式跳过 ${oldFormat}`);
out.push('');
out.push(`平均句长: ${avg(cardLens).toFixed(2)} 张卡 / ${avg(charLens).toFixed(2)} 字符`);
out.push(`平均总倍率: ×${avgMult.toFixed(2)}  (最小 ×${Math.min(...mults).toFixed(2)}, 最大 ×${Math.max(...mults).toFixed(2)})`);
out.push('');
out.push('## 倍率分布');
out.push('');
out.push('| 桶 | 句数 | 占比 |');
out.push('|---|---|---|');
for (const [label, c] of bucketCounts) {
  const bar = '█'.repeat(Math.round((c / entries.length) * 30));
  out.push(`| ${label} | ${c} | ${((c / entries.length) * 100).toFixed(1)}% ${bar} |`);
}
out.push('');
out.push('## 句子使用频次 top20');
out.push('');
out.push('| 句子 | 次数 |');
out.push('|---|---|');
for (const [text, c] of topN(textFreq)) out.push(`| 「${text}」 | ${c} |`);
out.push('');
out.push(`(独特句子 ${textFreq.size} 种 / ${entries.length} 句, 重复率 ${(100 * (1 - textFreq.size / entries.length)).toFixed(1)}%)`);
out.push('');
out.push('## 命中规则频次 top20 (数字已折叠为 #)');
out.push('');
out.push('| 规则 | 次数 |');
out.push('|---|---|');
for (const [rule, c] of topN(ruleFreq)) out.push(`| ${rule} | ${c} |`);

console.log(out.join('\n'));
