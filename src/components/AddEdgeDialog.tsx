import { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { isContextNode, type Node, type Predicate } from '../lib/schema';
import { Button } from './ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
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
import Search from './Search';
import { applicablePredicates, PREDICATE_SPECS } from '../lib/predicates';
import { predicatePreference, subjectProfile } from '../lib/subjects';

interface AddEdgeDialogProps {
  sourceNode: Node;
  isOpen: boolean;
  onClose: () => void;
}

interface Choice {
  key: string;
  predicate: Predicate;
  reversed: boolean;
  label: string;
}

const AddEdgeDialog = ({ sourceNode, isOpen, onClose }: AddEdgeDialogProps) => {
  const [selectedTarget, setSelectedTarget] = useState<Node | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null);
  const [condition, setCondition] = useState('');
  const [contextId, setContextId] = useState<string>('none');
  const createEdge = useGraphStore(state => state.createEdge);
  const index = useGraphStore(state => state.index);
  const book = useGraphStore(state => state.book);
  const profile = subjectProfile(book?.subject);
  const contexts = useMemo(
    () => [...index.nodes.values()].filter(isContextNode),
    [index],
  );

  const choices = useMemo((): Choice[] => {
    if (!selectedTarget) return [];
    const seen = new Set<string>();
    const result: Choice[] = [];
    for (const option of applicablePredicates(sourceNode, selectedTarget)) {
      const spec = PREDICATE_SPECS[option.predicate];
      const label = option.reversed ? spec.inverseLabel : spec.fromLabel;
      if (seen.has(label)) continue;
      seen.add(label);
      result.push({
        key: `${option.predicate}-${option.reversed ? 'r' : 'f'}`,
        predicate: option.predicate,
        reversed: option.reversed,
        label,
      });
    }
    const order = predicatePreference(book?.subject);
    return result.sort(
      (a, b) => (order.get(a.predicate) ?? 99) - (order.get(b.predicate) ?? 99),
    );
  }, [sourceNode, selectedTarget, book?.subject]);

  const handleCreate = async () => {
    if (!selectedTarget || !selectedChoice) {
      toast.warning('请选择一个目标节点和关系类型。');
      return;
    }
    try {
      const from = selectedChoice.reversed ? selectedTarget.id : sourceNode.id;
      const to = selectedChoice.reversed ? sourceNode.id : selectedTarget.id;
      await createEdge({
        from,
        to,
        predicate: selectedChoice.predicate,
        condition: condition.trim() || undefined,
        contextId: contextId === 'none' ? undefined : contextId,
      });
      toast.success('链接已成功创建。');
      handleClose();
    } catch (error) {
      console.error('Failed to create edge:', error);
      toast.error(error instanceof Error ? error.message : '创建链接失败。');
    }
  };

  const handleClose = () => {
    setSelectedTarget(null);
    setSelectedChoice(null);
    setCondition('');
    setContextId('none');
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
                {choices.map(choice => (
                  <Button
                    key={choice.key}
                    variant={selectedChoice?.key === choice.key ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedChoice(choice)}
                  >
                    {choice.label}
                  </Button>
                ))}
                {choices.length === 0 && (
                  <p className="text-sm text-muted-foreground">这两个节点之间没有合适的关系。</p>
                )}
              </div>
              {selectedChoice && (
                <>
                  {(selectedChoice.predicate === 'supports' || selectedChoice.predicate === 'proves') && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {profile.label}：实验/观察支持科学陈述用 supports；proves 只用于理论证明，
                      实验不能替代 proof 节点。
                    </p>
                  )}
                  <div className="grid grid-cols-6 items-center gap-4 mt-4">
                    <label htmlFor="condition" className="text-left">
                      前提条件
                    </label>
                    <Input
                      id="condition"
                      value={condition}
                      placeholder="可选，例如 $f$ 在 $[a,b]$ 上连续"
                      onChange={(e) => setCondition(e.target.value)}
                      className="col-span-5"
                    />
                  </div>
                  <div className="grid grid-cols-6 items-center gap-4 mt-2">
                    <label className="text-left">语境</label>
                    <div className="col-span-5">
                      <Select value={contextId} onValueChange={setContextId}>
                        <SelectTrigger>
                          <SelectValue placeholder="语境未知" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">语境未知</SelectItem>
                          {contexts.map(context => (
                            <SelectItem key={context.id} value={context.id}>
                              {context.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>取消</Button>
          <Button onClick={handleCreate} disabled={!selectedTarget || !selectedChoice}>创建链接</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddEdgeDialog;
