import assert from 'node:assert/strict';
import engine from './.generated/engine.cjs';

const { DEFAULT_POOL, rewriteUrl, isMirrorFailure, judgeReply } = engine;

const RELEASE_URL =
  'https://github.com/obsidianmd/obsidian-releases/releases/download/1.5.12/main.js';
const RAW_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/README.md';

// Seed pool ships the two standard mapping pairs per mirror.
const prefixMirror = DEFAULT_POOL[0];
assert.ok(prefixMirror, 'seed pool must not be empty');
const [githubPair, rawPair] = prefixMirror.mappings;
assert.ok(githubPair && rawPair, 'seed mirror must have two mapping pairs');

// A1 — prefix-concat rewrite (github and raw pairs).
const rewrittenRelease = rewriteUrl(RELEASE_URL, prefixMirror);
const rewrittenRaw = rewriteUrl(RAW_URL, prefixMirror);
assert.equal(
  rewrittenRelease,
  githubPair.to + RELEASE_URL.slice(githubPair.from.length),
);
assert.equal(rewrittenRaw, rawPair.to + RAW_URL.slice(rawPair.from.length));

// A1 — domain-replacement rewrite, carried by the same pair form.
const domainSwap = {
  name: 'swap.test',
  mappings: [
    { from: 'https://github.com/', to: 'https://mirror.example/github/' },
  ],
};
assert.equal(
  rewriteUrl(
    'https://github.com/o/r/releases/download/1.0.0/f.zip',
    domainSwap,
  ),
  'https://mirror.example/github/o/r/releases/download/1.0.0/f.zip',
);

// A `to` without a trailing slash is normalized before both rewrite and the
// idempotency check.
const noSlash = {
  name: 'ns.test',
  mappings: [{ from: 'https://github.com/', to: 'https://join.example' }],
};
assert.equal(
  rewriteUrl('https://github.com/a', noSlash),
  'https://join.example/a',
);
assert.equal(
  rewriteUrl('https://join.example/a', noSlash),
  'https://join.example/a',
);

// A2 — a rewrite output is never rewritten again (idempotent).
assert.equal(rewriteUrl(rewrittenRelease, prefixMirror), rewrittenRelease);
assert.equal(rewriteUrl(rewrittenRaw, prefixMirror), rewrittenRaw);
assert.equal(
  rewriteUrl(githubPair.to + 'o/r/anywhere', prefixMirror),
  githubPair.to + 'o/r/anywhere',
);
// Idempotency covers any mapping of the candidate, not just the hit one.
assert.equal(rewriteUrl(rewrittenRaw, domainSwap), rewrittenRaw);

// A3 — a URL outside the mappings passes through unchanged.
assert.equal(
  rewriteUrl('https://gitlab.com/o/r', prefixMirror),
  'https://gitlab.com/o/r',
);
assert.equal(
  rewriteUrl('https://gitee.com/x', prefixMirror),
  'https://gitee.com/x',
);
// Near-prefix hosts are misses, not partial rewrites.
assert.equal(
  rewriteUrl('https://github.com.evil.io/o/r', prefixMirror),
  'https://github.com.evil.io/o/r',
);

// Broken pairs (empty from/to) are ignored, valid ones still rewrite.
const broken = {
  name: 'b.test',
  mappings: [
    { from: '', to: 'https://x.example/' },
    { from: 'https://github.com/', to: '' },
    { from: 'https://github.com/', to: 'https://ok.example/' },
  ],
};
assert.equal(
  rewriteUrl('https://github.com/a', broken),
  'https://ok.example/a',
);

// A4 — 404 splits by path: release downloads count as mirror failures,
// every other path is an upstream truth and is not counted.
assert.equal(isMirrorFailure(404, RELEASE_URL), true);
assert.equal(
  isMirrorFailure(404, 'https://github.com/o/r/commits/main'),
  false,
);
assert.equal(
  isMirrorFailure(404, 'https://github.com/o/r/releases/tag/1.0.0'),
  false,
);
assert.equal(isMirrorFailure(404, RAW_URL), false);

// A5 — 403 / 429 / 5xx fail; 2xx / 3xx succeed; other statuses are not
// mirror failures by this rule.
assert.equal(isMirrorFailure(403, RELEASE_URL), true);
assert.equal(isMirrorFailure(429, RELEASE_URL), true);
assert.equal(isMirrorFailure(500, RELEASE_URL), true);
assert.equal(isMirrorFailure(503, RELEASE_URL), true);
assert.equal(isMirrorFailure(200, RELEASE_URL), false);
assert.equal(isMirrorFailure(204, RELEASE_URL), false);
assert.equal(isMirrorFailure(301, RELEASE_URL), false);
assert.equal(isMirrorFailure(302, RELEASE_URL), false);
assert.equal(isMirrorFailure(401, RELEASE_URL), false);

// A5 — judgeReply: error payload = network-level failure.
assert.equal(judgeReply({ error: {} }, RELEASE_URL), true);
assert.equal(judgeReply({ error: null }, RELEASE_URL), true);

// A5 — judgeReply: numeric status defers to isMirrorFailure.
assert.equal(judgeReply({ status: 200 }, RELEASE_URL), false);
assert.equal(judgeReply({ status: 302 }, RELEASE_URL), false);
assert.equal(judgeReply({ status: 403 }, RELEASE_URL), true);
assert.equal(judgeReply({ status: 404 }, RELEASE_URL), true);
assert.equal(
  judgeReply({ status: 404 }, 'https://github.com/o/r/README.md'),
  false,
);
// Realistic reply shape carries extra fields alongside status.
assert.equal(
  judgeReply({ json: {}, status: 200, headers: {} }, RELEASE_URL),
  false,
);

// A5 — undeterminable structures are skipped silently.
assert.equal(judgeReply(undefined, RELEASE_URL), undefined);
assert.equal(judgeReply(null, RELEASE_URL), undefined);
assert.equal(judgeReply('oops', RELEASE_URL), undefined);
assert.equal(judgeReply(42, RELEASE_URL), undefined);
assert.equal(judgeReply({}, RELEASE_URL), undefined);
assert.equal(judgeReply({ status: '200' }, RELEASE_URL), undefined);
