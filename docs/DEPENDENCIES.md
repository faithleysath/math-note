# 依赖升级记录

- 日期：2026-10-26
- 结果：`bun run test` 102 项通过，`bun run lint`、`bun run build`、`bun run check:examples` 通过。
- `bun outdated` 目前只剩 TypeScript：当前 6.0.3，最新 7.0.2。

## 为什么没有升 TypeScript 7

`typescript-eslint@8.72.0` 在加载时会直接拒绝 TS 7.0：

```text
typescript-eslint does not support TS 7.0.
```

`8.72.1-alpha.15` canary 也一样。`tsc` 本身可以用 TS 7 构建本项目，但 Lint 会直接退出，所以暂时固定在 `6.0.3`。等 typescript-eslint 正式支持 TS 7 后再升，不需要改业务代码。

## 已删除的未使用依赖

- `uuid`（代码使用 `crypto.randomUUID`）
- `dexie-react-hooks`
- `@radix-ui/react-label`
- `@radix-ui/react-radio-group`
- `rehype-rewrite`
- `@types/uuid`

## 大版本迁移

### Vite 8 / TypeScript 6

- 移除 `baseUrl`，`paths` 直接相对 `tsconfig` 解析。
- `vite.config.ts` 用 `import.meta.dirname` 代替 `__dirname`。
- `tsconfig.app.json` 显式加入 `types: ["node"]`，测试里的 `node:fs` 才能解析。

### react-resizable-panels 4

API 完全换了：

- `PanelGroup` → `Group`，`PanelResizeHandle` → `Separator`
- `direction` → `orientation`
- `defaultSize` / `minSize` 现在把数字解释为像素，百分比要写 `"20%"`

`src/components/ui/resizable.tsx` 和 `src/App.tsx` 已迁移；水平分隔条的横竖样式在 `src/index.css` 里补了 v4 的 `aria-orientation` 规则。

### KaTeX 0.19 + mhchem

`rehype-katex@7.0.1` 自己依赖 `katex@^0.16`，升级后会出现两份 KaTeX：mhchem 注册在 0.19，实际渲染却用嵌套的 0.16，导致 `\ce{...O2 ^}` 报错。

`package.json` 用 overrides 强制单实例：

```json
"overrides": {
  "katex": "0.19.1"
}
```

升级后 `rehype-katex` 共用顶层 0.19.1，开发和生产构建都验证了 `\ce`、反应条件与 `\pu`。

### 其他大版本

- Mermaid 12：关系图 `mermaid.render` 正常，已用真实关系数据验证。
- @vercel/blob 2：`put(pathname, body, { access, contentType, addRandomSuffix })` 接口仍在，分享上传逻辑不需要改。
- lucide-react 1.x、React 19.3、Tailwind 4.3、@uiw/react-md-editor 4.1：现有导入和组件 API 兼容。

## 复验命令

```bash
bun run test
bun run lint
bun run build
bun run check:examples
```
