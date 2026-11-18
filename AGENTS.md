# GitHub Turbo — 开发指南

面向 Agent 的本仓开发指南。GitHub Turbo 是一个 Obsidian 社区插件，通过镜像改写地址加速内置市场的 GitHub 访问。

## 项目概览

- 目标：Obsidian 社区插件（TypeScript → 打包为 JavaScript）。
- 入口：`src/main.ts` 编译为 `main.js`，由 Obsidian 加载。
- 发布产物：`main.js`、`manifest.json`、可选的 `styles.css`。
- 设计事实源：`docs/design.md`——实现或变更功能前先读它；设计决策做出时同步更新。

## 环境与工具

- Node.js：24 或更新（声明在 `package.json` 的 `devEngines`；mise 经 `mise.toml` 自动识别）。
- 包管理器：**pnpm**（声明在 `package.json` 的 `devEngines`）。
- 打包器：**esbuild**（`esbuild.config.mjs`）——全部依赖打进 `main.js`，无未打包的运行时依赖。
- 类型：`obsidian` 类型定义（钉在 `^1.14.4`）。

### 安装

```bash
pnpm install
```

### 开发（watch 模式）

```bash
pnpm dev
```

## 质量门禁

`pnpm check` 是本地与 CI 的统一入口，依次执行：

1. `pnpm format:check`——Prettier 检查全部非 markdown 的源文件与配置（范围见 `.prettierignore`）。
2. `pnpm lint`——ESLint，含 `eslint-plugin-obsidianmd` 的 Obsidian 专属规则。
3. `pnpm lint:md`——markdownlint 检查根级与 `docs/` 下的 markdown（`*.md` 与 `docs/**/*.md`，配置在 `.markdownlint-cli2.jsonc`）。
4. `pnpm validate`——发布元数据校验：`manifest.json` / `versions.json` 可解析且跨文件一致（semver、版本映射）。
5. `pnpm test`——引擎单测（`tests/*.test.mjs`，由 `scripts/test.mjs` 发现）。
6. `pnpm build`——类型检查（`tsc --noEmit`）+ 生产构建。

markdown 有意不在 Prettier 管辖内，markdownlint 是它唯一的检查器。`pnpm format` 自动修复格式。

GitHub Action 在每次 push 与 pull request 时运行 `pnpm check`。

## 文件与目录约定

- 源码在 `src/`。`main.ts` 保持最小：只做插件生命周期（onload、onunload、注册）——功能逻辑放独立模块（引擎、设置）。
- `scripts/test.mjs` 与 `tests/` 承载引擎测试 harness。
- **不提交构建产物**：永不提交 `node_modules/`、`main.js` 或其他生成文件。
- 插件保持小巧，避免大依赖，优先浏览器兼容的包。
- 发布产物必须位于 vault 中插件文件夹的顶层（`main.js`、`manifest.json`、有则 `styles.css`）。

## manifest 规则（`manifest.json`）

- 必含字段（不完全）：
  - `id`（插件 ID；本地开发时应与文件夹名一致）
  - `name`
  - `version`（语义化版本 `x.y.z`）
  - `minAppVersion`
  - `description`
  - `isDesktopOnly`（布尔）
  - 可选：`author`、`authorUrl`、`fundingUrl`（字符串或映射）
- 发布后不改 `id`，视之为稳定 API。
- 用了新 API 就保持 `minAppVersion` 准确。
- 规范要求固化在：<https://github.com/obsidianmd/obsidian-releases/blob/master/.github/workflows/validate-plugin-entry.yml>

## 测试

两层，都是验收的一部分：

- **引擎单测**（`pnpm test`）：纯逻辑覆盖（改写、回退、记账语义），在纯 Node 中运行。harness 用 esbuild 打包引擎源码并 stub `obsidian` 模块。
- **真机 E2E**：把 `main.js` 与 `manifest.json` 复制到 `<Vault>/.obsidian/plugins/obsidian-github-turbo-plugin/`，重载 Obsidian，在 **Settings → Community plugins** 启用插件，然后逐场景走市场流程（浏览、安装、更新、回退、拉黑恢复）。

## 命令与设置

- 面向用户的命令一律经 `this.addCommand(...)` 添加。
- 插件有配置就提供设置页与合理默认值。本插件采用声明式 Settings API（`getSettingDefinitions()`），为此 `minAppVersion` 钉在 1.13.0。
- 用 `this.loadData()` / `this.saveData()` 持久化设置。
- 命令 ID 保持稳定，发布后不改名。

## 版本与发布

- 单一入口：`pnpm version <major|minor|patch|x.y.z>`——同步 `package.json`、`manifest.json`（经 `version-bump.mjs`）与 `versions.json`，然后一步完成提交与打 tag。tag 是裸版本号（无 `v` 前缀，配置在 `.npmrc`）。
- 推送用 `git push --follow-tags`。release 工作流校验 tag 与版本一致性、构建、创建 **draft** release；publish 是人工检查步骤。
- `0.x` 版本是未稳定的过程版（标记 pre-release）；`1.0.0` 起是正式版本。
- `CHANGELOG.md` 每版本一节、面向用户、最新的在上（随首个版本创建）；章节标题就是版本号（如 `## 0.1.0`）。release 说明由 release 工作流从对应章节提取——章节缺失时工作流直接失败，所以发版前必须写好本版章节。
- 每次发布保持 `versions.json` 里的 `minAppVersion` 准确。

## Git 纪律

- 提交信息：标题动词开头；正文不折行，条目一行一个。
- 提交与推送前统一门禁（`pnpm check`）全绿。

## 安全、隐私与合规

遵循 Obsidian 的 **Developer Policies** 与 **Plugin Guidelines**。特别是：

- 默认本地/离线运行，只有功能必需时才发网络请求。
- 无暗藏遥测；若收集可选分析或调用第三方服务，必须显式 opt-in 并在 `README.md` 与设置中写明。
- 永不执行远程代码、抓取并 eval 脚本、或在正常发布之外自动更新插件代码。
- 最小化范围：只读写 vault 内必要内容，不访问 vault 外文件。
- 用到的外部服务、发送的数据与风险都要明示。
- 尊重用户隐私：除非绝对必要且明确同意，不收集 vault 内容、文件名或个人信息。
- 避免欺骗性设计、广告、垃圾通知。
- 用 `register*` 助手注册并清理所有 DOM、app 与 interval 监听，保证插件安全卸载。

## UX 与文案（UI 文本、命令、设置）

- 标题、按钮、名称优先 sentence case（句首大写）。
- 步骤式文案用清晰、动作导向的祈使句。
- 用 **粗体** 表示字面 UI 标签，交互优先用「select」。
- 导航用箭头记法：**Settings → Community plugins**。
- 应用内字符串保持简短、一致、无行话。

## 行文规范

- 斜杠连接并列项（表示或、与）时，前后加空格：`node 24+ / pnpm 12.20+`、`tsc / 构建`；路径与模块名内不加：`pnpm/setup@v3`、`docs/design.md`。

## 性能

- 启动保持轻，重活推迟到需要时。
- 避免在 `onload` 里做长任务，用惰性初始化。
- 磁盘访问分批，避免过度的 vault 扫描。
- 对文件系统事件的高开销操作做防抖/节流。

## 编码约定

- TypeScript，优先 `"strict": true`。
- **`main.ts` 保持最小**：只关注插件生命周期（onload、onunload、addCommand 调用），功能逻辑全部委托给独立模块。
- **大文件拆分**：超过约 200-300 行就考虑拆成更小、职责集中的模块。
- **模块边界清晰**：每个文件单一、明确的职责。
- 全部打进 `main.js`（无未打包的运行时依赖）。
- 想兼容移动端就避免 Node/Electron API，相应设置 `isDesktopOnly`。本插件是桌面专用（`isDesktopOnly: true`）——它包装 Electron 的 `ipcRenderer`。
- 优先 `async/await` 而非 promise 链，优雅处理错误。

## 移动端

- `isDesktopOnly` 不是 `true` 就别假设桌面专属行为。本插件是桌面专用，移动端不在范围内。
- 避免大内存结构，留意内存与存储限制。

## Agent 守则

### 应做

- 命令用稳定 ID，发布后不改名。
- 设置提供默认值与校验。
- 写幂等代码路径，重载/卸载不泄漏监听或 interval。
- 一切需要清理的东西用 `this.register*` 助手。
- 宣称工作完成前跑 `pnpm check`。

### 不应做

- 没有明显的用户价值与文档说明就引入网络调用。
- 发布依赖云服务的功能而无清晰披露与显式 opt-in。
- 存储或传输 vault 内容，除非必要且获同意。

## 常见任务

### 持久化设置

```ts
async onload() {
  const stored = (await this.loadData()) as Partial<TurboSettings>;
  this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
}

async saveSettings() {
  await this.saveData(this.settings);
}
```

### 安全注册监听

```ts
this.registerEvent(
  this.app.workspace.on('file-open', (f) => {
    /* ... */
  }),
);
this.registerDomEvent(activeWindow, 'resize', () => {
  /* ... */
});
this.registerInterval(
  window.setInterval(() => {
    /* ... */
  }, 1000),
);
```

### 添加命令

```ts
this.addCommand({
  id: 'stable-command-id',
  name: 'Do the thing',
  callback: () => this.doTheThing(),
});
```

## 故障排查

- 构建后插件不加载：确认 `main.js` 与 `manifest.json` 在 `<Vault>/.obsidian/plugins/<plugin-id>/` 顶层。
- 构建问题：`main.js` 缺失时，跑 `pnpm build` 或 `pnpm dev` 编译 TypeScript 源码。
- 命令不出现：确认 `addCommand` 在 `onload` 之后执行且 ID 唯一。
- 设置不持久化：确认 `loadData`/`saveData` 有 await，且改动后重新渲染 UI。

## 参考

- Obsidian 官方插件模板：<https://github.com/obsidianmd/obsidian-sample-plugin>
- API 文档：<https://docs.obsidian.md>
- 开发者政策：<https://docs.obsidian.md/Developer+policies>
- 插件指南：<https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines>
- 风格指南：<https://help.obsidian.md/style-guide>
