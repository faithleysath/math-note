import type { PluggableList, Plugin } from 'unified';
import type { Element, Root, RootContent } from 'hast';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { assetIdOf } from './assets';

/**
 * 已注册的 asset id → 可直接给 <img src> 用的 URL（通常是 Blob URL）。
 * markdown 里只允许出现 `asset://<id>`，真正的二进制在 IndexedDB 里，
 * 由上层取出来 createObjectURL 后调用 registerAssetUrl 登记。
 */
const assetUrls = new Map<string, string>();

export function registerAssetUrl(id: string, url: string): void {
  assetUrls.set(id, url);
}

/** 释放所有已注册的 Blob URL（切换教材 / 卸载时调用） */
export function releaseAssetUrls(): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    for (const url of assetUrls.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }
  assetUrls.clear();
}

/** 测试用：当前登记了多少个资源 */
export function registeredAssetUrlCount(): number {
  return assetUrls.size;
}

function missingAsset(node: Element, id: string) {
  const properties = node.properties;
  properties.src = '';
  // hast 的 data-* 属性用 camelCase 存，react-markdown 会还原成 data-missing-asset
  properties.dataMissingAsset = id;
  properties.className = [...(properties.className ?? []).map(String), 'asset-missing'];
  // alt 保持原样：读屏软件还能读出这本来是哪张图
}

function resolveAssets(node: Root | Element): void {
  if (node.type === 'element') {
    if (node.tagName === 'img') {
      const src = node.properties?.src;
      if (typeof src === 'string' && src.startsWith('asset://')) {
        const id = assetIdOf(src) ?? src.slice('asset://'.length);
        const url = assetUrls.get(id);
        if (url) {
          node.properties.src = url;
        } else {
          missingAsset(node, id);
        }
      }
    }
  }

  if (!('children' in node)) return;
  for (const child of node.children as RootContent[]) {
    if (child.type === 'element') resolveAssets(child);
  }
}

/**
 * 把 markdown 里的 `asset://<id>` 换成已登记的 URL。
 * 没登记的资源不猜、不放行：src 置空并打上 data-missing-asset / asset-missing，交由样式提示。
 */
export const rehypeAssetScheme: Plugin<[], Root> = () => (tree) => {
  resolveAssets(tree);
};

/**
 * 编辑预览与阅读视图共用同一套 Markdown/KaTeX 配置。
 * mhchem（\ce / \pu）由 main.tsx 的 side-effect import 注册。
 */
export function markdownPlugins(): { remarkPlugins: PluggableList; rehypePlugins: PluggableList } {
  return {
    remarkPlugins: [remarkMath],
    rehypePlugins: [[rehypeKatex, { throwOnError: false, strict: false }], rehypeAssetScheme],
  };
}
