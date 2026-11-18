import assert from 'node:assert/strict';
import engine from './.generated/engine.cjs';

const { MirrorCursor } = engine;

const T0 = 1_700_000_000_000;
const COOLDOWN_MS = 30 * 60 * 1000;

// Injectable clock: mutate `now` to travel in time.
let now = T0;
const clock = () => now;
const freshCursor = (names = ['alpha', 'beta', 'gamma']) =>
  new MirrorCursor(names, clock);

// A6 — an active failure advances the cursor to the next pool entry,
// wrapping around the pool order.
const c6 = freshCursor();
assert.equal(c6.activeName, 'alpha');
c6.record('alpha', true);
assert.equal(c6.activeName, 'beta');
c6.record('beta', true);
assert.equal(c6.activeName, 'gamma');
c6.record('gamma', true);
assert.equal(c6.activeName, 'alpha');

// A7 — a non-active failure only accumulates its own streak and never
// drags the cursor, even when it reaches the blacklist threshold.
const c7 = freshCursor();
c7.record('alpha', true); // alpha → beta, alpha streak 1
assert.equal(c7.activeName, 'beta');
c7.record('alpha', true); // alpha:2, cursor unmoved
assert.equal(c7.activeName, 'beta');
c7.record('alpha', true); // alpha:3 → blacklisted, cursor still unmoved
assert.equal(c7.activeName, 'beta');
assert.ok(c7.isBlacklisted('alpha'));

// A success keeps the active candidate in place.
const cKeep = freshCursor();
cKeep.record('alpha', false);
assert.equal(cKeep.activeName, 'alpha');

// A success clears the failure streak.
const cSuc = freshCursor();
cSuc.record('alpha', true); // alpha:1, → beta
cSuc.record('alpha', true); // alpha:2
cSuc.record('alpha', false); // clears the streak
cSuc.record('alpha', true); // alpha:1 again — not a third strike
assert.ok(!cSuc.isBlacklisted('alpha'));

// A8 — three consecutive failures blacklist; the blacklisted candidate is
// skipped when advancing.
const c8 = freshCursor();
c8.record('alpha', true); // alpha:1, → beta
c8.record('alpha', true); // alpha:2
assert.ok(!c8.isBlacklisted('alpha'));
c8.record('alpha', true); // alpha:3 → blacklisted
assert.ok(c8.isBlacklisted('alpha'));

const c8s = freshCursor();
c8s.record('alpha', true); // alpha:1, → beta
c8s.record('beta', true); // beta:1, → gamma
c8s.record('beta', true);
c8s.record('beta', true); // beta:3 → blacklisted
assert.ok(c8s.isBlacklisted('beta'));
c8s.record('gamma', true); // gamma:1, → alpha
assert.equal(c8s.activeName, 'alpha');
c8s.record('alpha', true); // alpha:2, advance skips blacklisted beta → gamma
assert.equal(c8s.activeName, 'gamma');

// A8 — cooldown expiry releases the candidate and clears its streak
// (injected clock); replies inside the cooldown window count for nothing.
now = T0 + COOLDOWN_MS - 1;
assert.ok(c8.isBlacklisted('alpha'));
now = T0 + COOLDOWN_MS;
assert.equal(c8.isBlacklisted('alpha'), false);

const cRec = freshCursor();
now = T0; // reset the clock: the block above travelled forward
cRec.record('alpha', true); // alpha:1, → beta
cRec.record('alpha', true); // alpha:2
cRec.record('alpha', true); // alpha:3 → blacklisted
cRec.record('alpha', true); // ignored: inside the cooldown window
cRec.record('alpha', true); // ignored: inside the cooldown window
now = T0 + COOLDOWN_MS;
cRec.record('alpha', true); // released with a clean streak — strike 1 only
assert.ok(!cRec.isBlacklisted('alpha'));

// A9 — every candidate blacklisted: the cursor stays where it is.
const c9 = freshCursor();
c9.record('alpha', true); // alpha:1, → beta
c9.record('alpha', true); // alpha:2
c9.record('alpha', true); // alpha:3 → blacklisted (alpha non-active: no advance)
assert.equal(c9.activeName, 'beta');
c9.record('gamma', true); // gamma:1
c9.record('gamma', true); // gamma:2
c9.record('gamma', true); // gamma:3 → blacklisted, cursor unmoved
assert.equal(c9.activeName, 'beta');
c9.record('beta', true); // beta:1
c9.record('beta', true); // beta:2
c9.record('beta', true); // beta:3 → blacklisted, nothing left to advance to
assert.equal(c9.activeName, 'beta');
assert.ok(c9.isBlacklisted('alpha'));
assert.ok(c9.isBlacklisted('beta'));
assert.ok(c9.isBlacklisted('gamma'));

// A10 — switchNext jumps to the next non-blacklisted candidate (wrapping,
// skipping blacklisted ones); null and no movement when all are blacklisted.
const c10 = freshCursor();
assert.equal(c10.switchNext(), 'beta');
assert.equal(c10.switchNext(), 'gamma');
assert.equal(c10.switchNext(), 'alpha');

const c10b = freshCursor();
c10b.record('alpha', true); // alpha:1, → beta
c10b.record('beta', true); // beta:1, → gamma
c10b.record('beta', true);
c10b.record('beta', true); // beta:3 → blacklisted
assert.equal(c10b.switchNext(), 'alpha');
assert.equal(c10b.activeName, 'alpha');
assert.equal(c10b.switchNext(), 'gamma'); // wraps over blacklisted beta

assert.equal(c9.switchNext(), null);
assert.equal(c9.activeName, 'beta');

// A11 — session reset: cursor back to the first entry, streaks and
// blacklists cleared.
const c11 = freshCursor();
c11.record('alpha', true); // alpha:1, → beta
c11.record('alpha', true);
c11.record('alpha', true); // alpha:3 → blacklisted (no advance: alpha non-active)
assert.equal(c11.activeName, 'beta');
assert.ok(c11.isBlacklisted('alpha'));
c11.reset();
assert.equal(c11.activeName, 'alpha');
assert.equal(c11.isBlacklisted('alpha'), false);
c11.record('alpha', true); // alpha:1 (streak was cleared), → beta
c11.record('alpha', true); // alpha:2
assert.ok(!c11.isBlacklisted('alpha'));

// Edge — a single-candidate pool keeps serving itself until blacklisted.
const solo = new MirrorCursor(['solo'], clock);
solo.record('solo', true);
assert.equal(solo.activeName, 'solo');
assert.equal(solo.switchNext(), 'solo');

// Edge — an empty pool has no active name and nothing to switch to.
const empty = new MirrorCursor([], clock);
assert.equal(empty.activeName, '');
assert.equal(empty.switchNext(), null);
assert.doesNotThrow(() => empty.reset());
