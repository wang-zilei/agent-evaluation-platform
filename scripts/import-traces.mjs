import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { normalizeTrace } from './normalize-trace.mjs';

const [directory, sessionFile] = process.argv.slice(2);
if (!directory) throw new Error('Usage: node scripts/import-traces.mjs <turn-directory> [session-file]');
const session = sessionFile ? JSON.parse(readFileSync(sessionFile, 'utf8')) : null;
const sessionId = session?.id ?? null;
const sessionTraces = session?.traces ?? [];
const traces = [1, 2, 3].map((turn) => {
  const meta = sessionTraces[turn - 1] ?? {};
  return normalizeTrace(JSON.parse(readFileSync(resolve(directory, `turn${turn}.json`), 'utf8')), turn, sessionId, meta.id ?? null, meta.timestamp ?? null);
});
const output = resolve('src/features/evaluation/trace-data');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'traces.json'), JSON.stringify(traces, null, 2) + '\n');
console.table(traces.map((t) => ({ file: t.sourceFile, originalMessages: t.sourceMessageCount, history: t.historyMessageCount, events: t.events.length, tools: t.toolCount, reasoning: t.reasoningCount, inputTokens: t.inputTokens, outputTokens: t.outputTokens })));
