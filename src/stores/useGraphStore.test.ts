import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildIndex } from '../lib/graph';
import type { BookMeta } from '../lib/schema';

let useGraphStore: typeof import('./useGraphStore').useGraphStore;

const book: BookMeta = {
  subject: 'physics',
  stage: 'junior',
  title: '测试物理教材',
  edition: '人教版',
};

beforeAll(async () => {
  await import('fake-indexeddb/auto' as string);
  ({ useGraphStore } = await import('./useGraphStore'));
});

beforeEach(async () => {
  await useGraphStore.getState().clearAll();
});

describe('教材保护', () => {
  it('没有 book 时拒绝创建节点', async () => {
    useGraphStore.setState({
      book: null,
      index: buildIndex([], []),
      status: 'ready',
    });

    await expect(
      useGraphStore.getState().createNode({ type: 'branch', title: '无主分支', parentId: null }),
    ).rejects.toThrow(/请先新建或导入教材/);
    expect(useGraphStore.getState().index.nodes.size).toBe(0);
  });
});

describe('编辑教材信息', () => {
  it('更新 book，并同步仍叫旧书名的默认根分支', async () => {
    await useGraphStore.getState().createBook(book);
    const rootId = useGraphStore.getState().index.roots[0];
    expect(useGraphStore.getState().index.nodes.get(rootId)?.title).toBe(book.title);

    const next = await useGraphStore.getState().updateBook({
      ...book,
      title: '九年级物理（修订）',
      subject: 'chemistry',
      stage: 'senior',
      edition: '新版',
    });

    expect(next).toEqual({
      subject: 'chemistry',
      stage: 'senior',
      title: '九年级物理（修订）',
      edition: '新版',
    });
    expect(useGraphStore.getState().book).toEqual(next);
    expect(useGraphStore.getState().index.nodes.get(rootId)?.title).toBe('九年级物理（修订）');
  });

  it('用户自己改过根分支名时，不覆盖目录标题', async () => {
    await useGraphStore.getState().createBook(book);
    const rootId = useGraphStore.getState().index.roots[0];
    await useGraphStore.getState().updateNode(rootId, { title: '自定义目录' });

    await useGraphStore.getState().updateBook({ ...book, title: '新书名' });
    expect(useGraphStore.getState().book?.title).toBe('新书名');
    expect(useGraphStore.getState().index.nodes.get(rootId)?.title).toBe('自定义目录');
  });

  it('没有教材时不能编辑教材信息', async () => {
    await expect(useGraphStore.getState().updateBook(book)).rejects.toThrow(/还没有教材/);
  });
});
