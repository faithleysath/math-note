import type { PluggableList, Plugin } from 'unified';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { assetIdOf } from './assets';

/**
 * 已注册的 asset id → 可直接给 <img src> 用的 URL（通常是 Blob URL）。
 * markdown 里只允许出现 `asset://<id>`，真正的二进制在 IndexedDB 里，
 * 由上层取出来 createObjectURL 后调用 registerAssetUrl 登记。
 */
const assetUrls = new Map<string, string>();

/**
 * 已注册的 asset id → 图注（原书图注原文，来自 AssetMeta.caption）。
 * 图注是教材内容，markdown 里只有 alt，所以渲染时由 rehypeAssetScheme 补 <figcaption>。
 */
const assetCaptions = new Map<string, string>();

/**
 * 已注册的 asset id → 图的像素尺寸（AssetMeta.width / height，裁图时从 PNG 读出）。
 * 渲染时写进 <img width height>，浏览器在解码前就能按宽高比留好位置，减少滚动跳动。
 * 只知道一边的尺寸不留：缺一边就推不出宽高比，不猜。
 */
const assetSizes = new Map<string, { width: number; height: number }>();

export function registerAssetUrl(id: string, url: string): void {
  assetUrls.set(id, url);
}

function isPixel(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * 登记图片内在尺寸。两边都是正整数才记，否则清掉（老数据没有尺寸属正常情况）。
 */
export function registerAssetSize(id: string, width?: number, height?: number): void {
  if (isPixel(width) && isPixel(height)) assetSizes.set(id, { width, height });
  else assetSizes.delete(id);
}

/** 查已登记的尺寸；没有返回 undefined */
export function assetSize(id: string): { width: number; height: number } | undefined {
  return assetSizes.get(id);
}

/** 一次登记一个资源的全部渲染信息：URL / 图注 / 内在尺寸 */
export interface AssetRegistration {
  url?: string;
  caption?: string;
  width?: number;
  height?: number;
}

export function registerAsset(id: string, meta: AssetRegistration): void {
  if (meta.url) registerAssetUrl(id, meta.url);
  registerAssetCaption(id, meta.caption);
  registerAssetSize(id, meta.width, meta.height);
}

/**
 * 登记图注。空串 / 纯空白当作「没有图注」处理，避免生成空 <figcaption>。
 * 图注里的换行与连续空白折成一个空格：它是一行说明文字，不是 markdown。
 */
export function registerAssetCaption(id: string, caption?: string): void {
  const text = caption?.replace(/\s+/g, ' ').trim();
  if (text) assetCaptions.set(id, text);
  else assetCaptions.delete(id);
}

/** 查已登记的图注；没登记返回 undefined */
export function assetCaption(id: string): string | undefined {
  return assetCaptions.get(id);
}

/** 释放所有已登记的 Blob URL、图注与尺寸（切换教材 / 卸载时调用） */
export function releaseAssetUrls(): void {
  if (typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
    for (const url of assetUrls.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    }
  }
  assetUrls.clear();
  assetCaptions.clear();
  assetSizes.clear();
}

/** 测试用：当前登记了多少个资源 */
export function registeredAssetUrlCount(): number {
  return assetUrls.size;
}

/** 测试用：当前登记了多少条图注 */
export function registeredAssetCaptionCount(): number {
  return assetCaptions.size;
}

/** 测试用：当前登记了多少条尺寸 */
export function registeredAssetSizeCount(): number {
  return assetSizes.size;
}

const ASSET_FIGURE_CLASS = 'asset-figure';
const ASSET_CAPTION_CLASS = 'asset-figure-caption';

function missingAsset(node: Element, id: string) {
  const properties = node.properties;
  properties.src = '';
  // hast 的 data-* 属性用 camelCase 存，react-markdown 会还原成 data-missing-asset
  properties.dataMissingAsset = id;
  properties.className = [...(properties.className ?? []).map(String), 'asset-missing'];
  // alt 保持原样：读屏软件还能读出这本来是哪张图
}

interface AssetFigureInfo {
  id: string;
  caption: string;
}

/**
 * 第一遍：把 `asset://<id>` 换成已登记的 URL，并把有图注的 img 记下来。
 * 没登记的资源不猜、不放行：src 置空并打上 data-missing-asset / asset-missing，交由样式提示。
 */
function resolveAssets(node: Root | Element, figures: Map<Element, AssetFigureInfo>): void {
  if (node.type === 'element' && node.tagName === 'img') {
    const src = node.properties?.src;
    if (typeof src === 'string' && src.startsWith('asset://')) {
      const id = assetIdOf(src) ?? src.slice('asset://'.length);
      const url = assetUrls.get(id);
      if (url) {
        node.properties.src = url;
      } else {
        missingAsset(node, id);
      }
      const size = assetSizes.get(id);
      if (size) {
        node.properties.width = size.width;
        node.properties.height = size.height;
      }
      // 首屏先按占位高度排好版，滚到图时再解码；作者已经写了的属性不覆盖
      node.properties.loading ??= 'lazy';
      node.properties.decoding ??= 'async';
      const caption = assetCaptions.get(id);
      if (caption) figures.set(node, { id, caption });
    }
  }

  if (!('children' in node)) return;
  for (const child of node.children as RootContent[]) {
    if (child.type === 'element') resolveAssets(child, figures);
  }
}

function childrenOf(node: Root | Element): RootContent[] {
  return node.children as RootContent[];
}

function setChildren(node: Root | Element, next: RootContent[]): void {
  (node as Root).children = next;
}

/**
 * 一张有图注的图 = <figure><img><figcaption>图注</figcaption></figure>。
 * 缺图时 img 带 asset-missing 样式，figcaption 仍然输出：读者至少知道这里本该是什么图。
 */
function createFigure(img: Element, info: AssetFigureInfo): Element {
  return {
    type: 'element',
    tagName: 'figure',
    properties: { className: [ASSET_FIGURE_CLASS], dataAssetId: info.id },
    children: [
      img,
      {
        type: 'element',
        tagName: 'figcaption',
        properties: { className: [ASSET_CAPTION_CLASS] },
        children: [{ type: 'text', value: info.caption }],
      },
    ],
  };
}

/** 同一 asset 的多张子图共用一处图注：把 img 插到 figcaption 前面 */
function appendImgToFigure(figure: Element, img: Element): void {
  figure.children.splice(Math.max(figure.children.length - 1, 0), 0, img);
}

/**
 * 段落里可能既有文字又有图。图注要包 <figure>，而 <figure> 不能待在 <p> 里，
 * 所以把段落拆开：文字各自成段，图提到段外，顺序不变。
 */
function splitParagraph(p: Element, figures: Map<Element, AssetFigureInfo>): RootContent[] {
  const pieces: RootContent[] = [];
  let inline: RootContent[] = [];
  let lastFigure: Element | null = null;
  let lastFigureId: string | null = null;

  const flushInline = () => {
    const kept = inline.filter(
      (node) => node.type === 'element' || (node.type === 'text' && node.value.trim() !== ''),
    );
    if (kept.length > 0) {
      pieces.push({
        type: 'element',
        tagName: 'p',
        properties: { ...p.properties },
        children: kept as ElementContent[],
      });
    }
    inline = [];
  };

  for (const child of p.children as RootContent[]) {
    const info = child.type === 'element' ? figures.get(child) : undefined;
    if (child.type === 'element' && info) {
      const adjacent = inline.length === 0 && pieces[pieces.length - 1] === lastFigure;
      // 连续的同一张 asset 只出一处图注（(a)(b) 这类子图本来就画在一个资产里）
      if (lastFigure && adjacent && lastFigureId === info.id) {
        appendImgToFigure(lastFigure, child);
      } else {
        flushInline();
        lastFigure = createFigure(child, info);
        lastFigureId = info.id;
        pieces.push(lastFigure);
      }
      continue;
    }
    inline.push(child);
  }
  flushInline();
  return pieces;
}

/**
 * 第二遍：给有图注的 img 套 <figure>。
 * 段落拆开（段外的图不再嵌在 <p> 里），其他块级容器里就地包 figure。
 */
function wrapFigures(parent: Root | Element, figures: Map<Element, AssetFigureInfo>): void {
  const next: RootContent[] = [];
  for (const child of childrenOf(parent)) {
    if (child.type !== 'element') {
      next.push(child);
      continue;
    }
    if (child.tagName === 'p') {
      next.push(...splitParagraph(child, figures));
      continue;
    }
    const info = figures.get(child);
    if (info) {
      next.push(createFigure(child, info));
      continue;
    }
    wrapFigures(child, figures);
    next.push(child);
  }
  setChildren(parent, next);
}

/**
 * 把 markdown 里的 `asset://<id>` 换成已登记的 URL，并把 AssetMeta.caption 渲染成 <figcaption>。
 * 没登记的资源不猜、不放行：src 置空并打上 data-missing-asset / asset-missing，交由样式提示。
 */
export const rehypeAssetScheme: Plugin<[], Root> = () => (tree) => {
  const figures = new Map<Element, AssetFigureInfo>();
  resolveAssets(tree, figures);
  wrapFigures(tree, figures);
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
