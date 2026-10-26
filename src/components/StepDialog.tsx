import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import Search from './Search';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { isContextNode, typeLabel, type Node } from '../lib/schema';
import { useGraphStore } from '../stores/useGraphStore';

interface StepDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** 从某个节点打开时，它默认作为结论 */
  defaultConclusionId?: string;
  defaultPremiseIds?: string[];
}

/**
 * 新建推理步骤（超边）。
 * 一次可以选多个前提 —— 它们必须同时成立，才能推出结论。
 */
const StepDialog = ({ isOpen, onClose, defaultConclusionId, defaultPremiseIds }: StepDialogProps) => {
  const index = useGraphStore((state) => state.index);
  const createStep = useGraphStore((state) => state.createStep);

  const [premises, setPremises] = useState<Node[]>(
    (defaultPremiseIds ?? [])
      .map((id) => index.nodes.get(id))
      .filter((node): node is Node => Boolean(node)),
  );
  const [conclusion, setConclusion] = useState<Node | null>(
    defaultConclusionId ? (index.nodes.get(defaultConclusionId) ?? null) : null,
  );
  const [rule, setRule] = useState('');
  const [contextId, setContextId] = useState('none');
  const [proofId, setProofId] = useState('none');

  const contexts = [...index.nodes.values()].filter(isContextNode);
  const proofs = [...index.nodes.values()].filter((node) => node.type === 'proof');

  const reset = () => {
    setPremises([]);
    setConclusion(null);
    setRule('');
    setContextId('none');
    setProofId('none');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addPremise = (node: Node) => {
    if (premises.some((premise) => premise.id === node.id)) {
      toast.warning('这个前提已经加过了。');
      return;
    }
    setPremises((prev) => [...prev, node]);
  };

  const submit = async () => {
    if (!conclusion) {
      toast.warning('先选一个结论节点。');
      return;
    }
    try {
      await createStep({
        premiseIds: premises.map((premise) => premise.id),
        conclusionId: conclusion.id,
        rule,
        contextId: contextId === 'none' ? undefined : contextId,
        proofId: proofId === 'none' ? undefined : proofId,
      });
      toast.success('推理步骤已创建。');
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建推理步骤失败。');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : handleClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建推理步骤</DialogTitle>
          <DialogDescription>
            多个前提必须同时成立才能推出结论（AND）。只有单个前提就够的情况，用关系边更合适。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-6 items-start gap-4">
            <label className="pt-2 text-left">前提</label>
            <div className="col-span-5 space-y-2">
              {premises.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {premises.map((premise) => (
                    <span
                      key={premise.id}
                      className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs"
                    >
                      <span className="text-muted-foreground">
                        {typeLabel(premise)}
                      </span>
                      {premise.title}
                      <button
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                        onClick={() =>
                          setPremises((prev) => prev.filter((item) => item.id !== premise.id))
                        }
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <Search onSelectNode={addPremise} />
            </div>
          </div>

          <div className="grid grid-cols-6 items-center gap-4">
            <label className="text-left">结论</label>
            <div className="col-span-5">
              {conclusion ? (
                <div className="flex items-center justify-between rounded border bg-muted/40 px-2 py-1 text-sm">
                  <span>
                    <span className="mr-1 text-xs text-muted-foreground">
                      {typeLabel(conclusion)}
                    </span>
                    {conclusion.title}
                  </span>
                  <Button variant="ghost" size="sm" className="h-6" onClick={() => setConclusion(null)}>
                    换一个
                  </Button>
                </div>
              ) : (
                <Search onSelectNode={setConclusion} />
              )}
            </div>
          </div>

          <div className="grid grid-cols-6 items-center gap-4">
            <label htmlFor="step-rule" className="text-left">
              规则
            </label>
            <Input
              id="step-rule"
              value={rule}
              placeholder="用了哪条定理？例如：紧集上连续函数有界"
              onChange={(event) => setRule(event.target.value)}
              className="col-span-5"
            />
          </div>

          <div className="grid grid-cols-6 items-center gap-4">
            <label className="text-left">语境</label>
            <div className="col-span-5">
              <Select value={contextId} onValueChange={setContextId}>
                <SelectTrigger>
                  <SelectValue placeholder="语境未知" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">语境未知</SelectItem>
                  {contexts.map((context) => (
                    <SelectItem key={context.id} value={context.id}>
                      {context.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-6 items-center gap-4">
            <label className="text-left">所属证明</label>
            <div className="col-span-5">
              <Select value={proofId} onValueChange={setProofId}>
                <SelectTrigger>
                  <SelectValue placeholder="不属于某个证明" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不属于某个证明</SelectItem>
                  {proofs.map((proof) => (
                    <SelectItem key={proof.id} value={proof.id}>
                      {proof.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={submit} disabled={!conclusion || premises.length === 0 || !rule.trim()}>
            <Plus className="mr-1 h-4 w-4" />
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default StepDialog;
