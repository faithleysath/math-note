# 任务书：三个 CLI 脚本（校验 / 合并 / 覆盖率报告）

> 执行者：子代理。**禁止创建子代理。**
> 依赖已就绪：`src/lib/book-part.ts`（`validateBookPart`、`coverageOf`、`mergeBookParts`、`BookPartSchema`、`idFamilyOf`）。
> 上位规范：`docs/plans/transcribe-spec.md` §0.1、§0.3、§12。

## 目标

把已经写好的库函数接成能跑的命令行工具，让「分章 JSON → 校验 → 合并 → 覆盖率」这条流水线真能执行。

## 1. `scripts/check-book-part.ts`

```bash
bun run scripts/check-book-part.ts <part.json> [<part2.json> ...] [--expected <expected.json>] [--json]
```

行为：

- 逐个读取 part 文件，`BookPartSchema.parse` → `validateBookPart(part, expected)`
- 输出人读格式：按 `error` / `warning` 分组，每条带 `code`、`message`，以及第几个文件
- 传了 `--expected` 时，额外输出覆盖率一行：
  `结构覆盖率 18/20 (90%) · mapped 17 · exception 1 · missing 2 · duplicate 0 · undecided 0`
- `missing` 的 srcId 逐个列出
- **退出码**：有任何 error → `1`；只有 warning 或无问题 → `0`
- `--json` 时输出机器可读结构（`{ files: [{ path, issues }], coverage? }`），退出码规则不变

禁止在脚本里重写校验逻辑，全部调库函数。

## 2. `scripts/merge-book-parts.ts`

```bash
bun run scripts/merge-book-parts.ts --parts <目录> --book <book.json> --out <out.json> [--entities <entities.json>] [--page-offset <n>]
```

行为：

1. 读目录下所有 `*.json`（跳过 `*.report.*`），按文件名排序后 `BookPartSchema.parse`
2. **先对每个 part 跑 `validateBookPart`，任何一个有 error 就整体拒绝合并**，打印原因，退出码 `1`
3. `mergeBookParts(parts, book, { entities, pageOffset })`
4. 产物再跑一次 `validateGraphInvariants`，不过就不写文件
5. 写 `--out`（格式化 JSON，2 空格缩进）
6. 若传了 `--entities`，把更新后的注册表写回同一路径
7. 打印：part 数、节点数、边数、步骤数、anchors 数、assets 数、warnings

要求：**同一批输入重复执行，除 `exportedAt` 外输出完全一致**。脚本自身不许有随机性或当前时间以外的输入。

## 3. `scripts/report-book-coverage.ts`

```bash
bun run scripts/report-book-coverage.ts --parts <目录> --expected <目录> [--out <report.md>]
```

行为：

- 按 part 分组统计：`total / mapped / exception / missing / duplicate / undecided / 结构覆盖率`
- 输出 Markdown 表格，**两栏分开**（规约 §0.3 硬要求）：
  1. 结构覆盖率表（按章）
  2. 视觉复核状态表（按章）：读 `local-textbook/sukey/review/<vol>-<ch>.json`（若存在，字段 `status: 'unreviewed'|'spot-checked'|'fully-reviewed'`, `spots: string[]`），不存在则一律 `unreviewed`
- 末尾附汇总行：全书 `total`、`mapped + exception`、`missing` 总数、未复核章数
- 有 `missing` 时退出码 `1`，否则 `0`
- 加上 `--out` 则写文件，同时仍然打印到 stdout

## 4. `package.json` 增加脚本

```json
"check:part": "bun run scripts/check-book-part.ts",
"merge:parts": "bun run scripts/merge-book-parts.ts",
"report:coverage": "bun run scripts/report-book-coverage.ts"
```

## 5. 冒烟测试（必须真跑，贴输出）

在 `local-textbook/sukey/fixtures/` 下**自己造**三个最小 part（不要用真实教材内容），覆盖：

- `ok.json`：2 个节点 + 1 条边 + 1 个 asset（带 region）+ 1 条 exception，`srcId` 全覆盖
- `bad.json`：`proposition` 挂在 `note` 下、带越权 `order` 字段、`asset://` 引用不存在的资源
- `expected.json`：3 条 `items`，其中 1 条在 `ok.json` 里缺失

然后跑：

```bash
bun run scripts/check-book-part.ts local-textbook/sukey/fixtures/ok.json --expected local-textbook/sukey/fixtures/expected.json   # 期望退出码 1（有一条 missing）
bun run scripts/check-book-part.ts local-textbook/sukey/fixtures/bad.json                                                          # 期望退出码 1，报出 3 类问题
bun run scripts/merge-book-parts.ts --parts local-textbook/sukey/fixtures --book <book.json> --out /tmp/merged.json                 # bad.json 存在时应拒绝合并
bun run scripts/report-book-coverage.ts --parts local-textbook/sukey/fixtures --expected local-textbook/sukey/fixtures
```

**把每条命令的实际输出贴进汇报**，包括退出码（用 `; echo "exit=$?"`）。

## 6. 自测

```bash
bun run test && bun run lint && bun run build
```

## 禁止

- 不改 `src/lib/**` 任何既有文件（只允许新增 `src/lib/cli-args.ts` 之类的小工具，若确实需要）
- 不新增依赖（不要 commander/yargs，参数解析自己写，用 `node:util` 的 `parseArgs` 可以）
- 不写渲染、PDF 相关代码
- 不创建子代理

## 汇报

三个脚本的参数面、退出码约定、冒烟测试的实际输出与退出码、以及任何与任务书不一致的地方。
