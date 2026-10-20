import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = process.env.QUERY_AGENT_DATASET
  ?? '/Users/admin/Documents/Agent评测/query-agent-poc/examples/comprehensive-query-eval/dataset.json';
const target = resolve(root, 'src/features/evaluation/query-agent-dataset.json');

const sourceDataset = JSON.parse(await readFile(source, 'utf8'));
if (!Array.isArray(sourceDataset.cases) || sourceDataset.cases.length !== 45) {
  throw new Error(`Expected 45 comprehensive cases, received ${sourceDataset.cases?.length ?? 0}.`);
}

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(sourceDataset)}\n`, 'utf8');
console.log(`Converted ${sourceDataset.cases.length} cases to ${target}`);
