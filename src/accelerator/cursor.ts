/**
 * Mirror cursor & passive health accounting (session memory, keyed by mirror
 * name): a failure of the active candidate advances the cursor in pool
 * order; a failure of any other candidate only accumulates its own streak.
 * Three consecutive failures blacklist a candidate for the session, with a
 * cooldown that releases it automatically afterwards. Only traffic that
 * actually went through a candidate ever records against it.
 */

/** Blacklist threshold: consecutive failures after which a candidate sits out the session. */
const BLACKLIST_THRESHOLD = 3;

/** Blacklist cooldown: after it elapses the candidate returns with a clean streak. */
const BLACKLIST_COOLDOWN_MS = 30 * 60 * 1000;

/**
 * Cursor over the ordered candidate pool. The clock is injected so blacklist
 * cooldown semantics are testable without real waiting.
 */
export class MirrorCursor {
  private readonly names: string[];
  private current: string;
  private readonly streaks = new Map<string, number>();
  private readonly blacklist = new Map<string, number>();
  private readonly now: () => number;

  constructor(names: string[], now: () => number = () => Date.now()) {
    this.names = [...names];
    this.current = this.names[0] ?? '';
    this.now = now;
  }

  /** Current active mirror name. */
  get activeName(): string {
    return this.current;
  }

  /**
   * Whether the candidate is blacklisted. Cooldown expiry is checked lazily:
   * once elapsed, the blacklist entry and the failure streak are cleared, so
   * the candidate re-enters rotation with a fresh budget.
   */
  isBlacklisted(name: string): boolean {
    const at = this.blacklist.get(name);
    if (at === undefined) {
      return false;
    }
    if (this.now() - at >= BLACKLIST_COOLDOWN_MS) {
      this.blacklist.delete(name);
      this.streaks.delete(name);
      return false;
    }
    return true;
  }

  /** Record one request outcome (name = the mirror actually used). */
  record(name: string, failed: boolean): void {
    if (this.isBlacklisted(name)) {
      return; // a late reply inside the cooldown window counts for nothing
    }
    if (!failed) {
      this.streaks.delete(name);
      return;
    }
    const next = (this.streaks.get(name) ?? 0) + 1;
    this.streaks.set(name, next);
    if (next >= BLACKLIST_THRESHOLD) {
      this.blacklist.set(name, this.now());
    }
    if (name === this.current) {
      const nextName = this.pickNext();
      if (nextName !== null) {
        this.current = nextName;
      }
    }
  }

  /**
   * Session reset: cursor back to the first pool entry, streaks and
   * blacklists cleared. Called when the accelerator mounts.
   */
  reset(): void {
    this.current = this.names[0] ?? '';
    this.streaks.clear();
    this.blacklist.clear();
  }

  /**
   * Switch to the next non-blacklisted candidate; returns the new active
   * name, or null when every candidate is blacklisted (cursor stays put).
   */
  switchNext(): string | null {
    const next = this.pickNext();
    if (next === null) {
      return null;
    }
    this.current = next;
    return next;
  }

  /**
   * Next non-blacklisted candidate starting after the current one, walking
   * the pool in order (wrapping around); null when none qualifies.
   */
  private pickNext(): string | null {
    const from = this.names.indexOf(this.current);
    const length = this.names.length;
    if (from === -1 || length === 0) {
      return null;
    }
    for (let step = 1; step <= length; step++) {
      const name = this.names[(from + step) % length];
      if (name !== undefined && !this.isBlacklisted(name)) {
        return name;
      }
    }
    return null;
  }
}
