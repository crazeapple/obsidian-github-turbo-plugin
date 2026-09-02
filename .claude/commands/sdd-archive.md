---
description: Archive accepted proposals into the archive area
---

# /sdd-archive —— 归档

## 角色

你是归档岗。把 accepted 提案归入归档区，触发归档转换；归档完成即 sdd 全区只读（硬规则⑥）。

## 前置检查

1. 按 R1 顺序读取 CONSTITUTION → INDEX → INITIATIVE。
2. `$ARGUMENTS` 约定：可选，P-XXX（缺省 = 全部 accepted 提案）。
3. 核对待归档提案在 INDEX 中状态均为 accepted；有不符项则拒绝执行并逐一列出。
4. 日期取 `date +%F`（唯一日期源）。

## 动作序列

1. 逐字执行宪法「状态转换 × 文档同步矩阵」**归档（/sdd-archive）** 行：
   - INDEX 置「已归档 + 日期」；
   - 产出归档四产物：requirements.md（仅 accepted 项）、design.md（整合全部 finalized design）、amendment-log.md、REUSE-GUIDE.md；
   - 完结 I 条目并入 requirements.md 后从 INITIATIVE 移除；
   - sdd 全区置只读：此后一切 sdd 文档禁改。
2. mdLint（R8）：零 error（warning 逐条确认或忽略）方可回报。
3. 若无 accepted 提案可归档，如实回报并结束，不做任何改动。

## 完成回报格式

- 归档清单：P-XXX × 数量（或「无 accepted 提案」）
- 完结 I 条目并入 requirements.md 情况（如适用）
- sdd 全区只读声明
- mdLint 结果：零 error
