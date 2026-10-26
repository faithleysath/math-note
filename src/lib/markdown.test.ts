import { describe, expect, it } from 'vitest';
import katex from 'katex';
import 'katex/contrib/mhchem';
import type { Element, Root } from 'hast';
import { registerAssetUrl, releaseAssetUrls, rehypeAssetScheme } from './markdown';

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
  /** 造一个只含一张图的 hast 树，直接跑插件里的 transformer */
  function renderImg(src: string) {
    const img: Element = {
      type: 'element',
      tagName: 'img',
      properties: { src, alt: '示意图' },
      children: [],
    };
    const tree: Root = {
      type: 'root',
      children: [
        { type: 'element', tagName: 'p', properties: {}, children: [img] },
      ],
    };
    // Plugin<[], Root> 直接当零参工厂用
    (rehypeAssetScheme as unknown as () => (tree: Root) => void)()(tree);
    return img;
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
});
