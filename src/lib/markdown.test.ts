import { describe, expect, it } from 'vitest';
import katex from 'katex';
import 'katex/contrib/mhchem';
import type { Element, ElementContent, Root, RootContent } from 'hast';
import {
  assetCaption,
  assetSize,
  registerAsset,
  registerAssetCaption,
  registerAssetSize,
  registerAssetUrl,
  registeredAssetCaptionCount,
  registeredAssetSizeCount,
  releaseAssetUrls,
  rehypeAssetScheme,
} from './markdown';

describe('mhchem', () => {
  it('注册 \\ce 与 \\pu，化学方程式可渲染', () => {
    const reaction = katex.renderToString('\\ce{2KMnO4 ->[\\Delta] K2MnO4 + MnO2 + O2 ^}', {
      throwOnError: true,
    });
    expect(reaction).toContain('katex');
    expect(reaction).toContain('KMnO');

    const unit = katex.renderToString('\\pu{3 mol // L}', { throwOnError: true });
    expect(unit).toContain('katex');
  });
});

describe('asset:// 渲染', () => {
  function makeImg(src: string, alt = '示意图'): Element {
    return { type: 'element', tagName: 'img', properties: { src, alt }, children: [] };
  }

  function makeParagraph(children: ElementContent[]): Element {
    return { type: 'element', tagName: 'p', properties: {}, children };
  }

  /** 直接跑插件里的 transformer（Plugin<[], Root> 可以当零参工厂用） */
  function runPlugin(children: RootContent[]): Root {
    const tree: Root = { type: 'root', children };
    (rehypeAssetScheme as unknown as () => (tree: Root) => void)()(tree);
    return tree;
  }

  /** 造一个只含一张图的树，返回图节点本身（src 是原地改的） */
  function renderImg(src: string): Element {
    const img = makeImg(src);
    runPlugin([makeParagraph([img])]);
    return img;
  }

  function findAll(node: Root | Element, tagName: string): Element[] {
    const found: Element[] = [];
    for (const child of node.children as RootContent[]) {
      if (child.type !== 'element') continue;
      if (child.tagName === tagName) found.push(child);
      found.push(...findAll(child, tagName));
    }
    return found;
  }

  function textOf(node: Element): string {
    return (node.children as RootContent[])
      .map((child) => (child.type === 'text' ? child.value : ''))
      .join('');
  }

  it('登记过的 asset:// 换成登记的那个 URL', () => {
    const url = URL.createObjectURL(new Blob(['x'], { type: 'image/png' }));
    try {
      registerAssetUrl('img-1', url);
      const img = renderImg('asset://img-1');
      expect(img.properties.src).toBe(url);
      expect(img.properties.dataMissingAsset).toBeUndefined();
    } finally {
      releaseAssetUrls();
    }
  });

  it('没登记的资源：src 置空，并带上 data-missing-asset 与占位样式类', () => {
    releaseAssetUrls();
    const img = renderImg('asset://img-404');
    expect(img.properties.src).toBe('');
    expect(img.properties.dataMissingAsset).toBe('img-404');
    expect(img.properties.className).toContain('asset-missing');
    // alt 保留，读屏软件还能知道这本来是哪张图
    expect(img.properties.alt).toBe('示意图');
  });

  it('没有图注：不生成空 figcaption，图仍留在段落里', () => {
    try {
      registerAssetUrl('img-plain', 'blob:asset-img-plain');
      const tree = runPlugin([makeParagraph([makeImg('asset://img-plain')])]);

      expect(findAll(tree, 'figure')).toHaveLength(0);
      expect(findAll(tree, 'figcaption')).toHaveLength(0);
      expect(findAll(tree, 'p')).toHaveLength(1);
      expect(findAll(tree, 'img')[0].properties.src).toBe('blob:asset-img-plain');
    } finally {
      releaseAssetUrls();
    }
  });

  it('有图注：包成 figure，图注在图片下方的 figcaption 里，且不嵌在 <p> 内', () => {
    try {
      registerAssetUrl('img-cap', 'blob:asset-img-cap');
      registerAssetCaption('img-cap', '图 1-11 激光笔演示声波');
      const tree = runPlugin([makeParagraph([makeImg('asset://img-cap')])]);

      const figures = findAll(tree, 'figure');
      expect(figures).toHaveLength(1);
      expect(figures[0].properties.className).toContain('asset-figure');
      // 结构：<figure><img><figcaption>图注</figcaption></figure>
      expect(figures[0].children.map((child) => (child as Element).tagName)).toEqual([
        'img',
        'figcaption',
      ]);
      expect(figures[0].properties.dataAssetId).toBe('img-cap');
      const caption = figures[0].children[1] as Element;
      expect(caption.properties.className).toContain('asset-figure-caption');
      expect(textOf(caption)).toBe('图 1-11 激光笔演示声波');
      // <figure> 不能是 <p> 的后代
      expect(findAll(tree, 'p')).toHaveLength(0);
    } finally {
      releaseAssetUrls();
    }
  });

  it('缺图时图注照样输出，读者知道这里本该是什么图', () => {
    releaseAssetUrls();
    registerAssetCaption('img-404', '图 1-12 两个纸杯做的土电话');
    try {
      const tree = runPlugin([makeParagraph([makeImg('asset://img-404')])]);

      const img = findAll(tree, 'img')[0];
      expect(img.properties.className).toContain('asset-missing');
      expect(findAll(tree, 'figure')).toHaveLength(1);
      expect(textOf(findAll(tree, 'figcaption')[0])).toBe('图 1-12 两个纸杯做的土电话');
    } finally {
      releaseAssetUrls();
    }
  });

  it('同一 asset 的连续多张图只出一处图注', () => {
    try {
      registerAssetUrl('img-pair', 'blob:asset-img-pair');
      registerAssetCaption('img-pair', '图 1-1 感受发声物体的振动');
      const tree = runPlugin([
        makeParagraph([makeImg('asset://img-pair'), makeImg('asset://img-pair')]),
      ]);

      const figures = findAll(tree, 'figure');
      expect(figures).toHaveLength(1);
      expect(figures[0].children.map((child) => (child as Element).tagName)).toEqual([
        'img',
        'img',
        'figcaption',
      ]);
      expect(findAll(tree, 'figcaption')).toHaveLength(1);
    } finally {
      releaseAssetUrls();
    }
  });

  it('段落里的文字和图片混排：文字留在段落里，图提到段外，顺序不变', () => {
    try {
      registerAssetUrl('img-mixed', 'blob:asset-img-mixed');
      registerAssetCaption('img-mixed', '图 1-2 乒乓球被音叉弹开');
      const text: RootContent = { type: 'text', value: '如图所示，' };
      const tree = runPlugin([makeParagraph([text, makeImg('asset://img-mixed')])]);

      const blocks = tree.children as Element[];
      expect(blocks.map((block) => block.tagName)).toEqual(['p', 'figure']);
      expect(textOf(blocks[0])).toBe('如图所示，');
      expect(textOf(findAll(blocks[1], 'figcaption')[0])).toBe('图 1-2 乒乓球被音叉弹开');
    } finally {
      releaseAssetUrls();
    }
  });

  it('登记了内在尺寸：img 带 width/height，并补齐 loading/decoding', () => {
    try {
      registerAssetUrl('img-size', 'blob:asset-img-size');
      registerAssetSize('img-size', 640, 360);
      const img = renderImg('asset://img-size');
      expect(img.properties.width).toBe(640);
      expect(img.properties.height).toBe(360);
      expect(img.properties.loading).toBe('lazy');
      expect(img.properties.decoding).toBe('async');
    } finally {
      releaseAssetUrls();
    }
  });

  it('没尺寸的图不猜，作者写好的属性不覆盖', () => {
    try {
      registerAssetUrl('img-nosize', 'blob:asset-img-nosize');
      // 只有一边的尺寸推不出宽高比 → 当作没有
      registerAssetSize('img-nosize', 640, undefined);
      const img = makeImg('asset://img-nosize');
      img.properties.loading = 'eager';
      runPlugin([makeParagraph([img])]);
      expect(img.properties.width).toBeUndefined();
      expect(img.properties.height).toBeUndefined();
      expect(img.properties.loading).toBe('eager');
      expect(img.properties.decoding).toBe('async');
    } finally {
      releaseAssetUrls();
    }
  });

  it('registerAsset 一次登记 URL / 图注 / 尺寸，release 后清空', () => {
    releaseAssetUrls();
    registerAsset('img-all', { url: 'blob:img-all', caption: '图 2-1', width: 320, height: 240 });
    expect(assetCaption('img-all')).toBe('图 2-1');
    expect(assetSize('img-all')).toEqual({ width: 320, height: 240 });
    expect(registeredAssetSizeCount()).toBe(1);

    releaseAssetUrls();
    expect(registeredAssetSizeCount()).toBe(0);
    expect(assetSize('img-all')).toBeUndefined();
  });

  it('图注登记：空串当没有图注，release 后清空', () => {
    releaseAssetUrls();
    registerAssetCaption('img-a', '  图 1-3\n  声音在固体中传播 ');
    registerAssetCaption('img-b', '   ');
    expect(registeredAssetCaptionCount()).toBe(1);
    // 换行与连续空白折成一行
    expect(assetCaption('img-a')).toBe('图 1-3 声音在固体中传播');
    expect(assetCaption('img-b')).toBeUndefined();

    releaseAssetUrls();
    expect(registeredAssetCaptionCount()).toBe(0);
    expect(assetCaption('img-a')).toBeUndefined();
  });
});
