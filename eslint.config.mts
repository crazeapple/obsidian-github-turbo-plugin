import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
  globalIgnores(['node_modules', 'dist', 'main.js']),
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
    // Node tooling (test runner, build scripts) — console output is their job;
    // the obsidianmd no-console guidance targets plugin runtime code.
    files: ['scripts/**/*.mjs'],
    rules: {
      'obsidianmd/rule-custom-message': 'off',
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
