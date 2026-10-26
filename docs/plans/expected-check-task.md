# 任务书：Pass 1 清单校验器（`validateExpectedManifest` + `check-expected.ts`）

> 执行者：子代理。**禁止创建子代理。**
> 上位规范：`docs/plans/transcribe-spec.md` §0.2、§3.1、§3.2。

## 问题

Pass 1 清单（`local-textbook/sukey/expected/*.json`）现在**没有任何仓库内的校验器**。
「region 合法」「overlaps 双向」「子框落在父框内」这些规则，目前只是枚举子代理自己临时写的检查脚本，
换个代理、换台机器就没了。清单是**覆盖率的分母**，它没被校验，整条流水线就没有地基。

## 1. `src/lib/book-part.ts` 追加（只加不改）

```ts
export interface ExpectedManifestIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  srcId?: string;
  path?: string;
}

/** Pass 1 清单校验：不抛错、不改入参 */
export function validateExpectedManifest(manifest: unknown): ExpectedManifestIssue[];
```

规则（逐条实现，`code` 用下面的名字）：

| code | 级别 | 检查 |
|---|---|---|
| `manifest-shape` | error | 顶层必须有 `items` 数组；`volume`/`chapter` 若存在必须是非空字符串 |
| `item-shape` | error | 每条必须有非空 `srcId`、合法 `kind`、数字 `pdfPage`；缺 `region` 与 `regionOmittedReason` 两者 → error |
| `item-region-both` | error | `region` 与 `regionOmittedReason` 同时存在 |
| `item-region-invalid` | error | 调 `regionProblem(region)`，返回非 null 即报，把原因拼进 message |
| `srcid-duplicate` | error | `srcId` 全局唯一 |
| `srcid-format` | warning | 不符合 `phy-<册>-p<3-4位数字>-<2位数字>` |
| `srcid-order` | warning | 同一 `pdfPage` 内序号应从 01 起连续；断号或乱序给出提示（允许，但要可见） |
| `pdfpage-out-of-range` | error | `pdfPage` 不在 `pdfPageRange` 内（清单有这个字段时才算） |
| `parent-missing` | error | `parentSrcId` 指向的条目不在清单里 |
| `parent-not-contained` | error | 子 `region` 未完全落在父 `region` 内（容差 `REGION_EPS`） |
| `parent-cross-page` | error | 父条目有 `extraRegions`（跨页）却仍被子条目引用 → 子条目应 `parentSrcId: null` |
| `overlaps-asymmetric` | error | A 声明了 B，但 B 没声明 A |
| `overlaps-phantom` | error | 声明了相交，实际两个 region 不相交 |
| `overlaps-is-containment` | warning | 声明了 `overlaps` 但实际是包含关系（应该用 `parentSrcId`） |
| `overlap-undeclared` | error | 两个条目（非父子）region 部分相交却没写 `overlaps` |
| `extraregions-invalid` | error | `extraRegions[]` 的 `region` 非法或 `pdfPage` 缺失 |
| `continueson-bad` | warning | `continuesOn` 不是 `pdfPage + 1` 时提示人工确认 |

注意：

- 判断「部分相交」用严格相交面积 > 0 且两者互不包含
- 同一页内两两比对即可，不要跨页比（跨页的 bbox 不在同一坐标系）
- 报错信息一律**中文 + 可操作**，例如「phy-b8a-p017-04 的 region 未落在父条目 phy-b8a-p016-01 内」

## 2. 新建 `scripts/check-expected.ts`

```bash
bun run scripts/check-expected.ts <expected.json> [<expected2.json> ...] [--json] [--stats]
```

- 逐个文件跑 `validateExpectedManifest`
- 输出：按 `error`/`warning` 分组的条目，带 `code` 与 `srcId`
- `--stats` 额外打印：总条目、按 kind 分布、按页分布（页号:条数）、有 region 数 / 只有 regionOmittedReason 数、overlaps 对数、parentSrcId 对数
- **退出码**：有 error → 1；只有 warning 或无问题 → 0；读文件/参数错误 → 2
- `--json` 输出机器可读结构

`package.json` 加 `"check:expected": "bun run scripts/check-expected.ts"`。

## 3. 测试 `src/lib/book-part.test.ts` 追加（或新建 `expected-manifest.test.ts`）

每条规则至少一个用例：合法清单 → 0 issue；`region` 越界；`region` 与 `regionOmittedReason` 并存；
`srcId` 重复；子框超出父框；跨页父框仍被引用；`overlaps` 单向；声明相交但实际不相交；
实际相交但未声明；`extraRegions` 非法。断言 `code` 与 `severity`，不要只断言「有错」。

## 4. 冒烟（必须真跑，贴输出）

```bash
bun run scripts/check-expected.ts local-textbook/sukey/expected/b8a-c01-p018-025.json --stats; echo "exit=$?"
bun run scripts/check-expected.ts local-textbook/sukey/expected/b8a-c01-p026-041.json --stats; echo "exit=$?"
```

**这两份是真实清单，必须 exit=0**（允许 warning，但要贴出来，看是不是真有断号之类）。
如果有 error，先报告给我，不要为了过而放宽规则。

## 5. 自测

```bash
bun run test && bun run lint && bun run build
```

## 禁止

- 不新增依赖
- 不改 `__existing__` 的 `validateBookPart` / `coverageOf` / `mergeBookParts` 行为（只加新导出）
- 不改清单文件本身
- 不创建子代理

## 汇报

导出清单、两份真实清单的 exit 码与告警内容、测试数量、有没有发现真问题。
