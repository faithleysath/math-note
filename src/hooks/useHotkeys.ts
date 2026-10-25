import { useEffect } from 'react';
import { collectSubtree } from '../lib/graph';
import { useGraphStore } from '../stores/useGraphStore';

/**
 * 全局快捷键
 * - Cmd/Ctrl+F 聚焦搜索
 * - j / k      在当前分支里上下移动选中项
 * - e          编辑选中项
 * - Cmd/Ctrl+E 同上
 * （编辑框内的 Cmd+S / Esc 由 NodeEditor 自己处理）
 */
export function useHotkeys() {
  const selectedId = useGraphStore((state) => state.selectedId);
  const editingId = useGraphStore((state) => state.editingId);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable === true;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        document
          .querySelector<HTMLInputElement>('input[placeholder^="搜索标题"]')
          ?.focus();
        return;
      }

      if (editingId) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e' && selectedId) {
        event.preventDefault();
        useGraphStore.getState().setEditing(selectedId);
        return;
      }

      if (typing) return;

      if (event.key === 'j' || event.key === 'k') {
        const state = useGraphStore.getState();
        const branchId = state.expandedBranchId;
        if (!branchId) return;
        const ids = collectSubtree(state.index, branchId)
          .filter((id) => id !== branchId)
          .filter((id) => state.index.nodes.get(id)?.type !== 'attempt');
        if (ids.length === 0) return;
        event.preventDefault();
        const current = selectedId ? ids.indexOf(selectedId) : -1;
        const next =
          event.key === 'j'
            ? Math.min(current + 1, ids.length - 1)
            : Math.max(current - 1, 0);
        state.select(ids[next]);
        return;
      }

      if (event.key === 'e' && selectedId) {
        event.preventDefault();
        useGraphStore.getState().setEditing(selectedId);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, editingId]);
}
