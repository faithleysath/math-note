import { useState } from 'react';
import type { Node } from '../lib/types';
import { Button } from './ui/button';
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
  子章节: ['定义', '定理', '例题', '笔记', '练习'],
  定义: ['例题', '笔记'],
  定理: ['例题', '笔记'],
  例题: ['解题记录', '笔记'],
  练习: ['解题记录', '笔记'],
  笔记: ['笔记'],
  解题记录: ['笔记'],
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
