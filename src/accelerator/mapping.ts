/**
 * Mapping rewrite & reply verdict rules: a URL hitting a `from` prefix is
 * rewritten to `to` + the remaining path; a rewrite output is never rewritten
 * again (idempotent). Replies are judged into success / failure /
 * undeterminable, and undeterminable ones are skipped silently.
 */

/** Mapping pair: original URL prefix → mirror URL prefix. */
export interface MappingPair {
  /** The original prefix to rewrite (with trailing slash), e.g. `https://github.com/`. */
  from: string;
  /** The rewritten prefix (with trailing slash). */
  to: string;
}

/** Mirror candidate: the name is both unique identity and display label. */
export interface MirrorCandidate {
  /** Mirror name — unique identity; fallback order follows pool order. */
  name: string;
  /** Ordered mapping pairs (at least the github and raw pairs). */
  mappings: MappingPair[];
}

/**
 * Built-in seed pool: pool order is fallback priority, finalized from
 * real-world measurements by scripts/probe-seeds.mjs (dual probe, sorted by
 * measured latency). Public mirrors drift hard — re-run the probe
 * periodically and update this list from its output.
 */
export const DEFAULT_POOL: MirrorCandidate[] = [
  {
    name: 'gh-proxy.com',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://gh-proxy.com/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://gh-proxy.com/https://raw.githubusercontent.com/',
      },
    ],
  },
  {
    name: 'cors.isteed.cc',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://cors.isteed.cc/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://cors.isteed.cc/https://raw.githubusercontent.com/',
      },
    ],
  },
  {
    name: 'ghproxy.net',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://ghproxy.net/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://ghproxy.net/https://raw.githubusercontent.com/',
      },
    ],
  },
  {
    name: 'gh.ddlc.top',
    mappings: [
      {
        from: 'https://github.com/',
        to: 'https://gh.ddlc.top/https://github.com/',
      },
      {
        from: 'https://raw.githubusercontent.com/',
        to: 'https://gh.ddlc.top/https://raw.githubusercontent.com/',
      },
    ],
  },
];

/**
 * Whether a response status means a mirror failure (404 splits by path):
 * - 404 on a `/releases/download/` path = the mirror lacks the asset (the
 *   version comes from marketplace data, so upstream has it) → failure;
 * - any other 404 = an upstream truth (e.g. a delisted plugin) → not counted;
 * - 403 / 429 (rate limiting) and 5xx → failure; 2xx / 3xx → success.
 */
export function isMirrorFailure(status: number, url: string): boolean {
  if (status === 404) {
    return url.includes('/releases/download/');
  }
  return status === 403 || status === 429 || status >= 500;
}

/**
 * Reply verdict for accounting: true / false = failure / success;
 * undefined = the structure says nothing — skip silently.
 * - an `error` field (network-level failure: DNS, refused, timeout — seen as
 *   `{"error":{}}`) → failure;
 * - a numeric `status` → `isMirrorFailure` on HTTP semantics.
 */
export function judgeReply(
  response: unknown,
  url: string,
): boolean | undefined {
  if (!response || typeof response !== 'object') {
    return undefined;
  }
  const slot = response as { status?: unknown; error?: unknown };
  if ('error' in slot) {
    return true;
  }
  if (typeof slot.status !== 'number') {
    return undefined;
  }
  return isMirrorFailure(slot.status, url);
}

/** Normalize a `to` prefix to end with exactly one slash. */
function normalizeTo(to: string): string {
  return to.endsWith('/') ? to : `${to}/`;
}

/**
 * Unified rewrite: a URL that is already the output of any mapping of this
 * candidate (starts with its normalized `to`) is returned as-is (idempotent);
 * a URL hitting a `from` prefix is rewritten to `to` + the remaining path;
 * anything else passes through unchanged (direct connection). Prefix-concat
 * and domain-swap mirrors are both carried by the same pair form — no
 * dispatch needed.
 */
export function rewriteUrl(url: string, candidate: MirrorCandidate): string {
  const pairs = candidate.mappings.filter((p) => p.from && p.to);
  if (pairs.some((p) => url.startsWith(normalizeTo(p.to)))) {
    return url;
  }
  const hit = pairs.find((p) => url.startsWith(p.from));
  return hit ? normalizeTo(hit.to) + url.slice(hit.from.length) : url;
}
