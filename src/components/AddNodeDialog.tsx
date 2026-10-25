import { useEffect, useMemo, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { allowedChildTypes, NODE_TYPE_META, SOLUTION_TYPES, type NodeType } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';
import { cn } from '@/lib/utils';

interface AddNodeDialogProps {
  parentId: string | null;
  afterId?: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export function AddNodeDialog({ parentId, afterId, isOpen, onClose }: AddNodeDialogProps) {
  const index = useGraphStore((state) => state.index);
  const createNode = useGraphStore((state) => state.createNode);

  const parent = parentId ? index.nodes.get(parentId) : null;
  const options = useMemo(() => allowedChildTypes(parent?.type ?? null), [parent?.type]);

  const [type, setType] = useState<NodeType>(options[0] ?? 'note');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [solution, setSolution] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setType(allowedChildTypes(parent?.type ?? null)[0] ?? 'note');
    setTitle('');
    setContent('');
    setSolution('');
  }, [isOpen, parent?.type]);

  const submit = async () => {
    try {
      await createNode({
        type,
        title,
        content,
        solution: SOLUTION_TYPES.has(type) ? solution : undefined,
        parentId,
        afterId: afterId ?? null,
      });
      toast.success(`已创建「${title}」。`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败。');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>新建节点</DialogTitle>
          <DialogDescription>
            {parent ? `父节点：${NODE_TYPE_META[parent.type].label}「${parent.title}」` : '新建顶层分支'}
            {afterId ? '（插在当前节点之后）' : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <Button
                key={option}
                size="sm"
                variant={type === option ? 'default' : 'outline'}
                onClick={() => setType(option)}
              >
                {NODE_TYPE_META[option].label}
              </Button>
            ))}
          </div>

          <Input
            autoFocus
            placeholder="标题"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) void submit();
            }}
          />

          <div data-color-mode="light" className={cn('space-y-1')}>
            <span className="text-xs text-muted-foreground">
              {type === 'exercise' || type === 'example' ? '题干（Markdown + LaTeX）' : '内容'}
            </span>
            <MDEditor value={content} onChange={(value) => setContent(value ?? '')} height={160} preview="edit" />
          </div>

          {SOLUTION_TYPES.has(type) && (
            <div data-color-mode="light" className="space-y-1">
              <span className="text-xs text-muted-foreground">
                {type === 'exercise' || type === 'example' ? '标准答案（可选）' : '证明（可选）'}
              </span>
              <MDEditor value={solution} onChange={(value) => setSolution(value ?? '')} height={110} preview="edit" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim()}>
            创建
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AddNodeDialog;
