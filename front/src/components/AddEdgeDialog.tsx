import { useState } from 'react';
import type { Node, EdgeLabel } from '../lib/types';
import { Button } from './ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { addEdge } from '../lib/db';
import { useAppStore } from '../stores/useAppStore';
import Search from './Search';

const allEdgeLabels: EdgeLabel[] = [
  '是...的定义', '是...的定理', '引用', '证明', '是...的例题', '是...的练习题', '是...的解题记录'
];

interface AddEdgeDialogProps {
  sourceNode: Node;
  isOpen: boolean;
  onClose: () => void;
}

const AddEdgeDialog = ({ sourceNode, isOpen, onClose }: AddEdgeDialogProps) => {
  const [selectedTarget, setSelectedTarget] = useState<Node | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<EdgeLabel | null>(null);
  const triggerContentRefresh = useAppStore(state => state.triggerContentRefresh);

  const handleCreate = async () => {
    if (!selectedTarget || !selectedLabel) {
      alert('Please select a target node and a relationship type.');
      return;
    }
    try {
      await addEdge({
        source: sourceNode.id,
        target: selectedTarget.id,
        label: selectedLabel,
      });
      triggerContentRefresh();
      handleClose();
    } catch (error) {
      console.error('Failed to create edge:', error);
    }
  };

  const handleClose = () => {
    setSelectedTarget(null);
    setSelectedLabel(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>为 "{sourceNode.title}" 添加新链接</DialogTitle>
          <DialogDescription>
            搜索一个节点，然后选择你们之间的关系。
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!selectedTarget ? (
            <Search onSelectNode={setSelectedTarget} />
          ) : (
            <div>
              <p className="mb-2">目标节点: <span className="font-semibold">{selectedTarget.title}</span></p>
              <label className="block text-sm font-medium mb-2">关系类型</label>
              <div className="flex flex-wrap gap-2">
                {allEdgeLabels.map(label => (
                  <Button
                    key={label}
                    variant={selectedLabel === label ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedLabel(label)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleCreate} disabled={!selectedTarget || !selectedLabel}>创建链接</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddEdgeDialog;
