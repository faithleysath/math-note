# 教材交换包 `.tbg`（v1）

一个 `.tbg` 就是一个 ZIP：把 **v9 图** 和它引用的**所有图片**放在一个文件里。导入/导出只需要这一个文件，不再分别传 JSON 和图片。

- 扩展名：`.tbg`
- MIME：`application/x-textbook-graph`
- 容器格式版本：`formatVersion = 1`
- 数据格式版本：`graph.json` 的 `schemaVersion = 9`
- 上限：512 MiB / 包；单张图片仍受 8 MiB 上限约束

## 目录结构

```text
manifest.json           # 格式元信息（必须）
graph.json              # v9 GraphJSON（assets[] 只有元信息，不含二进制）
assets/<册>/<id>.png    # graph.assets[].path 指向的实际文件（必须齐全）
documents/<name>.md     # 可选的人类可读文档（导入忽略）
```

`assets/` 不是固定前缀，实际路径完全由 `graph.assets[].path` 决定；只要满足包内相对路径规则（不能以 `/` 开头、不能有 `..`、不能有反斜杠），可以在任意子目录。

## manifest.json

```jsonc
{
  "format": "textbook-graph-exchange",
  "formatVersion": 1,
  "schemaVersion": 9,
  "createdAt": "2026-10-28T00:00:00.000Z",
  "generator": "textbook-graph",
  "graph": "graph.json",
  "book": {
    "title": "苏科版初中物理·全四册",
    "subject": "physics",
    "stage": "junior",
    "edition": "2024年第4版"
  },
  "counts": {
    "nodes": 2084,
    "edges": 1470,
    "assets": 818
  },
  "documents": ["documents/coverage.md", "documents/exceptions-b9a.md"]
}
```

- `format` / `formatVersion` / `schemaVersion` 三个字段都必须匹配，否则整包拒绝。
- `graph` 目前固定为 `graph.json`。
- `counts` 是给人看的摘要；导入以 `graph.json` 为准。
- `documents` 可选，导入时忽略，只用于随包携带覆盖率/例外说明。

## graph.json

就是应用导出的 v9 `GraphJSON`：

```jsonc
{
  "schemaVersion": 9,
  "exportedAt": 1793118134212,
  "book": { ... },
  "nodes": [ ... ],
  "edges": [ ... ],
  "steps": [],
  "anchors": [ ... ],
  "assets": [
    {
      "id": "phy-b8a-p002-fig01",
      "path": "assets/b8a/phy-b8a-p002-fig01.png",
      "mimeType": "image/png",
      "byteLength": 61946,
      "sha256": "cf9e…",
      "alt": "晚霞和彩虹",
      "caption": "图 0-1 晚霞和彩虹",
      "width": 1083,
      "height": 789
    }
  ]
}
```

图片二进制**不**进 `graph.json`；`assets[]` 只描述路径、大小、哈希、alt/图注/尺寸。

## 完整性

导入时逐张检查：

1. `graph.assets[].path` 在 ZIP 里存在；
2. 文件字节数等于 `byteLength`；
3. `sha256` 等于 `meta.sha256`（64 位小写 hex）；
4. 资源 id / 路径不重复，MIME 在白名单内（png / jpeg / webp）。

任何一张不满足就**整包失败，现有数据不动**。不做“导入图、缺图慢慢补”的半成品状态。

## 版本策略

- **容器结构**变了（目录、manifest 字段）→ 升 `formatVersion`。
- **图数据字段**变了（节点/边/资源 schema）→ 升 `schemaVersion`。
- 两者独立：`formatVersion=1` 可以承载未来的 `schemaVersion=10`，但导入端要先支持。
- 当前导入端：`formatVersion=1` + `schemaVersion=9`；更高版本给明确报错。
- 数据库名固定 `textbook-graph`，DB version 跟随 `SCHEMA_VERSION`（见 `src/lib/db.ts`），与交换包版本无关。

## 应用内行为

- **导出**：把当前图和 IndexedDB 里所有带二进制的资源打包成一个 `.tbg`；有资源缺图片时拒绝导出，避免生成“看起来完整”的包。
- **导入 `.tbg`**：解包 → 校验 → 图和图片在同一个 IndexedDB 事务里替换；导入完直接能看图。
- **导入 `.json`**：保留为兼容路径，只导入图数据；图片需要再用“载入图片…”补。
- 导入前有二次确认；失败不会改当前数据。

## CLI

```bash
bun run pack:exchange \
  --graph local-textbook/sukey/merged/4vol.json \
  --root local-textbook/sukey \
  --out ~/Downloads/苏科版物理-全四册.tbg \
  --title "苏科版初中物理·全四册" \
  --doc local-textbook/sukey/coverage.md \
  --doc local-textbook/sukey/exceptions-b9a.md \
  --doc local-textbook/sukey/exceptions-b9b.md
```

`--root` 是 `graph.assets[].path` 的基准目录；脚本会逐张校验大小与 sha256，任何一张不对就整包失败。

## 为什么不用单个 JSON + base64

818 张图约 160 MB，base64 会膨胀到约 210 MB，而且浏览器解析 JSON、复制字符串、再解码 base64 会额外吃几倍内存。ZIP 里图片保持原始字节（PNG 只存储不压缩），JSON 单独放，读写都更稳。
