import { useState } from 'react';
import type { Node, NodeType } from '../lib/schema';
import { allowedChildTypes, NODE_TYPE_META } from '../lib/schema';
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

const nodeTypeButtonColors: Record<NodeType, string> = {
  branch: 'border-gray-500 text-gray-500 hover:bg-gray-100',
  chapter: 'border-slate-500 text-slate-500 hover:bg-slate-100',
  section: 'border-stone-500 text-stone-500 hover:bg-stone-100',
  definition: 'border-blue-500 text-blue-500 hover:bg-blue-50',
  theorem: 'border-green-500 text-green-500 hover:bg-green-50',
  lemma: 'border-teal-500 text-teal-500 hover:bg-teal-50',
  corollary: 'border-cyan-500 text-cyan-500 hover:bg-cyan-50',
  example: 'border-orange-500 text-orange-500 hover:bg-orange-50',
  exercise: 'border-purple-500 text-purple-500 hover:bg-purple-50',
  attempt: 'border-red-500 text-red-500 hover:bg-red-50',
  note: 'border-yellow-500 text-yellow-500 hover:bg-yellow-50',
  proof: 'border-red-500 text-red-500 hover:bg-red-50',
  concept: 'border-indigo-500 text-indigo-500 hover:bg-indigo-50',
  context: 'border-zinc-500 text-zinc-500 hover:bg-zinc-50',
  counterexample: 'border-rose-500 text-rose-500 hover:bg-rose-50',
};

interface AddNodeDialogProps {
  parent: Node;
  isOpen: boolean;
  onClose: () => void;
  insertAfterNodeId?: string | null;
}

const AddNodeDialog = ({ parent, isOpen, onClose, insertAfterNodeId }: AddNodeDialogProps) => {
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<NodeType | null>(null);
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
                  onClick={() => setSelectedType(type)}
                >
                  {NODE_TYPE_META[type].label}
                </Button>
              ))}
            </div>
          </div>
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
