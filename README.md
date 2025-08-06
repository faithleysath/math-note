# 数学笔记 (Math Note) - Monorepo

这是一个基于图的数学笔记应用的全栈项目仓库。

## 项目结构

本项目采用 monorepo 结构，包含两个主要部分：

-   `./front/`: 纯前端的 React 应用，是应用的核心交互界面。
-   `./api/`: 基于 Vercel Serverless Functions 的后端 API。

---

## 前端 (`./front/`)

前端是一个功能完备的、基于 React 和 TypeScript 的单页应用。它负责所有的笔记创建、编辑、组织和可视化功能。

**详细信息、技术栈和本地启动说明，请参考 [前端 README](./front/README.md)。**

---

## 后端 (`./api/`)

后端由一系列轻量级的 Vercel Serverless Functions 组成，用于提供前端应用无法独立完成的功能。

### API 端点

#### `POST /api/upload`

-   **功能**: 接收前端导出的笔记数据 (JSON 格式)，将其上传到 Vercel Blob 存储，并返回一个公开可访问的 URL。
-   **技术**:
    -   Vercel Edge Functions
    -   `@vercel/blob`
-   **用途**: 实现笔记的“分享”功能。前端可以将返回的 URL 构造成一个分享链接，任何人都可以通过该链接以只读模式查看这份笔记快照。

---

## 部署

本项目已为 Vercel 平台优化。将此仓库直接连接到您的 Vercel 账户即可实现一键部署。Vercel 会自动识别前端应用和后端的 Serverless Functions。

在部署前，请确保您已为项目设置了 Vercel Blob 存储，并将相关的环境变量（如 `BLOB_READ_WRITE_TOKEN`）配置到 Vercel 项目中。
