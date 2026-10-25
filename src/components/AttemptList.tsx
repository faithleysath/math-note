import { useState } from 'react';
import { Check, ChevronDown, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MathMarkdown } from '@/components/MathMarkdown';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { childIds } from '@/lib/graph';
import type { Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';
import { cn } from '@/lib/utils';

interface AttemptListProps {
  parent: Node;
  readOnly: boolean;
}

/**
 * 练习 / 例题下面的尝试历史。
 * 「第一次做错、第二次换方法做对」是刷题笔记里最值钱的信息，所以给它一等公民的地位。
 */
export function AttemptList({ parent, readOnly }: AttemptListProps) {
  const index = useGraphStore((state) => state.index);
  const createNode = useGraphStore((state) => state.createNode);
  const deleteSubtree = useGraphStore((state) => state.deleteSubtree);
  const setEditing = useGraphStore((state) => state.setEditing);

  const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [content, setContent] = useState('');
  const [method, setMethod] = useState('');
  const [duration, setDuration] = useState('');
  const [correct, setCorrect] = useState<boolean | null>(null);

  const attempts = childIds(index, parent.id)
    .map((id) => index.nodes.get(id))
    .filter((node): node is Node => node?.type === 'attempt');

  const reset = () => {
    setAdding(false);
    setContent('');
    setMethod('');
    setDuration('');
    setCorrect(null);
  };

  const submit = async () => {
    if (!content.trim()) {
      toast.warning('先写点什么再保存。');
      return;
    }
    try {
      await createNode({
        type: 'attempt',
        title: `第 ${attempts.length + 1} 次尝试`,
        content,
        parentId: parent.id,
        attempt: {
          correct: correct ?? undefined,
          method: method.trim() || undefined,
          durationMin: duration ? Number(duration) : undefined,
        },
      });
      reset();
      toast.success('尝试已记录。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '记录失败。');
    }
  };

  return (
    <div className="mt-3 border-t border-border/60 pt-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>尝试记录（{attempts.length}）</span>
        {!readOnly && (
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setAdding((v) => !v)}>
            <Plus className="mr-1 h-3 w-3" />
            记一次
          </Button>
        )}
      </div>

      {attempts.length > 0 && (
        <ul className="mt-2 space-y-1">
          {attempts.map((attempt) => {
            const open = expanded.includes(attempt.id);
            return (
              <li key={attempt.id} className="rounded border border-rose-200 bg-rose-50/50">
                <div className="flex items-center gap-2 px-2 py-1 text-sm">
                  <button
                    className="flex flex-1 items-center gap-2 text-left"
                    onClick={() =>
                      setExpanded((prev) =>
                        open ? prev.filter((id) => id !== attempt.id) : [...prev, attempt.id],
                      )
                    }
                  >
                    <ChevronDown className={cn('h-3 w-3 transition-transform', open && 'rotate-180')} />
                    <span className="font-medium text-rose-800">{attempt.title}</span>
                    {attempt.attempt?.correct === true && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1 text-[11px] text-emerald-700">
                        <Check className="h-3 w-3" />对
                      </span>
                    )}
                    {attempt.attempt?.correct === false && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-rose-100 px-1 text-[11px] text-rose-700">
                        <X className="h-3 w-3" />错
                      </span>
                    )}
                    {attempt.attempt?.method && (
                      <span className="rounded bg-muted px-1 text-[11px] text-muted-foreground">
                        {attempt.attempt.method}
                      </span>
                    )}
                    {typeof attempt.attempt?.durationMin === 'number' && (
                      <span className="text-[11px] text-muted-foreground">
                        {attempt.attempt.durationMin} 分钟
                      </span>
                    )}
                  </button>
                  {!readOnly && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setEditing(attempt.id)}
                        title="编辑"
                      >
                        <span className="text-[11px]">改</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => {
                          void deleteSubtree(attempt.id);
                        }}
                        title="删除"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
                {open && (
                  <div className="border-t border-rose-200/60 px-3 py-2">
                    <MathMarkdown source={attempt.content} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && !readOnly && (
        <div className="mt-2 space-y-2 rounded border border-dashed border-border p-2">
          <textarea
            className="min-h-[80px] w-full resize-y rounded border bg-background p-2 text-sm"
            placeholder="这次是怎么想的？卡在哪一步？"
            value={content}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Input
              className="h-7 w-28"
              placeholder="方法（反证法…）"
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
            <Input
              className="h-7 w-20"
              placeholder="用时(分)"
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value.replace(/[^0-9]/g, ''))}
            />
            <div className="flex items-center gap-1">
              {[
                { label: '做对', value: true },
                { label: '做错', value: false },
              ].map((option) => (
                <Button
                  key={option.label}
                  size="sm"
                  variant={correct === option.value ? 'default' : 'outline'}
                  className="h-7 px-2 text-xs"
                  onClick={() => setCorrect(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" className="h-7" onClick={reset}>
                取消
              </Button>
              <Button size="sm" className="h-7" onClick={() => void submit()}>
                保存
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
