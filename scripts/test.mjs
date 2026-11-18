import { existsSync, mkdirSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

// Harness: bundle the engine entry (src/accelerator/accelerator.ts) to CJS,
// then discover tests/*.test.mjs and run each with plain Node. The engine
// has zero `obsidian` imports, so no module stub is needed. The bundle is a
// generated artifact (tests/.generated) and never committed.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

mkdirSync(join(root, 'tests', '.generated'), { recursive: true });
await esbuild.build({
  entryPoints: [join(root, 'src', 'accelerator', 'accelerator.ts')],
  bundle: true,
  format: 'cjs',
  target: 'es2021',
  outfile: join(root, 'tests', '.generated', 'engine.cjs'),
  logLevel: 'silent',
});

const dir = join(root, 'tests');
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.test.mjs'))
  : [];

if (files.length === 0) {
  console.log('no test files yet (tests/*.test.mjs)');
  process.exit(0);
}

const failed = files.filter(
  (f) => spawnSync('node', [join(dir, f)], { stdio: 'inherit' }).status !== 0,
);
if (failed.length > 0) {
  console.error(`\n${failed.length} test file(s) failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\n${files.length} test file(s) passed`);
