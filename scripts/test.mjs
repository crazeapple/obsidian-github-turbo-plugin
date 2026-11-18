import { existsSync, readdirSync } from 'fs';
import { spawnSync } from 'child_process';

// Discovers tests/*.test.mjs and runs each with plain Node. Test files get
// the engine bundled for them (esbuild + obsidian stub) once the engine
// work lands; until then the suite is simply empty and passes.
const dir = 'tests';
const files = existsSync(dir)
  ? readdirSync(dir).filter((f) => f.endsWith('.test.mjs'))
  : [];

if (files.length === 0) {
  console.log('no test files yet (tests/*.test.mjs)');
  process.exit(0);
}

const failed = files.filter(
  (f) => spawnSync('node', [`${dir}/${f}`], { stdio: 'inherit' }).status !== 0,
);
if (failed.length > 0) {
  console.error(`\n${failed.length} test file(s) failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`\n${files.length} test file(s) passed`);
