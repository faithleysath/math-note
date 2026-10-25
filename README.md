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

编号不是手写的，是按节点在树里的位置算出来的：挪动、插入、删除之后，后面所有编号自动重排。

**2. 一个节点 = 两层内容**

`content` 是命题陈述或题干，`solution` 是教科书式证明或标准答案，默认折叠。例题和练习下面还能挂多次「解题记录」，记对错、用时、方法——「第一次做错、第二次换方法做对」是刷题笔记里最值钱的信息。

**3. 关系有语义，而且能推理**

存储的谓词只有 7 个，方向永远是「主语 → 宾语」：

| 谓词 | 读法 | 性质 |
|---|---|---|
| `depends-on` | A 依赖 B | 可传递，禁止成环 |
| `cites` | A 提及 B | 不传递 |
| `proves` | A 证明了 B | — |
| `refutes` | A 是 B 的反例 | — |
| `implies` | A ⇒ B | 可传递 |
| `iff` | A ⇔ B | 对称，构成等价类 |
| `generalizes` | A 推广了 B | 可传递 |

「充分条件 / 必要条件」是同一个 `implies` 的两个视图；「是…的定义 / 定理 / 例题」由类型 + 层级派生，都不单独存储。所以不会出现「同一件事存了两份、然后互相打架」。

数学蕴含可以带前提条件（`condition` 字段），每条边还能标「确定 / 猜想 / 已推翻」和出处。

由此得到的查询：

- 间接依赖（传递闭包）
- 前置知识顺序（依赖关系的拓扑排序 = 学习顺序）
- 等价命题组（`iff` 的连通分量）
- 循环依赖检测
- 「A 蕴含 B 但 A 是 B 的反例」这类矛盾的提示

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
- 「导出」下载一份 JSON，「导入」会覆盖当前数据（会二次确认）。
- 「分享」把快照传到 Vercel Blob，生成只读链接 `?note_url=…`，打开后所有写操作被禁用。

数据格式：

```jsonc
{
  "schemaVersion": 2,
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
