# 任务书：v9 资源落地闭环（导入保留 + 本地图片载入 + 渲染）

> 前置：`docs/plans/v9-media.md` 已完成（v9 schema / 迁移 / Dexie v2 / `asset://` 渲染插件）。
> 执行者：子代理。**禁止创建子代理。**

## 问题

现在 v9 JSON 能带 `assets` 元信息，但：

1. `useGraphStore.importGraph` 把 `parsed.assets` 丢了，导入一本带图的教材后资源元信息直接消失
2. 没有任何途径把图片二进制塞进 IndexedDB，所以 `asset://` 永远走「缺失」分支
3. 没有缺失提示样式，「缺图」和「图裂」在界面上分不出来

本期把这三件事补齐，让「导入 v9 JSON → 载入图片文件夹 → 图片正常显示」这条路真能走通。

## 1. `src/lib/db.ts`

- `AssetRecord` 的 `data` 改成可选：`export type AssetRecord = AssetMeta & { data?: Blob }`
  理由：JSON 导入后只有元信息没有二进制，这是真实状态，必须能表达，不能塞空 Blob 假装有。
- `replaceAll` 的 `assets?: AssetRecord[]` 保持，但要能在没有 blob 时正常写入
- 新增 `putAssetBinaries(items: { id: string; data: Blob }[])`：只更新已有行的 blob，行不存在就报错（不要静默新建）
- 新增 `assetsWithoutBinary(): Promise<string[]>`：返回有元信息但没 blob 的 asset id
- `getAssetBlob` 保持不变

## 2. `src/stores/useGraphStore.ts`

- `importGraph`：把 `parsed.assets` 一并交给 `db.replaceAll`（只有元信息，没有 blob）
- state 增加 `assetCount: number`、`missingAssetIds: string[]`
- `init` / `importGraph` / `clearAll` 之后，把有 blob 的资源全部 `createObjectURL` 并调用 `registerAssetUrl(id, url)`；
  替换教材或清空时先 `releaseAssetUrls()`，避免 Blob URL 泄漏
- 新增 action：`loadAssetFiles(files: File[]): Promise<{ matched: number; badHash: string[]; unknown: string[] }>`
  - 按文件名匹配：优先 `originalName`，其次 `path` 的 basename
  - 用 `crypto.subtle.digest('SHA-256', ...)` 算哈希，与 `assets[].sha256` 比对
  - 不符 → 不写入，进 `badHash`；匹配不到任何 asset → 进 `unknown`
  - 写入成功后立刻 `createObjectURL` + `registerAssetUrl`，并更新 `missingAssetIds`
  - 单个文件超过 `MAX_ASSET_BYTES` → 跳过并计入 `badHash` 之外的 `tooLarge`（或复用 badHash，自己定，写清楚注释）

## 3. UI（最小必要，别设计新页面）

- 在左侧教材信息区（`src/components/layout/LeftSidebar.tsx`）加一行状态 + 一个按钮：
  - 状态：`资源 24 张 · 缺 3 张` / `无本地资源`
  - 按钮：`载入图片…`，用隐藏的 `<input type="file" multiple accept="image/*">`（不要用 `webkitdirectory`，用户直接全选文件更稳）
  - 全选文件后调 `loadAssetFiles`
  - 结果用现有 `sonner` 的 toast 报：`24 张全部匹配` / `2 张哈希不符：x.png, y.png` / `1 个文件不属于本书`
- 缺失提示样式：在全局样式里给 `.asset-missing` 一个可见的占位外观（虚线框 + “图片缺失”），不要只留一个空 img

## 4. 测试

新增 `src/lib/assets-flow.test.ts`（用 `fake-indexeddb/auto`，参考 `src/lib/persistence.test.ts`）：

- 导入一份带 2 个 assets 元信息的 v9 JSON → `assets` 表有 2 行、`assetsWithoutBinary()` 返回 2 个 id
- `putAssetBinaries` 写入后 → `getAssetBlob` 能取到、`assetsWithoutBinary()` 为空
- 对不存在的 id 调 `putAssetBinaries` → 抛错
- 哈希比对：正确文件通过、篡改一个字节后 `badHash` 命中

`src/lib/markdown.test.ts` 补两条：
- 登记了 URL 的 `asset://id` 会被替换成该 URL
- 没登记的被置空并带 `dataMissingAsset`

## 验收（自己跑，贴结果）

```bash
bun run test && bun run lint && bun run build && bun run check:examples
```

## 禁止

- 不改库名，不动 v8 语义
- 不做 `.tbg` ZIP、不做 `SourceAnchor` 读写
- 不新增依赖
- 不重新设计侧栏布局，只加一行状态 + 一个按钮
- 不创建子代理
