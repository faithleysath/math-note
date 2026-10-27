# PM 看板：苏科版物理四册 → v9 图谱（已完成）

> 最终状态，2026-10-27 夜。主代理维护；子代理一律 `pi/deepseek/deepseek-flash` + thinking `max`。
> 上位文档：`docs/plans/handoff.md` §13、`docs/plans/transcribe-spec.md`、`docs/plans/audit-b9-task.md`。

## 结果

| 项 | 值 |
|---|---|
| 37 份 part / 清单 | `check:part` 全 0 错误；`check:expected` 0 错 0 警；`check:consistent` 0/0 |
| 四册合并 | **2087 节点 / 1470 边 / 818 资源 / 818 anchors / warnings 0** |
| 不变式 | 孤立 def/prop 0；depends-on 无环；无自环；无悬空端点 |
| 资源 | 818/818 存在且 sha256 对齐；`crop:figures` 0 裁剪 / 818 跳过 |
| 结构覆盖率 | 3584/3584（mapped 3582 + exception 2；missing/dup/undecided 0） |
| 视觉复核 | 19/19 章 fully-reviewed；九上 106 页 + 九下 110 页逐页有记录 |
| 实体注册表 | 229 条 live 版，与 229 个带 key 节点一一对应 |

## 交付

- `~/Downloads/苏科版物理-全四册/`：`all.json`（2087/1470/818）+ 818 张图 + coverage + 两份 exceptions。
- `~/Downloads/苏科版物理-八上八下/`：已重出，`all.json` 1178/773/458 + 458 张图。
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
