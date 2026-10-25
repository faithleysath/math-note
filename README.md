# 数学笔记

一个纯前端的数学知识图谱：按教科书的层级记笔记，用带语义的关系把定义、定理、例题、练习连成网，数据存在自己的浏览器里。

线上示例：<https://math-note-delta.vercel.app>

## 它和普通笔记软件有什么不同

**1. 节点类型就是数学教科书的结构**

| 类型 | 编号 | 用途 |
|---|---|---|
| 分支 | — | 数学分析、高等代数… |
| 主章节 / 子章节 | `第 1 章` / `§ 1.1` | 目录层级 |
| 定义 / 定理 / 引理 / 推论 / 例题 / 练习 | `定理 1.1.2` | 正文单元 |
| 笔记 | — | 评注、易错点 |
| 解题记录 | — | 挂在例题或练习下的尝试历史 |
| 证明 | — | 独立的知识对象，用 `proves` 指向被证命题，用 `depends-on` 指向用到的定义/定理 |
| 概念 | — | 跨章节共享的数学概念，定义用 `defines` 指向它 |
| 语境 | — | 变量范围 / 前提集合，供关系引用 |
| 反例 | — | 反驳一个明确的命题 |

编号不是手写的，是按节点在树里的位置算出来的：挪动、插入、删除之后，后面所有编号自动重排。

**2. 一个节点 = 两层内容**

`content` 是命题陈述或题干，`solution` 是教科书式证明或标准答案，默认折叠。例题和练习下面还能挂多次「解题记录」，记对错、用时、方法——「第一次做错、第二次换方法做对」是刷题笔记里最值钱的信息。

**3. 关系有语义，而且能推理**

存储的谓词只有 8 个，方向永远是「主语 → 宾语」：

| 谓词 | 读法 | 性质 |
|---|---|---|
| `depends-on` | A 依赖 B（学习前置） | 可传递，**禁止成环** |
| `cites` | A 提及 B | 不传递 |
| `proves` | 证明 A 证明了命题 B | 起点必须是证明节点 |
| `refutes` | 反例 A 反驳了命题 B | 起点必须是反例节点 |
| `implies` | A ⇒ B | 可传递，**允许成环**（A⇒B 与 B⇒A 可以同时成立） |
| `iff` | A ⇔ B | 对称，允许环，按语境聚等价类 |
| `generalizes` | A 是 B 的推广 | 只作为记录的关联，不自动跨语境传递 |
| `defines` | 定义 A 刻画了概念 B | — |

「充分条件 / 必要条件」是同一个 `implies` 的两个视图；「是…的定义 / 定理 / 例题」由类型 + 层级派生，都不单独存储。

每条关系还带：

- `condition`：前提（LaTeX），推理时必须一起显示，不能被忽略
- `status`：确定 / 猜想 / 已推翻。`disproven` 永不参与推理，`conjecture` 默认也不参与
- `reviewState`：未审核 / 人工审核 / 形式化验证。人工阅读不会自动变成「机器验证」
- `contextId`：语境（指向一个「语境」节点）。语境未知不会被当作全局成立
- `assumptionIds`：结构化前提

**目录不是逻辑**：`parentId` 只决定笔记排在哪里，不代表数学依赖。
**引用不是依赖**：`cites` 只是提到，`depends-on` 才是学习前置。

### 结构遍历 vs 数学推理

- 结构遍历（导航）：只看存了哪些边，不判断真假。`iff` 在结构上双向可达。
- 数学推理：只走 `implies` / `iff`，逐条检查状态、语境、前提与审核级别，输出**结论 + 路径 + 未决前提 + 最弱审核级别**。只要路径上有未决前提、语境未知或未审核，就标成「有前提的候选」，不会说成无条件的定理。

由此得到的查询：

- 前置知识顺序（`depends-on` 的拓扑排序 = 学习顺序，孤立知识点也能排进去）
- 环诊断区分「真正在环上的节点」与「被环阻塞的节点」
- 等价命题组（`iff` 连通分量，按语境分组，跳过已推翻）
- 可推导结论及其解释路径（右侧「推理」面板，可切换「全部关联 / 仅已审核」）
- 冲突线索（互为推广、不同前提的双向蕴含）——只是提醒人工核查，不做数学判定

**4. 身份只有一个**

层级只用 `parentId + order` 表达，不存 `children` 数组。任何一次写操作只动一个节点，删除时递归删子树并清掉所有牵连的边。编号、子节点列表、祖先链全部是内存里的派生数据，每次图变更整体重建——不会出现「父子两边不一致」。

**5. 手写笔记直接进图谱**

上传手写笔记照片，模型把它拆成结构化的操作序列（`create-node` / `create-edge` …），**先在对话框里预览，确认后才写入**，写入前还要过一遍数据层的不变式。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Cmd/Ctrl + F` | 聚焦搜索 |
| `j` / `k` | 在当前分支里上下移动选中项 |
| `e` 或 `Cmd/Ctrl + E` | 编辑选中项 |
| `Cmd/Ctrl + S` | 保存（编辑中） |
| `Esc` | 取消编辑 |

## 数据

- 全部存在浏览器 IndexedDB（数据库 `math-note-graph`），不联网、不登录。
- 导入 v2 备份时会自动迁移：定理/引理/推论上的 `solution` 会复制成独立的「证明」节点并建立 `proves` 边，原字段保留可回滚。
- 「导出」下载一份 JSON，「导入」会覆盖当前数据（会二次确认）。
- 「分享」把快照传到 Vercel Blob，生成只读链接 `?note_url=…`，打开后所有写操作被禁用。

数据格式：

```jsonc
{
  "schemaVersion": 3,
  "nodes": [
    {
      "id": "uuid",
      "type": "theorem",
      "title": "夹逼定理",
      "content": "若 $a_n \\le b_n \\le c_n$ …",
      "solution": "对任意 $\\varepsilon>0$ …",
      "parentId": "uuid-of-section",
      "order": 3072,
      "key": "squeeze-theorem",
      "aliases": ["夹逼准则"],
      "tags": [],
      "citation": { "book": "数学分析", "page": "35", "theoremNo": "2.3.1" },
      "createdAt": 0,
      "updatedAt": 0
    }
  ],
  "edges": [
    {
      "id": "uuid",
      "from": "uuid-of-theorem",
      "to": "uuid-of-definition",
      "predicate": "depends-on",
      "condition": "$a_n \\le b_n \\le c_n$",
      "status": "asserted",
      "reviewState": "unreviewed",
      "contextId": "uuid-of-context",
      "assertedBy": "manual",
      "createdAt": 0,
      "updatedAt": 0
    }
  ]
}
```

## 开发

```bash
bun install
bun dev          # http://localhost:5173
bun test         # 编号、图算法、不变式的单元测试
bun run lint
bun run build
```

技术栈：React 19 + TypeScript + Vite 7 + Tailwind 4 + shadcn/ui + Zustand 5 + Dexie 4 + zod + KaTeX。

```
src/lib/schema.ts      节点 / 边 / 谓词的类型与 zod 校验
src/lib/predicates.ts  谓词注册表（方向、传递性、允许的类型、显示文案）
src/lib/graph.ts       纯函数：索引、编号、遍历、闭包、拓扑排序、搜索
src/lib/validate.ts    不变式（类型白名单、防环、唯一性、防镜像层级）
src/lib/db.ts          Dexie 持久化
src/stores/useGraphStore.ts  内存图 + 写穿
```

## 部署

推到 Vercel 即可。可选环境变量：

| 变量 | 作用 |
|---|---|
| `GEMINI_API_KEY` | 让 `/api/geminiProxy` 透传 Gemini 请求时不暴露 key |
| `SHARE_TOKEN` | 设置后，`/api/upload` 要求请求头 `x-share-token` 匹配才允许上传 |
