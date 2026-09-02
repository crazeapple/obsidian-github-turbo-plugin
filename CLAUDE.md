# obsidian-github-turbo-plugin

Obsidian 的 GitHub 插件，加速 Obsidian 插件或主题的浏览、安装和更新。

本项目采用 SDD 需求治理体系（Vibe Coding 模式）：AI 主导编码，需求对话式动态探索，全部治理文档由 AI 按工作流自动维护，项目尾声可归档干净完整的需求与设计文档供新项目复用。

## 需求层级（三层）

- **Intent（I-XXX，总纲）**：模糊需求的产品层澄清与路线图，记录于 `sdd/INITIATIVE.md`，不进状态机。
- **Proposal（P-XXX）**：可独立验收的开发单元（基础件或功能块），真正的开发循环从这里开始，禁止以产品版本形态立项。
- **Task（T-XXX）**：design 任务清单内的执行单元，可数十个、可分组，禁止单独建文件。

两级拆分不跨层：I 拆 P、P 拆 T。状态机（Proposal）：`exploring → specified → implementing → verifying → accepted`，旁路 `on-hold`、终态 `rejected`，禁止跳跃。

## 会话必读

冷启动必须依次读取并在回报中给出摘要（含意向池概览）：

1. `sdd/CONSTITUTION.md` — 治理宪法（根本法）
2. `sdd/INDEX.md` — 登记簿：Proposal 状态唯一权威源
3. `sdd/INITIATIVE.md` — 意向池：意向唯一记录

## 命令一览

| 命令 | 用途 |
|---|---|
| `/sdd-intake` | 新需求受理：维护/需求分类三问，分流为直接发 P 或立 I 拆解 |
| `/sdd-finalize` | 探索定稿：exploring → specified，产出规格，被否备选进 amendments |
| `/sdd-split` | 拆任务：specified → implementing，建 design 骨架与任务清单 |
| `/sdd-start` | 实现推进：按 design 任务清单执行 Task，状态变更回填 design |
| `/sdd-accept` | 验收：AC 逐条以实际证据核对，verifying → accepted |
| `/sdd-board` | 只读面板：输出意向与提案状态总览，不改任何文档 |
| `/sdd-archive` | 归档：accepted 提案产出四产物入 archive，sdd 全区只读 |

## 硬规则

1. INDEX 是状态唯一权威源、INITIATIVE 是意向唯一记录，变更即时同步。
2. 新想法先分类：维护直接做；需求一律经 `/sdd-intake` 受理。
3. 定稿后需求变更留痕升版，禁静默覆盖。
4. 被否备选与选型替换记入 `amendments/`，禁删漏记。
5. 写改 sdd 文档后运行 mdLint，零 error 方可回报。
6. 归档后 sdd 全区只读。
7. 命令文件（`.claude/commands/*.md`）新增或删除后必须同步增删 `.opencode/commands/` 同名存根，`description` 变更须同步存根描述行，正文永不复制。

## 路径与 ID 约定

| 路径 | 用途 |
|---|---|
| `sdd/CONSTITUTION.md` | 治理宪法（根本法） |
| `sdd/INDEX.md` | 登记簿：提案状态唯一权威源 + P/T 发号计数器 |
| `sdd/INITIATIVE.md` | 意向池：意向唯一记录 + I 发号计数器 |
| `sdd/amendments/` | 修正案目录（A 发号计数器在 `amendments/README.md`，一案一文件） |
| `sdd/exploring/` | 探索区（动态形成，不预建；含追加式 journal.md） |
| `sdd/specs/` | 稳定区（每提案一目录：spec.md + design.md，动态形成，不预建） |
| `sdd/templates/` | 模板四件套（proposal / spec / design / task） |
| `sdd/tools/mdlint.sh` | Markdown 规范校验工具 |
| `sdd/archive/` | 归档区（只读 + 四产物 + REUSE-GUIDE 用法见其 README） |

- I/P/T/A 四套编号各自全局递增，永不复用、永不重排（rejected 也占号）；P/T 号取自 INDEX 顶部计数器，I 号取自 INITIATIVE.md 顶部，A 号取自 amendments/README.md 顶部，取号后立即递增写回。
- 日期唯一源：`date +%F` 实取（本地时区，YYYY-MM-DD），禁止凭记忆或上下文推断。
- 本地文件不入库：`*.local.*` 后缀文件被 .gitignore 忽略。
