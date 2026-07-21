#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditEffectEntries } from '../src/game/effectAudit.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] || path.join(root, 'chantlog.ndjson');
if (!fs.existsSync(file)) {
  console.log(`效果审计：还没有 ${path.basename(file)}，实际吟诵后会自动生成。`);
  process.exit(0);
}

const entries = fs.readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
const issues = auditEffectEntries(entries);
if (!issues.length) console.log(`效果审计通过：检查 ${entries.length} 条本地吟诵记录，未发现作用对象错误。`);
else {
  console.log(`效果审计发现 ${issues.length} 个问题：`);
  issues.forEach((issue) => console.log(`- ${issue}`));
}
