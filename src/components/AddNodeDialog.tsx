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
import { kindOptionsFor } from '../lib/subjects';

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
  const [showMoreKinds, setShowMoreKinds] = useState(false);
  const createNode = useGraphStore(state => state.createNode);
  const book = useGraphStore(state => state.book);

  // 教材编纂模式默认不提供「个人解题记录」入口；导入的数据仍可正常显示
  const possibleChildren = allowedChildTypes(parent.type).filter((type) => type !== 'attempt');
  const kindOptions = selectedType ? kindOptionsFor(book?.subject, selectedType) : null;
  const allKinds = kindOptions ? [...kindOptions.preferred, ...kindOptions.more] : [];

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
    setShowMoreKinds(false);
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
                    setSelectedKind(kindOptionsFor(book?.subject, type).preferred[0] ?? KIND_OPTIONS[type][0]);
                    setShowMoreKinds(false);
                  }}
                >
                  {NODE_TYPE_META[type].label}
                </Button>
              ))}
            </div>
          </div>
          {selectedType && kindOptions && allKinds.length > 0 && (
            <div className="grid grid-cols-6 items-start gap-4">
              <label className="text-left pt-2">细分</label>
              <div className="col-span-5 flex flex-wrap gap-2">
                {(showMoreKinds ? allKinds : kindOptions.preferred).map(kind => (
                  <Button
                    key={kind}
                    variant={selectedKind === kind ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedKind(kind)}
                  >
                    {KIND_LABELS[kind] ?? kind}
                  </Button>
                ))}
                {kindOptions.more.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowMoreKinds(prev => !prev)}
                  >
                    {showMoreKinds ? '收起更多分类' : `更多分类 (${kindOptions.more.length})`}
                  </Button>
                )}
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
