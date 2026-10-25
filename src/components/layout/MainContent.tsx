import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from 'lucide-react';
import AddNodeDialog from '@/components/AddNodeDialog';
import ConfirmDeleteDialog from '@/components/ConfirmDeleteDialog';
import { NodeCard } from '@/components/renderers/NodeCard';
import { NodeEditor } from '@/components/renderers/NodeEditor';
import { Button } from '@/components/ui/button';
import { collectSubtree } from '@/lib/graph';
import type { Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';

interface AddRequest {
  parentId: string | null;
  afterId: string | null;
}

export function MainContent() {
  const index = useGraphStore((state) => state.index);
  const branchId = useGraphStore((state) => state.expandedBranchId);
  const selectedId = useGraphStore((state) => state.selectedId);
  const editingId = useGraphStore((state) => state.editingId);
  const readOnly = useGraphStore((state) => state.readOnly);
  const select = useGraphStore((state) => state.select);
  const setEditing = useGraphStore((state) => state.setEditing);
  const moveSibling = useGraphStore((state) => state.moveSibling);
  const loadSample = useGraphStore((state) => state.loadSample);

  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Node | null>(null);

  const branch = branchId ? index.nodes.get(branchId) : null;

  const items = useMemo(() => {
    if (!branchId) return [];
    return collectSubtree(index, branchId)
      .filter((id) => id !== branchId)
      .map((id) => index.nodes.get(id))
      .filter((node): node is Node => Boolean(node) && node?.type !== 'attempt');
  }, [index, branchId]);

  // 从搜索 / 目录跳过来时把目标滚进视野
  useEffect(() => {
    if (!selectedId) return;
    const element = document.getElementById(`node-${selectedId}`);
    if (element) element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedId, items.length]);

  if (!branch) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          左侧还没有任何分支。先建一个分支，或者载入一份示例看看效果。
        </p>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setAddRequest({ parentId: null, afterId: null })}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建分支
          </Button>
          <Button size="sm" variant="outline" onClick={() => void loadSample()}>
            载入示例
          </Button>
        </div>
        {addRequest && (
          <AddNodeDialog
            parentId={addRequest.parentId}
            afterId={addRequest.afterId}
            isOpen
            onClose={() => setAddRequest(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 border-b bg-background/95 px-4 py-2 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h1 className="truncate text-sm font-semibold text-muted-foreground">
            {branch.title}
          </h1>
          <span className="hidden whitespace-nowrap text-xs text-muted-foreground sm:inline">
            {items.length} 个条目
          </span>
          {!readOnly && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setEditing(branch.id)}
              >
                <Pencil className="mr-1 h-3 w-3" />
                编辑分支
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(branch)}
              >
                <Trash2 className="mr-1 h-3 w-3" />
                删除分支
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => setAddRequest({ parentId: branch.id, afterId: null })}
              >
                <Plus className="mr-1 h-3 w-3" />
                新建章节
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-1 px-3 py-4 pb-24">
        {items.length === 0 && (
          <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
            这个分支还是空的。
            {!readOnly && (
              <div className="mt-3">
                <Button size="sm" onClick={() => setAddRequest({ parentId: branch.id, afterId: null })}>
                  新建主章节
                </Button>
              </div>
            )}
          </div>
        )}

        {items.map((node) => {
          if (editingId === node.id) {
            return (
              <div key={node.id} className="px-1 py-2">
                <NodeEditor node={node} />
              </div>
            );
          }

          const actions = readOnly ? undefined : (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="编辑"
                onClick={(event) => {
                  event.stopPropagation();
                  setEditing(node.id);
                }}
              >
                <Pencil className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="新建子节点"
                onClick={(event) => {
                  event.stopPropagation();
                  setAddRequest({ parentId: node.id, afterId: null });
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="新建同级（插在后面）"
                onClick={(event) => {
                  event.stopPropagation();
                  setAddRequest({ parentId: node.parentId, afterId: node.id });
                }}
              >
                <Plus className="h-3 w-3 rotate-90" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="上移"
                onClick={(event) => {
                  event.stopPropagation();
                  void moveSibling(node.id, 'up');
                }}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title="下移"
                onClick={(event) => {
                  event.stopPropagation();
                  void moveSibling(node.id, 'down');
                }}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-destructive"
                title="删除"
                onClick={(event) => {
                  event.stopPropagation();
                  setDeleteTarget(node);
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </>
          );

          return (
            <NodeCard
              key={node.id}
              node={node}
              number={index.numbering.get(node.id)}
              isSelected={selectedId === node.id}
              readOnly={readOnly}
              onSelect={() => select(node.id)}
              actions={actions}
            />
          );
        })}

        {items.length > 0 && !readOnly && (
          <div className="pt-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full border-dashed text-xs text-muted-foreground"
              onClick={() => setAddRequest({ parentId: branch.id, afterId: items[items.length - 1]?.id ?? null })}
            >
              <Plus className="mr-1 h-3 w-3" />
              在末尾添加
            </Button>
          </div>
        )}
      </div>

      {addRequest && (
        <AddNodeDialog
          parentId={addRequest.parentId}
          afterId={addRequest.afterId}
          isOpen
          onClose={() => setAddRequest(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmDeleteDialog node={deleteTarget} isOpen onClose={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}

export default MainContent;
