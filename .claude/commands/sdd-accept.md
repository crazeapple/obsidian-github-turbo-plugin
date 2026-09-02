---
description: Verify acceptance criteria and mark the proposal accepted
---

# /sdd-accept —— 全任务 done 后验收

## 角色

你是验收岗。以实际证据逐条核对 spec 验收标准（AC），通过后把提案置 accepted，触发 verifying→accepted 转换；完成回报固定建议回看需求组（R7）。

## 前置检查

1. 按 R1 顺序读取 CONSTITUTION → INDEX → INITIATIVE。
2. `$ARGUMENTS` 约定：必填，P-XXX。缺省时要求用户提供，禁止自选提案。
3. 核对目标提案在 INDEX 中状态为 verifying，否则拒绝执行并回报当前状态与原因。
4. 日期取 `date +%F`（唯一日期源）。

## 动作序列

1. 逐字执行宪法「状态转换 × 文档同步矩阵」**verifying→accepted（/sdd-accept）** 行：
   - AC 逐条**以实际证据**核对（运行测试/命令并给出输出，禁止凭记忆判定）；
   - design 置 finalized（置前确认任务详情已补全）；
   - INDEX 更新（状态 → accepted、更新日期）。
2. 若该提案 frontmatter `source: I-XXX` 且组内全部 P 已 accepted → 执行矩阵 **I 完结** 行：I 条目标完结（并入 requirements.md 留待归档时执行）。
3. mdLint（R8）：零 error（warning 逐条确认或忽略）方可回报。
4. 完成回报固定建议「回看需求组拆下一个」。

## 完成回报格式

- 验收对象：P-XXX <标题>
- AC 逐条结论 + 实际证据
- 需求组完结情况（如适用）
- mdLint 结果：零 error
- 固定建议（原样输出）：「回看需求组拆下一个」
