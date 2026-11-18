/**
 * Seed-pool probe: re-measures the built-in mirror candidates over direct
 * HTTPS (no Obsidian involved) and prints an availability table sorted by
 * measured latency. Each candidate gets two probes — its github-domain and
 * raw-domain mapping — each judged in two layers:
 *   1. HTTP semantics: the final status must be 2xx (404 / 403 / 429 / 5xx
 *      fail, redirects are followed);
 *   2. content fingerprint: a 2xx body must contain the marker, otherwise
 *      the "mirror" is a parked domain serving junk.
 * A candidate passes only when both probes pass; its latency is the slower
 * of the two. Feed the passing list (ascending latency) back into
 * DEFAULT_POOL in src/accelerator/mapping.ts.
 *
 * Usage: node scripts/probe-seeds.mjs
 */

import http from 'node:http';
import https from 'node:https';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const USER_AGENT = 'obsidian-github-turbo-probe';
const MARKER = 'Obsidian';

// Both probes read the Obsidian repository README: the github probe takes
// the github.com raw path (same redirect chain shape as release downloads),
// the raw probe takes the raw domain directly.
const GITHUB_PROBE_URL =
  'https://github.com/obsidianmd/obsidian-releases/raw/HEAD/README.md';
const RAW_PROBE_URL =
  'https://raw.githubusercontent.com/obsidianmd/obsidian-releases/HEAD/README.md';

// Working candidate set: public prefix-concat mirrors (`https://<mirror>/https://github.com/...`).
// Public availability drifts hard — this list is re-measured, never assumed.
const CANDIDATES = [
  'gh-proxy.com',
  'cors.isteed.cc',
  'ghproxy.net',
  'gh.ddlc.top',
  'ghfast.top',
  'github.moeyy.xyz',
  'ghproxy.link',
  'ghps.cc',
  'ghproxy.cc',
  'cf.ghproxy.cc',
  'hub.gitmirror.com',
  'github.scrmy.cn',
  'gh.tbeds.top',
  'gh.llkk.cc',
];

/** GET a URL with redirects followed manually and the body collected. */
function get(target, hopsLeft = MAX_REDIRECTS) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    // Some mirrors redirect to plain http — dispatch by protocol.
    const requester = target.startsWith('http://') ? http : https;
    const req = requester.get(
      target,
      { headers: { 'User-Agent': USER_AGENT } },
      (res) => {
        const status = res.statusCode ?? 0;
        const location = res.headers.location;
        if (status >= 300 && status < 400 && location && hopsLeft > 0) {
          res.resume();
          resolve(get(new URL(location, target).toString(), hopsLeft - 1));
          return;
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status,
            body: Buffer.concat(chunks).toString('utf8'),
            ms: Date.now() - startedAt,
          });
        });
      },
    );
    req.on('error', (err) => {
      resolve({ error: err.message, ms: Date.now() - startedAt });
    });
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`timeout after ${REQUEST_TIMEOUT_MS} ms`));
    });
  });
}

/** Two-layer verdict on one probe result. */
function judge(result) {
  if (result.error) {
    return { ok: false, detail: result.error, ms: result.ms };
  }
  if (result.status < 200 || result.status >= 300) {
    return { ok: false, detail: `HTTP ${result.status}`, ms: result.ms };
  }
  if (!result.body.includes(MARKER)) {
    return {
      ok: false,
      detail: `HTTP ${result.status}, unexpected content (${result.body.length} B)`,
      ms: result.ms,
    };
  }
  return { ok: true, detail: `${result.ms} ms`, ms: result.ms };
}

/** Probe both mappings of one candidate concurrently. */
async function probeCandidate(name) {
  const url = (probe) => `https://${name}/${probe}`;
  const [github, raw] = await Promise.all([
    get(url(GITHUB_PROBE_URL)).then(judge),
    get(url(RAW_PROBE_URL)).then(judge),
  ]);
  const ok = github.ok && raw.ok;
  const latency = Math.max(github.ms, raw.ms);
  return { name, ok, github, raw, latency };
}

const results = await Promise.all(CANDIDATES.map(probeCandidate));

const mark = (probe) => (probe.ok ? '✓' : '✗');
// Keep long failure reasons (TLS errors, timeouts) from breaking the table.
const cell = (probe) => {
  const text = `${mark(probe)} ${probe.detail}`;
  return (text.length > 40 ? `${text.slice(0, 39)}…` : text).padEnd(42);
};
const passing = results
  .filter((r) => r.ok)
  .sort((a, b) => a.latency - b.latency);
const failing = results
  .filter((r) => !r.ok)
  .sort((a, b) => a.latency - b.latency);

console.log(
  'candidate'.padEnd(22),
  'github'.padEnd(42),
  'raw'.padEnd(42),
  'latency (slower probe)',
);
for (const r of [...passing, ...failing]) {
  const verdict = r.ok ? `OK ${r.latency} ms` : 'FAIL';
  console.log(r.name.padEnd(22), cell(r.github), cell(r.raw), verdict);
}

console.log('');
if (passing.length > 0) {
  console.log(
    `passing (${passing.length}), ascending latency:\n  ${passing
      .map((r) => r.name)
      .join(' → ')}`,
  );
} else {
  console.log('no candidate passed — network down or every mirror dead?');
}
if (failing.length > 0) {
  console.log(
    `failing (${failing.length}): ${failing.map((r) => r.name).join(', ')}`,
  );
}
