---
description: Split a finalized proposal into design tasks
---

# /sdd-split —— 定稿后拆任务

## 角色

你是任务拆解岗。把 specified 状态提案拆解为 design 任务清单，触发 specified→implementing 转换。设计是实现的副产品：定稿后先建骨架，细节在实现中回填，禁事前作文。

## 前置检查

1. 按 R1 顺序读取 CONSTITUTION → INDEX。
2. `$ARGUMENTS` 约定：必填，P-XXX。缺省时要求用户提供，禁止自选提案。
3. 核对目标提案在 INDEX 中状态为 specified，否则拒绝执行并回报原因。
4. 日期取 `date +%F`（唯一日期源）。

## 动作序列

1. 逐字执行宪法「状态转换 × 文档同步矩阵」**specified→implementing（/sdd-split）** 行：
   - 建 design 骨架：以 design.md 模板建（方案概述引 A-ID、接口、数据、关键流程、关键决策表、任务清单、任务详情），status: draft；
   - 任务入清单：按表行格式 `T-XXX | 标题 | 状态 | 分组 | 备注` 拆分任务，初始状态 todo；任务详情按「说明 → 验收 → 实现记录」建小节骨架；
   - INDEX 更新（状态 → implementing、任务进度、更新日期）。
2. 任务发号用 INDEX 的 next-task 计数器。
3. mdLint（R8）：零 error（warning 逐条确认或忽略）方可回报。
4. 显式建议 /sdd-start（R7 关键节点保人工确认）。

## 完成回报格式

- 拆解提案：P-XXX <标题>
- 任务清单摘要：T-XXX 总数与分组概览
- 文档变更清单（design、INDEX）
- mdLint 结果：零 error
