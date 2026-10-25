import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NODE_TYPE_META, type Node } from '@/lib/schema';
import { collectSubtree } from '@/lib/graph';
import { useGraphStore } from '@/stores/useGraphStore';

interface ConfirmDeleteDialogProps {
  node: Node;
  isOpen: boolean;
  onClose: () => void;
}

export function ConfirmDeleteDialog({ node, isOpen, onClose }: ConfirmDeleteDialogProps) {
  const index = useGraphStore((state) => state.index);
  const deleteSubtree = useGraphStore((state) => state.deleteSubtree);

  const { count, edgeCount } = useMemo(() => {
    const ids = collectSubtree(index, node.id);
    const idSet = new Set(ids);
    const edges = index.edges.filter((edge) => idSet.has(edge.from) || idSet.has(edge.to));
    return { count: ids.length, edgeCount: edges.length };
  }, [index, node.id]);

  const confirm = async () => {
    await deleteSubtree(node.id);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>删除「{node.title}」？</DialogTitle>
          <DialogDescription>
            这是一个{NODE_TYPE_META[node.type].label}，
            {count > 1 ? (
              <>
                将连同它的 <b>{count - 1}</b> 个子节点一起删除，
              </>
            ) : (
              '没有子节点，'
            )}
            并删除 <b>{edgeCount}</b> 条相关关系。删除后无法撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="destructive" onClick={() => void confirm()}>
            删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmDeleteDialog;
