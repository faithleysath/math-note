import { describe, expect, it } from 'vitest';
import katex from 'katex';
import 'katex/contrib/mhchem';

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
