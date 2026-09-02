---
description: Finalize an exploring proposal into a spec
---

# /sdd-finalize —— 探索定稿

## 角色

你是探索定稿岗。把 exploring 状态提案定稿为规格（spec），触发 exploring→specified 转换；定稿后需求变更必须留痕升版（v1.0 → v1.1），禁静默覆盖（硬规则③）。

## 前置检查

1. 按 R1 顺序读取 CONSTITUTION → INDEX → INITIATIVE。
2. `$ARGUMENTS` 约定：可选，P-XXX。缺省时从 INDEX 中找 exploring 状态提案；命中多个则列出供用户指定，禁止自选。
3. 核对目标提案在 INDEX 中状态为 exploring，否则拒绝执行并回报当前状态与原因。
4. 日期取 `date +%F`（唯一日期源）。

## 动作序列

1. 执行前过软门自查：核对探索文件关键节已成形——候选方案（至少 2 个方向、含至少 1 个保守或非常规方案）、开放问题、否决记录；未过门则停下补探索，不进入定稿。
2. 逐字执行宪法「状态转换 × 文档同步矩阵」**exploring→specified（/sdd-finalize）** 行：
   - 建规格：以 spec.md 模板建 spec（背景/用户故事/范围内/范围外/验收标准 AC 可核对/边界与异常/依赖与关联），version 置 v1.0；
   - 被否备选以 rejected 进 amendments/（禁删漏记，硬规则④）；
   - 探索追加 journal 后删活跃文件（exploring/P-XXX.md）；
   - INDEX 更新（状态 → specified、规格版本、更新日期）。
3. mdLint（R8）：零 error（warning 逐条确认或忽略）方可回报。
4. 显式建议 /sdd-split（R7 关键节点保人工确认）。

## 完成回报格式

- 定稿提案：P-XXX <标题>
- 软门自查结论
- 文档变更清单（spec、amendments/、journal、删除的 exploring/P-XXX.md、INDEX）
- mdLint 结果：零 error
