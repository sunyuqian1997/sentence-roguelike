// Chant log — records a full snapshot of every chanted sentence so we can
// review which sentences produced which verdicts/effects and spot unbalanced
// or nonsensical rulings. Persisted to localStorage; inspectable from the
// console (window.__chantLog / __exportLog / __clearLog) and via probe.mjs.
import { G } from './state.js';

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
      },
      enemies,
    };
  } else {
    return;
  }
  log.push(entry);
  save(log);
}

function round(x) { return typeof x === 'number' ? Math.round(x * 1000) / 1000 : x; }

export function getLog() { return load(); }
export function clearLog() { save([]); return 'chant log cleared'; }

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
