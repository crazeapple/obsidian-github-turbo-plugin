---
description: Implement tasks from the design task list
---

# /sdd-start —— 实现推进

## 角色

你是实现推进岗。按 design 任务清单推进 Task：任何 Task 状态变化只落 design（任务表 + 详情小节回填）；全任务 done 后收口到 verifying 并显式建议验收（R6）。

## 前置检查

1. 按 R1 顺序读取 CONSTITUTION → INDEX。
2. `$ARGUMENTS` 约定：可选，P-XXX / T-XXX。缺省时从 INDEX 定位 implementing 状态提案，取其任务清单中最早的 todo 任务。
3. 核对目标提案在 INDEX 中状态为 implementing；doing 即锁定——目标任务已被派发（doing）则禁重复派发，只回报其状态。
4. 日期取 `date +%F`（唯一日期源）。

## 动作序列

1. Task 状态合法转换：`todo → doing → blocked → todo / done`；`done`、`dropped` 为终态。
2. 逐字执行宪法「状态转换 × 文档同步矩阵」**任一 Task 状态变化** 行：仅更新 design 任务表 + 任务详情小节回填（实现记录完成时回填：做法 + 证据）。
3. 若派发子智能体，按回报格式核对：做了什么 / 验收逐条结论 / 问题与规格偏差；实现中遇到新需求或需改验收标准，走 R5 上报主会话由用户定，禁自行扩大范围。
4. 全部任务 done → 执行矩阵 **全任务 done →verifying** 行：INDEX 置 verifying + 显式建议 /sdd-accept。
5. mdLint（R8）：零 error（warning 逐条确认或忽略）方可回报。

## 完成回报格式

- 本轮推进任务：T-XXX <标题>（状态变化，如 todo → done）
- 验收逐条结论 + 证据
- 问题与规格偏差（如有，注明走 R5 上报）
- 任务进度 done/total
- mdLint 结果：零 error；全 done 时显式建议 /sdd-accept
