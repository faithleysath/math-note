# PM 看板：苏科版物理四册 → v9 图谱（已完成）

> 最终状态，2026-10-27 夜。主代理维护；子代理一律 `pi/deepseek/deepseek-flash` + thinking `max`。
> 上位文档：`docs/plans/handoff.md` §13、`docs/plans/transcribe-spec.md`、`docs/plans/audit-b9-task.md`。

## 结果

| 项 | 值 |
|---|---|
| 37 份 part / 清单 | `check:part` 全 0 错误；`check:expected` 0 错 0 警；`check:consistent` 0/0 |
| 四册合并 | **2084 节点 / 1470 边 / 818 资源 / 818 anchors / warnings 0** |
| 不变式 | 孤立 def/prop 0；depends-on 无环；无自环；无悬空端点 |
| 资源 | 818/818 存在且 sha256 对齐；`crop:figures` 0 裁剪 / 818 跳过 |
| 结构覆盖率 | 3584/3584（mapped 3582 + exception 2；missing/dup/undecided 0） |
| 视觉复核 | 19/19 章 fully-reviewed；九上 106 页 + 九下 110 页逐页有记录 |
| 实体注册表 | 229 条 live 版，与 229 个带 key 节点一一对应 |

## 交付

- `~/Downloads/苏科版物理-全四册/`：`all.json`（2084/1470/818）+ 818 张图 + coverage + 两份 exceptions。
- `~/Downloads/苏科版物理-八上八下/`：已重出，`all.json` 1175/773/458 + 458 张图。
- 界面验证（ego-browser，space 101 `math-note 教材图谱验收`）：导入成功；818/818 图片 sha256 命中；图 16-32 完整、`figcaption` 只一次；栏目不再自动编号。

## 复核与修复

| 章 | 页 | 缺陷 | 处置 |
|---|---|---|---|
| b9a-c11 | 28 | 7 | 5 修好，2 误报/可接受 |
| b9a-c12 | 26 | 3 | 3 修好 |
| b9a-c13 | 28 | 9 | 8 修好，1 结构性限制（图 13-12） |
| b9a-c14 | 24 | 1 | 1 修好 |
| b9b-c15 | 28 | 17 | 12 修好，5 误报（p027 叠加图框线） |
| b9b-c16 | 34 | 1 | 图 16-50 源缺图，alt + 例外 |
| b9b-c17 | 22 | 1 | 1 修好 |
| b9b-c18 | 26 | 0 | — |

独立验证：b9a 15 真修好 / 1 半修 / 0 修坏 / 2 误报 / 2 政策；b9b c15/c17 13 真修好 / 5 误报 / 0 返工；c16 34/34 页，只剩源缺图。

## 关键决策 / 坑

1. 复核统一读 `merged/4vol.json`，不用 `/tmp/merged-4vol.json`、不用 `all-4vol-preview.json`。
2. `entities.json` 用 merge 维护的 **229 条 live 版**；不要跑 `export:entities`（只收 definition，会丢 21 条非 definition key）。
3. 复核 JSON 必须带 `status`/`spots`，否则 `report:coverage` 按 unreviewed 计。
4. 改 region 后必须重画叠加图（`draw:nodes`）再复核/验证。
5. 清单 region ↔ part 资产只认 `srcId→node→assets[].nodeId`；同页多图按 srcId 顺序，不按 y。
6. 叠加图框线画在框内 4px + 标签会盖字，判「切字」必须回原页量像素（b9b c15 有 5 条误报）。
7. 父代理归档会杀子代理（19:57 踩过一次）；完成即归档。
8. 最终元数据批次补齐了 40 个 topic 栏目的 `originalNumber`；「跨学科实践」subsection 仍由 UI 自动编号（全库一致）。

## 已知不阻断项

- 源缺图：图 16-50、18-5、12-32（保留 asset/图号，alt 写实）。
- 图 13-12 (b) 玻璃顶切 15px；图 16-28(a)/(b) 未合并（清单冻结）。
- c16 的 25 处文本 bbox 偏差、`p012-fig02` 左缘 1px 等，不影响交付图。

## 第二轮复审（交付后补做）

- `audit/reaudit-b9a.md`：26 处语义改动 24 真修好 / 2 半修 / 0 修错；新发现半导体假定义、4 对重复、6 条边引文错位等 16 条。
- `audit/reaudit-b9b.md`：点名项全部落地，0 高/中语义错误；1 中（`@n` 缺 `src:` tag，85 个已补）+ 4 轻 + 9 极轻。
- `audit/audit-4vol-graph.md`：30 项机械检查 24 全绿；抽样 26/30 节点、29/31 边成立。
- 修复 + 独立验证：`audit/fix-b8-content.md`、`fix-b9-content.md`、`verify-content-fixes.md`；b8 5/5、b9 11 条落地，1 条 c16 例外文本返工已修。
- 最终图 **2084 / 1470 / 818**；b8 1175 / 773 / 458。

## 已知不阻断项（补充）

- 4 个未登记 key（晶体/熔点/运动的相对性/物重）、跨学科实践 12 处口径、`活动 9.7` 双节点、原子/电子 ID 页码、6 个定义不纯、2 张表挂在命题/说明、气泡插画重复。

## 交换包 `.tbg`（2026-10-28）

- 规范 `docs/EXCHANGE-FORMAT.md`；ZIP = manifest + graph.json + assets + 可选 documents。
- 应用导出直接出 `.tbg`；导入兼容 `.tbg` / 旧 `.json`；逐张校验 sha256，失败整包拒绝。
- CLI `bun run pack:exchange`；已产出全四册 153.8 MiB、八上八下 96.3 MiB。
- 线上 `pi.laysath.cn` 实测 `.tbg` 导入 3.1 s、818/818 图命中。

## 节点完整度全量审计（2026-10-28）

- 19 章 / 488 页 / 818 资源逐页逐图，不查边；**88 条缺陷**（无 high，10 medium，78 low）。
- 修复 A–G + 返工；验证 AB/CDE/FG/rework；**0 条必须返工**，边 1470 未动，2084/818 不变。
- 代表修复：信息快递栏目名、图 2-26/2-27 边界、4-33 冰凌、6-8 氢/氮、6-27 车筐、15-21 接地插片、17-18/17-24/18-8 alt、12-36 导图层级、4-42 1px 虚线。
- 已知结构/源缺陷：13-12 泡顶、11-31 手部、6-14 量筒口、10-32 顶弧、9-4 手顶、4-23 电源线；16-50/18-5/12-32 源缺图；b8b-c07 p045-03 61px 既有漂移。
- 交付重打：全四册 `.tbg` 153.9 MiB、八上八下 96.4 MiB；线上导入 2.0 s / 818 命中。

## 语义质量清理（2026-10-28）

- 全量审 depends-on 277 / supports 112 / kind 176 / 多结论 120；不改 Schema。
- supports 112→100、depends-on 277→253、kind 19 处、p068-08 拆分；最终 **2085 / 1473 / 818**。
- 32 条多结论拆分留待下一轮；`illustrates` 未新增。
- 验证 b8a/b8b/b9/rework 四份全绿。
