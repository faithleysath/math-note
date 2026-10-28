# 任务书：语义关系与类型清理（v9，不改 Schema）

> 执行者：子代理。**禁止创建子代理。** 只改节点 `type/kind`、正文、边的 `predicate/note`、以及本任务明确要求的拆分；不改 Schema，不改 7 种边类型集合。

## 依据

- `audit/semantic-supports.md/.json`：112 条 `supports` 全量判定
- `audit/semantic-depends-on.md/.json`：277 条 `depends-on` 全量判定
- `audit/semantic-kinds.md/.json`：176 个 `law/principle/phenomenon/model/experiment/exploration` + 120 个多结论候选
- `docs/plans/transcribe-spec.md` §4 / §7 / §7.0

## 本轮做什么

1. **supports 清理**：类比/模型/假设/反事实/设问不能当实验证据。改 `cites`；起点 kind 按需要改 `model` / `context` / `explanation`。真正的实验/观察证据保留。
2. **depends-on 收紧**：只保留「不先学 from 就难以理解/使用 to」；`contains`（包含要素）和 `mentions`（内容涉及/举例）改 `cites`；内容确实是前置的保留；目标节点混了多个结论的，按本任务拆分后再改指。
3. **kind 修正**：按 `semantic-kinds.json` 的建议改；`principle` 只留给教材命名的原理，`law` 只留给自然定律；讨论/调查/辩论/阅读/制作分别用 `note(explanation/method/process)`；类比/模型用 `note(model)`，反事实设问用 `note(context)`。
4. **只拆 p068-08**（凸/凹透镜两条结论）：新建 `@1`，`p076-07@1` 的 `depends-on` 改指 `@1`，`p076-08@1` 仍指凸透镜；活动 `p068-02` 若同时观察两种透镜，给 `@1` 补 `supports`。
5. **多结论拆分本轮不做**（32 条清单已存在），留给下一轮，避免一次改太多结构。

## 硬约束

- 改 kind 后检查边端点合法性；`supports` 起点只能是 `note(experiment|phenomenon)`，否则必须改 `cites`。
- 不新增 `srcId`；拆 p068 用 `@1` 并在 `tags` 保留 `src:phy-b8a-p068-08`。
- 每处改动要有页图/原文依据；不确定就保留并写报告。
- 不改 `covers` 语义、不拆 `covers`、不改 Schema。
- 不跑 `export:entities` / `pack:exchange`。

## 回归

- `check:expected` / `check:part`（改过的 part 带 expected）/ `check:consistent`
- 合并探针：节点数、边数、资源数、孤立 definition/proposition、depends-on 环
- 报告边数变化（本轮允许因 p068 拆分 + 少量补边而变化）

## 输出

`audit/fix-semantic-<组名>.md`：逐条「原判定 → 改前 → 改后 → 依据」；批量规则；回归汇总；未改/不确定项。
