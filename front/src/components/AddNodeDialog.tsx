import { useState } from 'react';
import type { Node } from '../lib/types';
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
import { useAppStore } from '../stores/useAppStore';

// Define the allowed children types for each node type
const allowedChildren: Record<Node['type'], Array<Node['type']>> = {
  分支: ['主章节'],
  主章节: ['子章节', '笔记'],
  子章节: ['定义', '定理', '引理', '推论', '例题', '笔记', '练习'],
  定义: ['例题', '笔记'],
  定理: ['引理', '推论', '例题', '笔记'],
  引理: ['例题', '笔记'],
  推论: ['例题', '笔记'],
  例题: ['解题记录', '笔记'],
  练习: ['解题记录', '笔记'],
  笔记: ['笔记'],
  解题记录: ['笔记'],
};

const nodeTypeButtonColors: Record<Node['type'], string> = {
  分支: 'border-gray-500 text-gray-500 hover:bg-gray-100',
  主章节: 'border-slate-500 text-slate-500 hover:bg-slate-100',
  子章节: 'border-stone-500 text-stone-500 hover:bg-stone-100',
  定义: 'border-blue-500 text-blue-500 hover:bg-blue-50',
  定理: 'border-green-500 text-green-500 hover:bg-green-50',
  引理: 'border-teal-500 text-teal-500 hover:bg-teal-50',
  推论: 'border-cyan-500 text-cyan-500 hover:bg-cyan-50',
  例题: 'border-orange-500 text-orange-500 hover:bg-orange-50',
  练习: 'border-purple-500 text-purple-500 hover:bg-purple-50',
  解题记录: 'border-red-500 text-red-500 hover:bg-red-50',
  笔记: 'border-yellow-500 text-yellow-500 hover:bg-yellow-50',
};

interface AddNodeDialogProps {
  parent: Node;
  isOpen: boolean;
  onClose: () => void;
  insertAfterNodeId?: string | null;
}

const AddNodeDialog = ({ parent, isOpen, onClose, insertAfterNodeId }: AddNodeDialogProps) => {
  const [title, setTitle] = useState('');
  const [selectedType, setSelectedType] = useState<Node['type'] | null>(null);
  const addNewNode = useAppStore(state => state.addNewNode);

  const possibleChildren = allowedChildren[parent.type] || [];

  const handleCreate = async () => {
    if (!title || !selectedType) {
      alert('Please provide a title and select a type.');
      return;
    }

    try {
      await addNewNode(
        {
          title,
          type: selectedType,
          content: '', // Start with empty content
          parentId: parent.id,
          children: [],
        },
        parent,
        insertAfterNodeId || null
      );
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
          <DialogTitle>在 "{parent.type}:{parent.title}" 下添加新节点</DialogTitle>
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
                  {type}
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
