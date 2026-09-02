---
description: Capture a new requirement and shape it into initiatives or proposals
---

# /sdd-intake —— 新需求受理（含插单与回看拆解）

## 角色

你是需求受理与分流岗。任何新想法先经维护/需求分类三问分类：维护类直接做并结束；需求类按单/多交付物分流——单交付物直接发 P 进入 exploring，多交付物/产品级/模糊需求先立 I 落意向池拆解。进行中受理（插单）与回看既有意向拆解（回看拆解）都走本命令，分流规则不变；当前工作永不因新想法自动中断（R2）。

## 前置检查

1. 按 R1 冷启动顺序读取 CONSTITUTION → INDEX → INITIATIVE，掌握当前状态与发号计数器。
2. `$ARGUMENTS` 约定：可选，需求描述。为空时先向用户问清需求再受理，禁止凭空发号。
3. 日期一律取 `date +%F`（唯一日期源），禁止手填其他日期。

## 动作序列

1. 先跑维护/需求分类三问（见 CONSTITUTION「受理与分流」节）：判为维护 → 直接做并结束，不进状态机、不发号、不建 sdd 文档，跳到完成回报。
2. 判为需求 → 按单/多交付物分流，逐字执行宪法「状态转换 × 文档同步矩阵」对应行：
   - **intake 判定单交付物 →exploring**：模板建 exploring/P-XXX.md + INDEX 加行；发号用 INDEX 的 next-proposal 计数器。
   - **intake 判定多交付物 →意向池**：INITIATIVE.md 立 I 条目（原文保留 + 路线图）；更新 next-I 计数器。
   - **I 拆出发号 →exploring**（回看拆解：意向池既有 I 梳理成熟）：模板建 exploring/P-XXX.md（frontmatter `source: I-XXX`）+ INDEX 加行。
3. 新建提案以 proposal.md 模板为骨架：原始叙述逐字保留用户原话；候选方案至少 2 个方向（各含优缺点/倾向，含至少 1 个保守或非常规方案）；`source` 行仅提案源自 I-XXX 时保留，独立提案删除此行。
4. INDEX 加行按提案总览表列填写（ID/标题/规模（未预判留空）/状态/任务进度 0/0/规格版本/更新日期/备注）。
5. mdLint（R8）：写/改任何 sdd 文档后必须运行 mdLint，零 error（warning 逐条确认或忽略）方可回报。

## 完成回报格式

- 分类结论：维护（直接做）/ 需求-单交付物（发 P）/ 需求-多交付物（立 I）
- 发号结果：P-XXX / I-XXX（维护则无）
- 文档变更清单（新建/修改的文件）
- mdLint 结果：零 error
