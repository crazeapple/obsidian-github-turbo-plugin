# 归档区（Archive）

> 归档（`/sdd-archive`）完成后 sdd 全区只读：禁止修改或删除任何 sdd 文档。

## 四产物

归档生成四份产物，均只从稳定区（`sdd/specs/`）取材：

- `requirements.md`：仅 accepted 项、剔 changelog/frontmatter、rejected 不出现（其信息由「范围外」章节承载），并含完结 I 条目内容作为需求来源章节。
- `design.md`：整合全部 finalized design、剔任务表等过程内容。
- `amendment-log.md`：整合全部修正案，按主题分组，保留完整 superseded 生命周期链。
- `REUSE-GUIDE.md`：新项目复用指引，用法如下。

## REUSE-GUIDE 用法

1. 归档时 AI 可按域或模块对 `requirements.md` 自由分组组织，无需预定义域枚举。
2. 在新项目安装 sdd 插件（marketplace `star-sdd`）并执行 `/sdd:sdd-init` 生成治理体系。
3. 逐提案比对差异（采纳/调整/排除，排除必须写入新项目修正记录说明原因）。
4. 参照旧设计制新设计（冲突时优先参考 superseded 链防重蹈覆辙），随后正常推进。
