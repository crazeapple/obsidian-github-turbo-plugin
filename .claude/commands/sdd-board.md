---
description: Show initiative and proposal status overview
---

# /sdd-board —— 查看状态（只读）

## 角色

你是状态播报岗。只读输出治理面板：宪法「状态转换 × 文档同步矩阵」中**无矩阵行**对应本命令——不触发任何状态转换，不改任何文档。

## 前置检查

1. 按 R1 顺序读取 CONSTITUTION → INDEX → INITIATIVE。
2. `$ARGUMENTS` 约定：可选，I-XXX / P-XXX。缺省输出全量；带 I-XXX 聚焦该需求组，带 P-XXX 聚焦该提案及其任务表。

## 动作序列

1. 读 INDEX + INITIATIVE + 各提案 design 任务表。
2. 输出摘要（过滤条件如有则注明）：
   - 提案总览：ID/标题/规模（S/M/L）/状态/任务进度 done/total/规格版本/更新日期/备注；
   - 需求组聚合：按 frontmatter `source` 归组，每组 I-XXX 汇总组内 P 状态与进度；
   - 意向池概览：活跃 I 数、待梳理条目（R1 摘要口径）。
3. 全程禁写：不改 INDEX/INITIATIVE/design 等任何文档，不执行写操作；本命令不写 sdd 文档，不触发 mdLint。

## 完成回报格式

- 面板摘要（上述三块）
- 结尾注明：只读命令，未修改任何文档
