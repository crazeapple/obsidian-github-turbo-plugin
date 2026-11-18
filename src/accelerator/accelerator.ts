/**
 * Channel accelerator for Obsidian's `request-url` bridge: wraps the
 * renderer's `ipcRenderer.send`, rewriting GitHub URLs of requests that hit
 * the active mirror's mappings before they go out, and observing each
 * request's reply channel for passive health accounting. install() mounts,
 * restore() unmounts; repeated installs are idempotent and an environment
 * without the IPC bridge silently stays unmounted.
 */

import { MirrorCursor } from './cursor';
import {
  DEFAULT_POOL,
  judgeReply,
  rewriteUrl,
  type MirrorCandidate,
} from './mapping';

export * from './mapping';
export * from './cursor';

/** Built-in marketplace requests cross the bridge on this channel. */
const REQUEST_URL_CHANNEL = 'request-url';

/** Wide default observation window — release downloads can be large. */
const DEFAULT_OBSERVE_TIMEOUT_MS = 120_000;

/** Minimal shape of the renderer-side electron ipcRenderer. */
export interface IpcLike {
  send: (channel: string, ...args: unknown[]) => void;
  /** Reply observation needs these; without them the engine only rewrites. */
  on?: (channel: string, listener: (...args: unknown[]) => void) => unknown;
  removeListener?: (
    channel: string,
    listener: (...args: unknown[]) => void,
  ) => unknown;
}

/** Environment probe: returns the ipcRenderer when one can be mounted. */
export type IpcProbe = () => IpcLike | null;

/**
 * Desktop probe: the renderer exposes Node `require` and the electron
 * `ipcRenderer`. Any structural change (or a non-desktop shell) yields null
 * — the caller stays unmounted, without throwing.
 */
function detectIpc(): IpcLike | null {
  try {
    const nodeRequire = (
      window as unknown as {
        require?: (id: string) => unknown;
      }
    ).require;
    if (typeof nodeRequire !== 'function') {
      return null;
    }
    const electron = nodeRequire('electron') as { ipcRenderer?: IpcLike };
    const ipc = electron?.ipcRenderer;
    if (!ipc || typeof ipc.send !== 'function') {
      return null;
    }
    return ipc;
  } catch {
    return null;
  }
}

/** Injectable knobs for the accelerator. */
export interface AcceleratorOptions {
  /** Ordered candidates (pool order = fallback priority); defaults to the seed pool. */
  pool?: MirrorCandidate[];
  /** Environment probe; defaults to detecting the electron ipcRenderer. */
  probe?: IpcProbe;
  /** Observation timeout in ms; defaults to 120 s (short values aid tests). */
  observeTimeoutMs?: number;
  /** Cursor clock; defaults to Date.now. */
  now?: () => number;
}

/** First object-shaped argument carrying a string `url` — the rewrite carrier. */
interface UrlCarrier {
  slot: { url?: unknown };
  url: string;
}

function findUrlCarrier(args: unknown[]): UrlCarrier | undefined {
  for (const arg of args) {
    if (arg && typeof arg === 'object') {
      const slot = arg as { url?: unknown };
      if (typeof slot.url === 'string') {
        return { slot, url: slot.url };
      }
    }
  }
  return undefined;
}

/**
 * Whether the request carrier carries credentials — an Authorization
 * header under any key casing. Auth-bearing traffic stays direct: the
 * mirror is a third party and must never see it.
 */
export function hasAuthorizationHeader(slot: unknown): boolean {
  if (!slot || typeof slot !== 'object') {
    return false;
  }
  const headers = (slot as { headers?: unknown }).headers;
  if (!headers || typeof headers !== 'object') {
    return false;
  }
  return Object.keys(headers).some(
    (key) => key.toLowerCase() === 'authorization',
  );
}

export class RequestUrlAccelerator {
  private readonly pool: MirrorCandidate[];
  private readonly probe: IpcProbe;
  private readonly observeTimeoutMs: number;
  private readonly cursor: MirrorCursor;
  private ipc: IpcLike | null = null;
  private originalSend: ((channel: string, ...args: unknown[]) => void) | null =
    null;

  constructor(options: AcceleratorOptions = {}) {
    this.pool = options.pool ?? DEFAULT_POOL;
    this.probe = options.probe ?? detectIpc;
    this.observeTimeoutMs =
      options.observeTimeoutMs ?? DEFAULT_OBSERVE_TIMEOUT_MS;
    this.cursor = new MirrorCursor(
      this.pool.map((c) => c.name),
      options.now,
    );
  }

  /** Whether `send` is currently wrapped. */
  get mounted(): boolean {
    return this.originalSend !== null;
  }

  /** Current active mirror name. */
  get activeName(): string {
    return this.cursor.activeName;
  }

  /**
   * Mount the rewrite + observation wrapper. Returns true when mounted
   * (idempotent) and false when the environment has no IPC bridge — the
   * engine stays unmounted silently and every request goes out direct.
   */
  install(): boolean {
    if (this.mounted) {
      return true;
    }
    const ipc = this.probe();
    if (!ipc) {
      return false;
    }
    const original = ipc.send;
    ipc.send = (channel: string, ...args: unknown[]) => {
      if (channel === REQUEST_URL_CHANNEL) {
        this.accelerate(ipc, args);
      }
      original.apply(ipc, [channel, ...args]);
    };
    this.ipc = ipc;
    this.originalSend = original;
    return true;
  }

  /** Restore the original `send`; a no-op while unmounted. */
  restore(): void {
    if (!this.mounted || !this.ipc || !this.originalSend) {
      return;
    }
    this.ipc.send = this.originalSend;
    this.ipc = null;
    this.originalSend = null;
  }

  /**
   * Manual switch to the next non-blacklisted candidate; returns the new
   * active name, or null when every candidate is blacklisted.
   */
  switchNext(): string | null {
    return this.cursor.switchNext();
  }

  /**
   * Session reset: cursor to the first pool entry, streaks and blacklists
   * cleared — a blacklisted mirror gets a fresh chance each session.
   */
  reset(): void {
    this.cursor.reset();
  }

  /**
   * Through-traffic rule: only a request hitting the active candidate's own
   * mapping is rewritten AND accounted. A miss (direct traffic, or an
   * already mirrored URL — rewriteUrl is idempotent) passes through
   * untouched and never drags the cursor. Requests carrying credentials
   * (Authorization header) are exempt outright: they stay direct and
   * unaccounted — the mirror is a third party and must never see them.
   */
  private accelerate(ipc: IpcLike, args: unknown[]): void {
    const carrier = findUrlCarrier(args);
    if (!carrier) {
      return;
    }
    if (hasAuthorizationHeader(carrier.slot)) {
      return;
    }
    const candidate = this.pool.find((c) => c.name === this.cursor.activeName);
    if (!candidate) {
      return;
    }
    const target = rewriteUrl(carrier.url, candidate);
    if (target === carrier.url) {
      return;
    }
    carrier.slot.url = target;
    const requestId = args[0];
    if (typeof requestId === 'string') {
      this.observe(ipc, candidate.name, requestId, carrier.url);
    }
  }

  /**
   * One-shot observation on the request-ID reply channel: the first reply
   * (or the timeout) removes the listener, so a request is accounted at
   * most once and no listener leaks.
   */
  private observe(
    ipc: IpcLike,
    name: string,
    requestId: string,
    url: string,
  ): void {
    if (typeof ipc.on !== 'function') {
      return; // replies can't be observed: rewrite only
    }
    let done = false;
    const cleanup = () => {
      clearTimeout(timer);
      ipc.removeListener?.(requestId, onReply);
    };
    const onReply = (...replyArgs: unknown[]) => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      // electron listeners receive (event, payload) — the payload is args[1]
      const verdict = judgeReply(replyArgs[1], url);
      if (verdict !== undefined) {
        this.cursor.record(name, verdict);
      }
    };
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      cleanup();
      this.cursor.record(name, true); // observation timeout → failure
    }, this.observeTimeoutMs);
    ipc.on(requestId, onReply);
  }
}
