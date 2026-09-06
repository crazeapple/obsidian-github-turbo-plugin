import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules',
    'dist',
    'esbuild.config.mjs',
    'version-bump.mjs',
    'versions.json',
    'main.js',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
  ]),
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['src/settings.ts'],
    rules: {
      // 设置页文案含 URL 字面量（添加镜像表单的占位与说明），规则会将
      // https://github.com 误报为应写作 HTTPS://GitHub.com——URL 必须原样，关闭。
      'obsidianmd/ui/sentence-case': 'off',
      // 声明式设置 API 需 Obsidian 1.13+（dev typings 1.12.3 尚无该 API），
      // 且设置页为动态池管理 UI，采纳属功能级变更——暂缓，关闭告警。
      'obsidianmd/settings-tab/prefer-setting-definitions': 'off',
    },
  },
);
