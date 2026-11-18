import assert from 'node:assert/strict';
import engine from './.generated/engine.cjs';

const { DEFAULT_POOL, RequestUrlAccelerator } = engine;

// Synthetic pool: mirror prefixes chosen so rewrites are assertable.
const pool = ['alpha', 'beta', 'gamma'].map((name) => ({
  name,
  mappings: [
    {
      from: 'https://github.com/',
      to: `https://${name}.mirror/https://github.com/`,
    },
    {
      from: 'https://raw.githubusercontent.com/',
      to: `https://${name}.mirror/https://raw.githubusercontent.com/`,
    },
  ],
}));
const RELEASE_URL = 'https://github.com/o/r/releases/download/1.0.0/main.js';
const RELEASE_REWRITTEN =
  'https://alpha.mirror/https://github.com/o/r/releases/download/1.0.0/main.js';

// Fake ipc bridge: electron-shaped reply listeners receive (event, payload).
function createFakeIpc() {
  const listeners = new Map();
  const sent = [];
  const ipc = {
    send(channel, ...args) {
      sent.push({ channel, args });
    },
    on(channel, listener) {
      if (!listeners.has(channel)) listeners.set(channel, new Set());
      listeners.get(channel).add(listener);
    },
    removeListener(channel, listener) {
      listeners.get(channel)?.delete(listener);
    },
    emit(channel, ...args) {
      for (const listener of [...(listeners.get(channel) ?? [])]) {
        listener(...args);
      }
    },
    listenerCount(channel) {
      return listeners.get(channel)?.size ?? 0;
    },
  };
  return { ipc, sent };
}

const noEvent = { fake: true };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Accelerator mounted on a fake bridge, observation window kept short.
function installOn(ipc, options = {}) {
  const accel = new RequestUrlAccelerator({
    pool,
    probe: () => ipc,
    observeTimeoutMs: 200,
    ...options,
  });
  assert.equal(accel.install(), true);
  return accel;
}

// A16 — no IPC bridge (no require / no ipcRenderer): silent, unmounted,
// every request direct.
{
  const { ipc, sent } = createFakeIpc();
  const accel = new RequestUrlAccelerator({ pool, probe: () => null });
  assert.equal(accel.install(), false);
  assert.equal(accel.mounted, false);
  ipc.send('request-url', 'r1', { url: RELEASE_URL });
  assert.equal(sent[0].args[1].url, RELEASE_URL);
  accel.restore(); // no-op while unmounted, no throw
  assert.equal(accel.mounted, false);
}

// A15 — install mounts, repeated install is idempotent, restore restores
// the original send by identity, remounting works.
{
  const { ipc, sent } = createFakeIpc();
  const original = ipc.send;
  const accel = installOn(ipc);
  assert.equal(accel.mounted, true);
  assert.notEqual(ipc.send, original);
  assert.equal(accel.install(), true); // idempotent: no second wrapper
  accel.restore();
  assert.equal(ipc.send, original); // identity restored → single wrap proof
  assert.equal(accel.mounted, false);
  ipc.send('request-url', 'r1', { url: RELEASE_URL });
  assert.equal(sent[0].args[1].url, RELEASE_URL); // unrewritten after restore
  assert.equal(accel.install(), true); // remount works
  assert.notEqual(ipc.send, original);
  assert.equal(accel.activeName, 'alpha');
}

// A12 — requests hitting the active mapping are rewritten and accounted:
// success keeps the cursor, failure advances it, error payloads fail.
{
  const { ipc, sent } = createFakeIpc();
  const accel = installOn(ipc);
  ipc.send('request-url', 'req1', { url: RELEASE_URL });
  assert.equal(sent[0].args[1].url, RELEASE_REWRITTEN);
  assert.equal(accel.activeName, 'alpha');
  assert.equal(ipc.listenerCount('req1'), 1);
  ipc.emit('req1', noEvent, { status: 200 });
  assert.equal(accel.activeName, 'alpha'); // success: no advance
  ipc.send('request-url', 'req2', { url: RELEASE_URL });
  ipc.emit('req2', noEvent, { status: 403 });
  assert.equal(accel.activeName, 'beta'); // failure: advance
  ipc.send('request-url', 'req3', { url: RELEASE_URL });
  assert.ok(sent[2].args[1].url.startsWith('https://beta.mirror/'));
  ipc.emit('req3', noEvent, { error: {} }); // network-level failure
  assert.equal(accel.activeName, 'gamma');
}

// A12 — a success clears the failure streak: with a single candidate, two
// failures, a success, then two more failures must NOT blacklist (it would
// without the clear); the third failure after that does.
{
  const { ipc } = createFakeIpc();
  const accel = installOn(ipc, { pool: [pool[0]] });
  const fail = (id) => {
    ipc.send('request-url', id, { url: RELEASE_URL });
    ipc.emit(id, noEvent, { status: 403 });
  };
  fail('a1'); // streak 1
  fail('a2'); // streak 2
  assert.equal(accel.switchNext(), 'alpha'); // usable
  ipc.send('request-url', 'ok', { url: RELEASE_URL });
  ipc.emit('ok', noEvent, { status: 200 }); // clears the streak
  fail('a3'); // streak 1 again
  fail('a4'); // streak 2
  assert.equal(accel.switchNext(), 'alpha'); // would already be blacklisted otherwise
  fail('a5'); // streak 3 → blacklisted
  assert.equal(accel.switchNext(), null);
  assert.equal(accel.activeName, 'alpha'); // stays put
}

// A13 — the observation listener is removed after the first reply and a
// duplicate reply on the same request never accounts twice.
{
  const { ipc } = createFakeIpc();
  const accel = installOn(ipc, { pool: [pool[0]] });
  ipc.send('request-url', 'dup', { url: RELEASE_URL });
  assert.equal(ipc.listenerCount('dup'), 1);
  ipc.emit('dup', noEvent, { status: 403 }); // accounted once
  assert.equal(ipc.listenerCount('dup'), 0); // removed after the reply
  ipc.emit('dup', noEvent, { status: 403 }); // duplicate: ignored
  ipc.emit('dup', noEvent, { status: 403 }); // duplicate: ignored
  assert.equal(accel.switchNext(), 'alpha'); // still only one recorded failure
}

// A13 — a reply with no judgeable structure closes the window without
// accounting anything.
{
  const { ipc } = createFakeIpc();
  const accel = installOn(ipc);
  ipc.send('request-url', 'odd', { url: RELEASE_URL });
  ipc.emit('odd', noEvent, { nonsense: true });
  assert.equal(ipc.listenerCount('odd'), 0);
  assert.equal(accel.activeName, 'alpha'); // nothing recorded
}

// A14 — the observation timeout is injectable: a short window counts the
// unanswered request as a failure, removes the listener, and ignores the
// late reply afterwards.
{
  const { ipc } = createFakeIpc();
  const accel = new RequestUrlAccelerator({
    pool,
    probe: () => ipc,
    observeTimeoutMs: 20,
  });
  assert.equal(accel.install(), true);
  ipc.send('request-url', 'slow', { url: RELEASE_URL });
  assert.equal(accel.activeName, 'alpha');
  await sleep(50);
  assert.equal(accel.activeName, 'beta'); // timeout → failure → advance
  assert.equal(ipc.listenerCount('slow'), 0); // removed after the timeout
  ipc.emit('slow', noEvent, { status: 200 }); // late reply: window closed
  assert.equal(accel.activeName, 'beta');
}

// A3 — traffic outside the active mapping stays direct and is never
// accounted: foreign URLs, already-mirrored URLs, other channels.
{
  const { ipc, sent } = createFakeIpc();
  const accel = installOn(ipc);
  ipc.send('request-url', 'm1', { url: 'https://gitlab.com/o/r' });
  assert.equal(sent[0].args[1].url, 'https://gitlab.com/o/r');
  assert.equal(ipc.listenerCount('m1'), 0);
  const mirrored = 'https://alpha.mirror/https://github.com/o/r';
  ipc.send('request-url', 'm2', { url: mirrored });
  assert.equal(sent[1].args[1].url, mirrored); // idempotent pass-through
  assert.equal(ipc.listenerCount('m2'), 0);
  ipc.send('other-channel', 'x', { url: RELEASE_URL });
  assert.equal(sent[2].args[1].url, RELEASE_URL);
  assert.equal(accel.activeName, 'alpha'); // nothing above dragged the cursor
}

// Malformed requests are passed through without rewriting or observing.
{
  const { ipc, sent } = createFakeIpc();
  const accel = installOn(ipc);
  ipc.send('request-url', 'bare'); // no carrier argument at all
  assert.equal(sent[0].channel, 'request-url');
  ipc.send('request-url', 42, { url: RELEASE_URL }); // non-string request id
  assert.equal(sent[1].args[1].url, RELEASE_REWRITTEN); // rewritten…
  assert.equal(ipc.listenerCount('42'), 0); // …but nothing to observe
  assert.equal(accel.activeName, 'alpha');
}

// Without options the accelerator serves the built-in seed pool.
{
  const { ipc } = createFakeIpc();
  const accel = installOn(ipc, { pool: undefined });
  assert.equal(accel.activeName, DEFAULT_POOL[0].name);
}
