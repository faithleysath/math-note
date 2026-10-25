import { useState } from 'react';
import type { Node, NodeType } from '../lib/schema';
import { KIND_LABELS, KIND_OPTIONS, allowedChildTypes, NODE_TYPE_META } from '../lib/schema';
import { nodeTypeButtonColors } from './nodeColors';
import { Button } from './ui/button';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { useGraphStore } from '../stores/useGraphStore';

interface AddNodeDialogProps {
  parent: Node;
  isOpen: boolean;
  onClose: () => void;
  insertAfterNodeId?: string | null;
}

const AddNodeDialog = ({ parent, isOpen, onClose, insertAfterNodeId }: AddNodeDialogProps) => {
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<NodeType | null>(null);
  const [selectedKind, setSelectedKind] = useState<string | undefined>(undefined);
  const createNode = useGraphStore(state => state.createNode);

  const possibleChildren = allowedChildTypes(parent.type);

  const handleCreate = async () => {
    if (!title || !selectedType) {
      alert('Please provide a title and select a type.');
      return;
    }

    try {
      await createNode({
        title,
        type: selectedType,
        kind: selectedKind,
        content: '', // Start with empty content
        parentId: parent.id,
        afterId: insertAfterNodeId || null,
      });
      handleClose();
    } catch (error) {
      console.error('Failed to create new node:', error);
    }
  };

  const handleClose = () => {
    setTitle('');
    setSelectedType(null);
    setSelectedKind(undefined);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>在 "{NODE_TYPE_META[parent.type].label}:{parent.title}" 下添加新节点</DialogTitle>
          <DialogDescription>
            选择一个节点类型并为它命名。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-6 items-center gap-4">
            <label htmlFor="title" className="text-left">
              标题
            </label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="col-span-5"
            />
          </div>
          <div className="grid grid-cols-6 items-center gap-4">
            <label className="text-left">类型</label>
            <div className="col-span-5 flex flex-wrap gap-2">
              {possibleChildren.map(type => (
                <Button
                  key={type}
                  variant={selectedType === type ? 'default' : 'outline'}
                  size="sm"
                  className={cn(
                    selectedType !== type && nodeTypeButtonColors[type]
                  )}
                  onClick={() => {
                    setSelectedType(type);
                    setSelectedKind(KIND_OPTIONS[type][0]);
                  }}
                >
                  {NODE_TYPE_META[type].label}
                </Button>
              ))}
            </div>
          </div>
          {selectedType && KIND_OPTIONS[selectedType].length > 0 && (
            <div className="grid grid-cols-6 items-center gap-4">
              <label className="text-left">细分</label>
              <div className="col-span-5 flex flex-wrap gap-2">
                {KIND_OPTIONS[selectedType].map(kind => (
                  <Button
                    key={kind}
                    variant={selectedKind === kind ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedKind(kind)}
                  >
                    {KIND_LABELS[kind] ?? kind}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleCreate}>创建</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddNodeDialog;
