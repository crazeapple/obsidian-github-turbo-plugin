import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules',
    'dist',
    'main.js',
    // Generated artifacts: test-harness bundle and the local broken-first
    // test build (README test section S5).
    'tests/.generated',
    'test-build-broken-first',
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    // Node tooling (test runner, build scripts, probe, tests) — console
    // output is their job; the obsidianmd no-console guidance targets plugin
    // runtime code. They run in plain Node, where the popout-window timer
    // guidance does not apply either.
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    rules: {
      'obsidianmd/rule-custom-message': 'off',
      'obsidianmd/prefer-window-timers': 'off',
    },
  },
  {
    // The engine is environment-neutral (bundled to plain CJS for the Node
    // test harness) — bare timers keep it free of a `window` reference.
    files: ['src/accelerator/**/*.ts'],
    rules: {
      'obsidianmd/prefer-window-timers': 'off',
    },
  },
  {
    rules: {
      // "GitHub Turbo" is the product name — a proper noun the sentence-case
      // rule would otherwise lowercase to "GitHub turbo".
      'obsidianmd/ui/sentence-case': [
        'warn',
        { ignoreRegex: ['GitHub Turbo'] },
      ],
    },
  },
);
