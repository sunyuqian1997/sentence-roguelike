// Chant log — records a full snapshot of every chanted sentence so we can
// review which sentences produced which verdicts/effects and spot unbalanced
// or nonsensical rulings. Persisted to localStorage; inspectable from the
// console (window.__chantLog / __exportLog / __clearLog) and via probe.mjs.
import { G } from './state.js';
import { auditEffectEntries } from './effectAudit.js';

const KEY = 'sentence_rogue_chantlog';
const MAX_ENTRIES = 500;

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { return []; }
}
function save(arr) {
  try { localStorage.setItem(KEY, JSON.stringify(arr.slice(-MAX_ENTRIES))); }
  catch { /* quota / disabled — ignore */ }
}

// Summarize a card as used in this sentence (pos reflects active meaning).
function cardSnapshot(c) {
  if (!c) return null;
  if (c._isEnemyTarget) return { word: c.word, role: 'enemy-target', idx: c._enemyIdx };
  if (c._isSelfTarget || c._isFixedWo) return { word: '我', role: 'self-target' };
  const s = { word: c.word, pos: c.pos };
  if (c.punctType) s.punctType = c.punctType;
  if (c.pos === 'verb') {
    s.combatType = c.combatType;
    s.enemyRestVerb = !!c.enemyRestVerb;
    const specialKeys = [
      'moyuSpecial', 'bailanSpecial', 'liuleSpecial', 'huashuiSpecial', 'pengciSpecial',
      'tiredSpecial', 'sleepSpecial', 'fallenSpecial', 'shuaiguoSpecial', 'tangyingSpecial',
      'kaibaiSpecial', 'puaSpecial', 'stealStrength', 'poisonVerb', 'dodgeNext', 'executeVerb',
    ];
    s.ruleType = specialKeys.some((key) => c[key]) ? 'special' : 'generic';
  }
  if (c._activeMeaning) s.meaning = c._activeMeaning.id || c._activeMeaning.label;
  return s;
}

// result: the evaluateSentence() return value. summon: optional summon info.
export function logChant({ result, summon } = {}) {
  const log = load();
  const enemies = (G.enemies || []).map(e => ({ name: e.name, hp: e.hp, maxHp: e.maxHp }));

  let entry;
  if (summon) {
    entry = {
      n: log.length + 1, turn: G.turn, act: G.act,
      kind: 'summon', text: summon.text, summon: summon.summonName,
      enemies,
    };
  } else if (result) {
    const e = result.effects || {};
    entry = {
      n: log.length + 1, turn: G.turn, act: G.act,
      kind: 'sentence',
      text: result.text,
      cards: (result.cards || []).map(cardSnapshot).filter(Boolean),
      mult: {
        grammar: round(result.grammarMult),
        literary: round(result.literaryMult),
        punct: round(result.punctMult),
        total: round(result.totalMult),
      },
      notes: {
        grammar: result.grammarNotes || [],
        literary: result.literaryNotes || [],
        punct: result.punctNotes || [],
        exc: result.excNotes || [],
      },
      predicates: (e._predicates || []).map(p => ({
        kind: p.kind, target: p.target,
        subject: p.subjectWord, pred: p.srcWord,
        identity: p.identityWord, pun: p.pun && p.pun.tag,
      })),
      constructions: (result.constructions || []).map(c => c.id),
      motifs: (e._motifTriggers || []).map(m => m.motif.id),
      imperative: e._imperative || null,
      effects: {
        damage: e.damage || 0, block: e.block || 0, heal: e.heal || 0,
        strengthGain: e.strengthGain || 0, draw: e.draw || 0,
        aoe: !!e.aoe, ignoreBlock: !!e.ignoreBlock,
        applyVuln: e.applyVuln || 0, applyWeak: e.applyWeak || 0,
        selfHarm: e.selfHarm ? (e.selfHarmDmg || 0) : 0,
        multiTarget: (e.multiTargetIndices && e.multiTargetIndices.length) || 0,
        targetEnemyIdx: e.targetEnemyIdx,
        enemyBlock: e._enemyBlock || null,
        enemyHeal: e._enemyHeal || null,
        enemyStrength: e._enemyStrength || null,
        enemyRest: e._enemyRest || null,
      },
      enemies,
    };
  } else {
    return;
  }
  const auditIssues = auditEffectEntries([entry]);
  if (auditIssues.length) {
    entry.auditIssues = auditIssues;
    console.warn('[词灵录·效果审计]', ...auditIssues);
  }
  log.push(entry);
  save(log);
  postToDevSink(entry);
}

// Dev-only: also ship the entry to the vite middleware so it lands in
// chantlog.ndjson on disk (localStorage is isolated per browser profile, so a
// file is the only thing the reviewer can read reliably). No-op in prod.
function postToDevSink(entry) {
  try {
    if (typeof fetch !== 'function') return;
    fetch('/__chantlog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      keepalive: true,
    }).catch(() => {});
  } catch (e) { /* ignore */ }
}

function round(x) { return typeof x === 'number' ? Math.round(x * 1000) / 1000 : x; }

export function getLog() { return load(); }
export function clearLog() { save([]); return 'chant log cleared'; }

export function auditLog() {
  const issues = auditEffectEntries(load());
  if (issues.length) console.warn(`%c词灵录 · 发现 ${issues.length} 个作用对象问题`, 'color:#C54B3C;font-weight:bold', issues);
  else console.log('%c词灵录 · 未发现作用对象错误', 'color:#2E8B84;font-weight:bold');
  return issues;
}

export function printLog() {
  const log = load();
  /* eslint-disable no-console */
  console.log(`%c词灵录 · 吟诵日志 (${log.length} 条)`, 'color:#D9A441;font-weight:bold');
  log.forEach(e => {
    if (e.kind === 'summon') {
      console.log(`#${e.n} [召唤] 「${e.text}」 → ${e.summon}`);
    } else {
      const ef = e.effects;
      const parts = [];
      if (ef.damage) parts.push(`⚔${ef.damage}${ef.aoe ? '(群)' : ''}${ef.ignoreBlock ? '(穿)' : ''}`);
      if (ef.block) parts.push(`🛡${ef.block}`);
      if (ef.heal) parts.push(`♥${ef.heal}`);
      if (ef.enemyBlock?.amount) parts.push(`敌🛡${ef.enemyBlock.amount}`);
      if (ef.enemyHeal?.amount) parts.push(`敌♥${ef.enemyHeal.amount}`);
      if (ef.enemyRest) parts.push('敌🛌停攻');
      if (ef.selfHarm) parts.push(`💔${ef.selfHarm}`);
      console.log(
        `#${e.n} 「${e.text}」 ×${e.mult.total}  ${parts.join(' ')}\n` +
        `   g${e.mult.grammar}·l${e.mult.literary}·p${e.mult.punct}` +
        (e.constructions.length ? ` | 句式:${e.constructions.join(',')}` : '') +
        (e.predicates.length ? ` | 谓词:${e.predicates.map(p => p.kind).join(',')}` : '') +
        (e.motifs.length ? ` | 母题:${e.motifs.join(',')}` : '')
      );
    }
  });
  return `${log.length} 条吟诵记录`;
  /* eslint-enable no-console */
}

export function exportLog() {
  const blob = new Blob([JSON.stringify(load(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chantlog-${load().length}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloading chantlog.json';
}
