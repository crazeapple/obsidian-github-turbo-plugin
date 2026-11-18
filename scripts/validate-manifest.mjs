import { readFileSync } from 'fs';
import assert from 'node:assert/strict';

// Release-metadata validation for the quality gate: JSON parseability plus
// cross-file consistency. package.json and tsconfig.json need no script —
// pnpm and tsc parse them on every check run; manifest.json and versions.json
// are only read at release time, so a broken file would surface too late.
const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
const versions = JSON.parse(readFileSync('versions.json', 'utf8'));

assert.match(
  manifest.version,
  /^\d+\.\d+\.\d+$/,
  'manifest.version must be semver',
);
assert.match(
  manifest.minAppVersion,
  /^\d+\.\d+\.\d+$/,
  'manifest.minAppVersion must be semver',
);
assert.equal(
  versions[manifest.version],
  manifest.minAppVersion,
  'versions.json must map manifest.version to manifest.minAppVersion',
);
assert.ok(manifest.id.length > 0, 'manifest.id must be non-empty');
assert.equal(
  typeof manifest.isDesktopOnly,
  'boolean',
  'isDesktopOnly must be boolean',
);
console.log('manifest metadata ok');
