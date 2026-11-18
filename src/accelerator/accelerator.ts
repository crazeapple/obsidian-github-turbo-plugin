/**
 * Mirror rewrite engine entry. Re-exports the public surface as it grows
 * across modules (mapping rules, cursor, channel accelerator). Zero
 * `obsidian` imports so the engine bundles to plain CJS for the test
 * harness — no module stub needed.
 */
export * from './mapping';
export * from './cursor';
