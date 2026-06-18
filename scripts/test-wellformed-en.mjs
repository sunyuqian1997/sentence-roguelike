// Run: node scripts/test-wellformed-en.mjs
// English well-formedness gate corpus with gold labels. 每条: word/pos 序列 + 期望成句与否。
// 失败会打印, 用来暴露 special case / 规则漏洞。
// pos 简写: s=subject v=verb o=object m=modifier c=connector
//   x=exclamation .=period ,=comma !=exclMark ?=question sp=special
//   T=enemy target  S=self target
import { isWellFormed } from '../src/lang/en/wellformed.js';

const POS = { s:'subject', v:'verb', o:'object', m:'modifier', c:'connector',
  x:'exclamation', sp:'special' };
function card(tok) {
  const [word, tag] = tok.split('/');
  if (tag === '.') return { word:'.', pos:'punctuation', punctType:'period' };
  if (tag === ',') return { word:',', pos:'punctuation', punctType:'comma' };
  if (tag === '?') return { word:'?', pos:'punctuation', punctType:'question' };
  if (tag === '!') return { word:'!', pos:'punctuation', punctType:'exclamation' };
  if (tag === 'T') return { word, pos:'object', _isEnemyTarget:true, _enemyIdx:0 };
  if (tag === 'S') return { word, pos:'subject', _isSelfTarget:true };
  return { word, pos: POS[tag] || tag };
}
function parse(s) { return s.trim().split(/\s+/).map(card); }

// [sentence, word序列, 期望成句, 句型/理由]
const CASES = [
  // ===== SVO / 主谓 / 祈使 (accept) =====
  ['I slay',          'I/s slay/v',                    true,  'subject+verb'],
  ['I slay dragon',   'I/s slay/v dragon/o',           true,  'SVO'],
  ['I slay enemy',    'I/s slay/v enemy/T',            true,  'SVO (target)'],
  ['Slay!',           'Slay/v Slay/!',                 true,  'imperative bare verb'],
  ['Slay dragon',     'Slay/v dragon/o',               true,  'imperative V+O'],
  ['I fiercely slay', 'I/s fiercely/m slay/v',         true,  'subject+modifier+verb'],
  ['I go buy potion', 'I/s go/v buy/v potion/o',       true,  'serial verb S+V+V+O'],
  ['I go buy',        'I/s go/v buy/v',                true,  'serial verb, dropped object'],

  // ===== copula / be-sentence (accept) =====
  ['I am cat',        'I/s am/c cat/o',                true,  'copula + noun complement'],
  ['I am red',        'I/s am/c red/m',                true,  'copula + adjective complement'],
  ['Emperor is me',   'Emperor/s is/c me/s',           true,  'copula NP=NP'],
  ['You are weak',    'You/s are/v weak/m',            true,  'copula tagged as verb'],

  // ===== coordinated subjects (accept) =====
  ['I and you fight', 'I/s and/c you/s fight/v',       true,  'coordinated subjects + verb'],
  ['I and enemy run', 'I/s and/c enemy/T run/v',       true,  'coordinated subjects (target)'],

  // ===== compound clauses (accept) =====
  ['I slay, you flee','I/s slay/v enemy/T ,/, you/s flee/v', true, 'compound, both clauses valid'],
  ['I slay, you run', 'I/s slay/v ,/, you/s run/v',    true,  'compound, dropped object'],

  // ===== exclamation / vocative (accept) =====
  ['Alas!',           'Alas/x',                        true,  'pure exclamation'],
  ['Oh no!',          'Oh/x no/x',                     true,  'multi exclamation'],
  ['Moon, oh!',       'Moon/s oh/x',                   true,  'vocative NP + exclamation'],
  ['Red sun, oh!',    'Red/m sun/s oh/x',              true,  'modifier + subject + exclamation'],

  // ===== noun piles / modifiers (reject) =====
  ['dragon sword',    'dragon/o sword/o',              false, 'pure noun pile'],
  ['I you he',        'I/s you/s he/s',                false, 'pure subject pile'],
  ['red big',         'red/m big/m',                   false, 'pure modifiers'],

  // ===== pure / dangling connectors (reject) =====
  ['and but',         'and/c but/c',                   false, 'pure connectors'],
  ['and I',           'and/c I/s',                     false, 'leading coordinator, no predicate'],
  ['I slay and',      'I/s slay/v and/c',              false, 'dangling connector at end'],

  // ===== copula edge (reject) =====
  ['I am',            'I/s am/c',                      false, 'bare copula, nothing after'],
  ['I am and',        'I/s am/c and/c',                false, 'copula then dangling connector'],

  // ===== verb pile / interleave (reject) =====
  ['run jump slay',   'run/v jump/v slay/v',           false, 'verb pile, no subject/object'],
  ['slay you me cat', 'slay/v you/s me/s cat/o',       false, 'V N N N junk after verb'],
  ['I eat I run',     'I/s eat/v food/o I/s run/v',    false, 'verb-object interleaving'],
  ['cat I slay',      'cat/s I/s slay/v',              false, 'two subjects before verb'],

  // ===== empty clause / sub-clause invalid (reject) =====
  ['I slay,',         'I/s slay/v ,/,',                false, 'trailing empty clause'],
  [', you flee',      ',/, you/s flee/v',              false, 'leading empty clause'],
  ['I slay,,you flee','I/s slay/v ,/, ,/, you/s flee/v', false, 'double comma empty clause'],
  ['I slay, and but', 'I/s slay/v ,/, and/c but/c',    false, 'second clause pure connectors'],

  // ===== exclamation boundary (reject) =====
  ['red oh!',         'red/m oh/x',                    false, 'exclamation, only modifier'],
  ['hero room all oh','hero/s room/o all/o oh/x',      false, 'noun pile + exclamation'],
];

let pass = 0;
const fails = [];
for (const [text, sh, expect, note] of CASES) {
  const r = isWellFormed(parse(sh));
  if (r.ok === expect) pass++;
  else fails.push({ text, expect, got: r, note });
}

console.log(`\nWell-formedness test (EN): ${pass}/${CASES.length} passed, ${fails.length} failed\n`);
if (fails.length) {
  console.log('=== FAILURES ===');
  for (const f of fails) {
    const exp = f.expect ? 'accept' : 'reject';
    const got = f.got.ok ? 'accepted' : `rejected (${f.got.reason})`;
    console.log(`x "${f.text}" (${f.note})  expected:${exp}  got:${got}`);
  }
  process.exit(1);
} else {
  console.log('All passed.');
}
