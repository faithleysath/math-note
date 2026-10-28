# 任务书：拆分多结论命题（v9，不改 Schema）

> 执行者：子代理。**禁止创建子代理。** 只在你负责的册内改节点与边；不改 Schema、不改 expected 条目数。
> 输入：`audit/semantic-kinds.json` 的 `multiConclusion`（判 `multi` 的 32 条；`p068-08` 已拆，跳过）。

## 为什么要拆

一条 `proposition` 的 content 里装了两个及以上可独立引用/考查的结论，标题只覆盖其中一个。结果是：
- `covers` 不知道考的是哪一条；
- `supports`/`depends-on`/`uses` 挂在一个「大命题」上；
- 读者看到一条命题，实际是两三条。

拆分不是改标题，是**把一条命题变成几条独立命题，并把边按语义重新落位**。

## 拆分规则

1. **原节点保留第一条结论**（通常是标题对应的那条），content 只留该结论的原文。
2. 新节点 id：在原 id 基础上加下一个未占用的 `@n`。
   - 原 id 无 `@n`：用 `@1`、`@2`…；
   - 原 id 已是 `@1`/`@2`/`@3`：用下一个未占用的 `@n`（不能出现 `@1@1`）。
   - 新节点必须带 `tags: ["src:<原 id 去掉 @n>"]`（保留原节点其它 tags，去重）；原节点也保留/补 `src:<base>`。
3. **节点数组位置**：新节点紧跟在原节点之后，`parentId`、`citation` 与原节点相同；part 没有 order 字段，合并按数组顺序生成 order。
4. **内容逐字**：从原 content 切句，不改写、不润色；标点、单位、公式保留。拆完把各节点 content 按原顺序拼起来，应与原 content 只差标题/空白。
5. **类型/kind**：按 `semantic-kinds.json` 的 `split` 建议；没有明确建议时沿用原 type/kind（claim 拆 claim，explanation 拆 note/explanation）。
6. **边重落位**（本任务最重）：
   - 逐条看原节点上的入边/出边，按边 `note` 和原句语义分配到具体结论；
   - 一条边只支持/依赖其中一条时，改到该节点；
   - 题目同时考多条时，`covers` 分别连（可新增边）；
   - 实验同时支持多条时，`supports` 分别连（可新增边）；
   - 无法判断的边保留在原节点，并在报告里列出，不要删。
7. `key`/`aliases` 留在最贴近术语的节点；没有 key 的命题不用造。
8. 不新增 `srcId`；不改 `expected` 条目数；不碰别册。

## 每册要拆的

- b8a：`p009-05`、`p055-07@1`、`p073-03`、`p101-08@1`、`p106-08`、`p124-07`、`p124-08`（`p068-08` 已拆，跳过）
- b8b：`p005-14`、`p009-03`、`p029-04`、`p060-10`、`p069-06`、`p075-05`、`p085-10`、`p086-12`、`p089-10`、`p101-07`、`p107-04`、`p111-02`
- b9a：`p012-02`、`p042-08`、`p047-04@2`、`p084-09@1`、`p086-02`
- b9b：`p014-08`、`p018-07@1`、`p020-05@2`、`p020-05@3`、`p033-01`、`p039-02@2`、`p080-01@3`

具体拆法见 `audit/semantic-kinds.json` 每个 multi 记录的 `split` 字段（标题 + 分句 + 边怎么跟）。

## 回归

```bash
bun run check:part <改过的 part> --expected <同名清单>
bun run check:expected <改过的清单>
bun run merge:parts --parts local-textbook/sukey/parts-all --book local-textbook/sukey/book.json --out /tmp/probe-splits.json --page-offset 7
```

- 合并前 `cp parts/*.json parts-all/`。
- 报告节点/边/资源计数；孤立 definition/proposition 必须 0；depends-on 无环；端点 0 违规。
- 边数会因拆分/补边变化，属预期；报告每册变化。

## 输出

`audit/split-multi-<册>.md`：逐条「原节点 → 新节点 + 内容切分 + 边改指/新增/保留」；计数；回归；未决边清单。
