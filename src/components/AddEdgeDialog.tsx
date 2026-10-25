import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Search } from '@/components/Search';
import { NodeBadge } from '@/components/NodeBadge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { applicablePredicates, predicatesByFamily, PREDICATE_SPECS, type ApplicablePredicate } from '@/lib/predicates';
import type { Edge, Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';
import { cn } from '@/lib/utils';

interface AddEdgeDialogProps {
  sourceId: string;
  isOpen: boolean;
  onClose: () => void;
}

/** 只有数学上真有对偶说法的关系才显示「也读作」 */
const CONVERSE_SENTENCE: Partial<Record<Edge['predicate'], (from: string, to: string) => string>> = {
  implies: (from, to) => `${to} 是 ${from} 的必要条件`,
  generalizes: (from, to) => `${to} 是 ${from} 的特例`,
};

const FAMILY_STYLE: Record<string, string> = {
  epistemic: 'text-sky-700',
  evidential: 'text-emerald-700',
  logical: 'text-violet-700',
};

export function AddEdgeDialog({ sourceId, isOpen, onClose }: AddEdgeDialogProps) {
  const index = useGraphStore((state) => state.index);
  const createEdge = useGraphStore((state) => state.createEdge);
  const source = index.nodes.get(sourceId);

  const [target, setTarget] = useState<Node | null>(null);
  const [choice, setChoice] = useState<ApplicablePredicate | null>(null);
  const [condition, setCondition] = useState('');
  const [status, setStatus] = useState<Edge['status']>('asserted');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTarget(null);
    setChoice(null);
    setCondition('');
    setStatus('asserted');
    setNote('');
  }, [isOpen]);

  const options = useMemo(
    () => (source && target ? applicablePredicates(source.type, target.type) : []),
    [source, target],
  );

  const groups = useMemo(
    () =>
      predicatesByFamily()
        .map((group) => ({
          ...group,
          options: options.filter((option) => PREDICATE_SPECS[option.predicate].family === group.family),
        }))
        .filter((group) => group.options.length > 0),
    [options],
  );

  const direction = choice?.reversed ? 'reverse' : 'forward';
  const fromNode = source && target ? (direction === 'reverse' ? target : source) : null;
  const toNode = source && target ? (direction === 'reverse' ? source : target) : null;

  const submit = async () => {
    if (!choice || !fromNode || !toNode) return;
    try {
      await createEdge({
        from: fromNode.id,
        to: toNode.id,
        predicate: choice.predicate,
        condition: condition.trim() || undefined,
        note: note.trim() || undefined,
        status,
      });
      toast.success('关系已创建。');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败。');
    }
  };

  if (!source) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>为「{source.title}」添加关系</DialogTitle>
          <DialogDescription>
            先选目标节点，再选关系。关系方向永远按「主语 → 宾语」存储。
          </DialogDescription>
        </DialogHeader>

        {!target ? (
          <Search autoFocus onSelect={setTarget} placeholder="搜索目标节点…" />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2 rounded border bg-muted/40 px-2 py-1.5 text-sm">
              <NodeBadge type={source.type} />
              <span className="font-medium">{source.title}</span>
              <span className="text-muted-foreground">↔</span>
              <NodeBadge type={target.type} />
              <span className="font-medium">{target.title}</span>
              <Button variant="ghost" size="sm" className="ml-auto h-6" onClick={() => setTarget(null)}>
                换一个
              </Button>
            </div>

            <div className="max-h-64 space-y-2 overflow-auto">
              {groups.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  这两个节点类型之间没有合适的关系。
                </p>
              )}
              {groups.map((group) => (
                <div key={group.family}>
                  <p className={cn('mb-1 text-[11px] font-medium', FAMILY_STYLE[group.family])}>
                    {group.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.map((option) => {
                      const active =
                        choice?.predicate === option.predicate && choice.reversed === option.reversed;
                      const spec = PREDICATE_SPECS[option.predicate];
                      const arrow = option.reversed ? '←' : '→';
                      return (
                        <Button
                          key={`${option.predicate}-${option.reversed ? 'r' : 'f'}`}
                          size="sm"
                          variant={active ? 'default' : 'outline'}
                          onClick={() => setChoice(option)}
                        >
                          {arrow} {spec.fromLabel}
                          {option.reversed && (
                            <span className="ml-1 text-[10px] opacity-70">反向</span>
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {choice && fromNode && toNode && (
              <div className="space-y-2 rounded border bg-muted/30 p-2">
                <p className="text-xs text-muted-foreground">预览</p>
                <p className="text-sm">
                  <span className="font-medium">{fromNode.title}</span>
                  <span className="mx-1 font-mono">
                    {choice.predicate === 'implies'
                      ? '⇒'
                      : choice.predicate === 'iff'
                        ? '⇔'
                        : `—${PREDICATE_SPECS[choice.predicate].fromLabel}→`}
                  </span>
                  <span className="font-medium">{toNode.title}</span>
                </p>
                {CONVERSE_SENTENCE[choice.predicate] && (
                  <p className="text-[11px] text-muted-foreground">
                    也读作：{CONVERSE_SENTENCE[choice.predicate]?.(fromNode.title, toNode.title)}
                  </p>
                )}
                <Input
                  className="h-8 text-sm"
                  placeholder="前提条件（可选，LaTeX）：例如 $f$ 在 $[a,b]$ 上连续"
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    {(['asserted', 'conjecture', 'disproven'] as const).map((value) => (
                      <Button
                        key={value}
                        size="sm"
                        variant={status === value ? 'default' : 'outline'}
                        className="h-7 text-xs"
                        onClick={() => setStatus(value)}
                      >
                        {value === 'asserted' ? '确定' : value === 'conjecture' ? '猜想' : '已推翻'}
                      </Button>
                    ))}
                  </div>
                  <Input
                    className="h-7 flex-1 text-xs"
                    placeholder="备注（可选）"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </div>
            )}

            <p className="text-right text-[11px] text-muted-foreground">
              共 {options.length} 种可用关系
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!choice}>
            创建关系
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default AddEdgeDialog;
