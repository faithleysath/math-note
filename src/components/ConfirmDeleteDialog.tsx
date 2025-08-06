import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Node } from "../lib/types";

interface ConfirmDeleteDialogProps {
  node: Node;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ConfirmDeleteDialog = ({ node, isOpen, onClose, onConfirm }: ConfirmDeleteDialogProps) => {
  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>你确定要删除吗？</AlertDialogTitle>
          <AlertDialogDescription>
            此操作无法撤销。这将永久删除节点 "{node.title}" 及其所有关联的边。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default ConfirmDeleteDialog;
