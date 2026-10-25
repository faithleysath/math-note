import { useEffect, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SOLUTION_TYPES, type Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';

interface NodeEditorProps {
  node: Node;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function NodeEditor({ node }: NodeEditorProps) {
  const updateNode = useGraphStore((state) => state.updateNode);
  const setEditing = useGraphStore((state) => state.setEditing);

  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(node.content);
  const [solution, setSolution] = useState(node.solution ?? '');
  const [key, setKey] = useState(node.key ?? '');
  const [aliases, setAliases] = useState((node.aliases ?? []).join(', '));
  const [tags, setTags] = useState((node.tags ?? []).join(', '));
  const [book, setBook] = useState(node.citation?.book ?? '');
  const [page, setPage] = useState(node.citation?.page ?? '');
  const [theoremNo, setTheoremNo] = useState(node.citation?.theoremNo ?? '');
  const [method, setMethod] = useState(node.attempt?.method ?? '');
  const [duration, setDuration] = useState(
    node.attempt?.durationMin != null ? String(node.attempt.durationMin) : '',
  );
  const [correct, setCorrect] = useState<boolean | null>(node.attempt?.correct ?? null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(node.title);
    setContent(node.content);
    setSolution(node.solution ?? '');
    setKey(node.key ?? '');
    setAliases((node.aliases ?? []).join(', '));
    setTags((node.tags ?? []).join(', '));
    setBook(node.citation?.book ?? '');
    setPage(node.citation?.page ?? '');
    setTheoremNo(node.citation?.theoremNo ?? '');
    setMethod(node.attempt?.method ?? '');
    setDuration(node.attempt?.durationMin != null ? String(node.attempt.durationMin) : '');
    setCorrect(node.attempt?.correct ?? null);
  }, [node]);

  const splitList = (value: string) =>
    value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const citation = book || page || theoremNo ? { book, page, theoremNo } : undefined;
      await updateNode(node.id, {
        title,
        content,
        solution: SOLUTION_TYPES.has(node.type) || solution ? solution : undefined,
        key: key.trim() ? key.trim() : null,
        aliases: splitList(aliases),
        tags: splitList(tags),
        citation,
        attempt:
          node.type === 'attempt'
            ? {
                correct: correct ?? undefined,
                method: method.trim() || undefined,
                durationMin: duration ? Number(duration) : undefined,
              }
            : undefined,
      });
      toast.success('已保存。');
      setEditing(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存失败。');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void save();
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setEditing(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  return (
    <div className="space-y-3 rounded-md border border-primary/30 bg-background p-3 shadow-sm">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="标题">
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </Field>
        <Field label="术语键（可选，全局唯一，用于跨章节引用）">
          <Input
            value={key}
            placeholder="power-set"
            onChange={(event) => setKey(event.target.value)}
          />
        </Field>
      </div>

      <div data-color-mode="light">
        <span className="text-xs font-medium text-muted-foreground">
          {node.type === 'exercise' || node.type === 'example' ? '题干' : '内容'}
        </span>
        <MDEditor value={content} onChange={(value) => setContent(value ?? '')} height={180} preview="edit" />
      </div>

      {(SOLUTION_TYPES.has(node.type) || solution) && (
        <div data-color-mode="light">
          <span className="text-xs font-medium text-muted-foreground">
            {node.type === 'exercise' || node.type === 'example' ? '标准答案' : '证明'}
          </span>
          <MDEditor value={solution} onChange={(value) => setSolution(value ?? '')} height={140} preview="edit" />
        </div>
      )}

      {node.type === 'attempt' && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="方法">
            <Input className="h-8 w-40" value={method} onChange={(event) => setMethod(event.target.value)} />
          </Field>
          <Field label="用时（分钟）">
            <Input
              className="h-8 w-24"
              inputMode="numeric"
              value={duration}
              onChange={(event) => setDuration(event.target.value.replace(/[^0-9]/g, ''))}
            />
          </Field>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant={correct === true ? 'default' : 'outline'}
              className="h-8"
              onClick={() => setCorrect(true)}
            >
              做对
            </Button>
            <Button
              size="sm"
              variant={correct === false ? 'default' : 'outline'}
              className="h-8"
              onClick={() => setCorrect(false)}
            >
              做错
            </Button>
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setCorrect(null)}>
              清除
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="别名（逗号分隔，参与搜索）">
          <Input value={aliases} onChange={(event) => setAliases(event.target.value)} />
        </Field>
        <Field label="标签（逗号分隔）">
          <Input value={tags} onChange={(event) => setTags(event.target.value)} />
        </Field>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Field label="出处：书">
          <Input value={book} onChange={(event) => setBook(event.target.value)} />
        </Field>
        <Field label="页码">
          <Input value={page} onChange={(event) => setPage(event.target.value)} />
        </Field>
        <Field label="定理号">
          <Input value={theoremNo} onChange={(event) => setTheoremNo(event.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>
          取消 (Esc)
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          保存 (⌘S)
        </Button>
      </div>
    </div>
  );
}

export default NodeEditor;
