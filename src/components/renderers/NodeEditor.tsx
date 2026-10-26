import { useState, useEffect, useMemo } from 'react';
import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { toast } from 'sonner';
import { KIND_LABELS, KIND_OPTIONS, type Node } from '../../lib/schema';
import { mergeCitation } from '../../lib/citation';
import { useGraphStore } from '../../stores/useGraphStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface NodeEditorProps {
  node: Node;
}

const KEY_TYPES: Node['type'][] = ['definition', 'proposition'];
const SOLUTION_TYPES: Node['type'][] = ['problem'];

const NodeEditor = ({ node }: NodeEditorProps) => {
  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(node.content);
  const [solution, setSolution] = useState(node.solution || '');
  const [tags, setTags] = useState(node.tags?.join(', ') || '');
  const [source, setSource] = useState(node.citation?.source || '');
  const [kind, setKind] = useState(node.kind || '');
  const [key, setKey] = useState(node.key || '');
  const [aliases, setAliases] = useState(node.aliases?.join(', ') || '');
  const [method, setMethod] = useState(node.attempt?.method || '');
  const [duration, setDuration] = useState(
    node.attempt?.durationMin != null ? String(node.attempt.durationMin) : '',
  );
  const [correct, setCorrect] = useState<boolean | null>(node.attempt?.correct ?? null);

  const setEditing = useGraphStore((state) => state.setEditing);
  const updateNode = useGraphStore((state) => state.updateNode);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Save with Cmd/Ctrl + S
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        handleSave();
      }
      // Cancel with Escape
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, solution, key, aliases, kind, tags, source, method, duration, correct]); // Re-bind when content changes to save the latest state

  useEffect(() => {
    setTitle(node.title);
    setContent(node.content);
    setSolution(node.solution || '');
    setTags(node.tags?.join(', ') || '');
    setSource(node.citation?.source || '');
    setKind(node.kind || '');
    setKey(node.key || '');
    setAliases(node.aliases?.join(', ') || '');
    setMethod(node.attempt?.method || '');
    setDuration(node.attempt?.durationMin != null ? String(node.attempt.durationMin) : '');
    setCorrect(node.attempt?.correct ?? null);
  }, [node]);

  const handleSave = async () => {
    try {
      const tagsArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      const aliasesArray = aliases.split(',').map(alias => alias.trim()).filter(Boolean);
      await updateNode(node.id, {
        title,
        content,
        // 只有题目有标准答案；命题的证明是独立的 proof 节点
        solution: SOLUTION_TYPES.includes(node.type) ? solution : undefined,
        tags: tagsArray,
        aliases: aliasesArray,
        key: key.trim() || null,
        // 只改来源名称，保留 page / originalNumber；全空时清掉 citation
        citation: mergeCitation(node.citation, source),
        kind: kind || undefined,
        attempt:
          node.type === 'attempt'
            ? {
                correct: correct ?? undefined,
                method: method.trim() || undefined,
                durationMin: duration ? Number(duration) : undefined,
              }
            : undefined,
      });
      toast.success(`节点 "${title}" 已保存。`);
      setEditing(null); // Exit editing mode
    } catch (error) {
      console.error("Failed to save node:", error);
      toast.error(error instanceof Error ? error.message : '保存失败。');
    }
  };

  const handleCancel = () => {
    setEditing(null); // Exit editing mode
  };

  const contentLabel = useMemo(() => {
    switch (node.type) {
      case 'problem':
        return '题干';
      case 'proposition':
        return '陈述';
      case 'proof':
        return '证明正文';
      default:
        return '内容';
    }
  }, [node.type]);

  const solutionLabel = useMemo(() => {
    switch (node.type) {
      case 'problem':
        return '标准答案';
      default:
        return '解答';
    }
  }, [node.type]);

  return (
    <div className="p-4 border rounded-lg bg-slate-50 dark:bg-slate-900">
      <div className="space-y-4">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            标题
          </label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="text-lg"
          />
        </div>

        {KIND_OPTIONS[node.type].length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              细分 (kind)
            </label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="">未指定</option>
              {KIND_OPTIONS[node.type].map((option) => (
                <option key={option} value={option}>
                  {KIND_LABELS[option] ?? option}
                </option>
              ))}
            </select>
          </div>
        )}

        {KEY_TYPES.includes(node.type) && (
          <div>
            <label htmlFor="key" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              术语键 (全局唯一，可留空)
            </label>
            <Input
              id="key"
              value={key}
              placeholder="power-set"
              onChange={(e) => setKey(e.target.value)}
            />
          </div>
        )}

        <div>
          <label htmlFor="aliases" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            别名 (用逗号分隔)
          </label>
          <Input
            id="aliases"
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="tags" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            标签 (用逗号分隔)
          </label>
          <Input
            id="tags"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="source" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            来源
          </label>
          <Input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
        </div>

        {node.type === 'attempt' && (
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                结果
              </label>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant={correct === true ? 'default' : 'outline'}
                  onClick={() => setCorrect(true)}
                >
                  做对
                </Button>
                <Button
                  size="sm"
                  variant={correct === false ? 'default' : 'outline'}
                  onClick={() => setCorrect(false)}
                >
                  做错
                </Button>
              </div>
            </div>
            <div>
              <label htmlFor="method" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                方法
              </label>
              <Input
                id="method"
                value={method}
                className="w-40"
                onChange={(e) => setMethod(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="duration" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                用时 (分钟)
              </label>
              <Input
                id="duration"
                value={duration}
                className="w-24"
                inputMode="numeric"
                onChange={(e) => setDuration(e.target.value.replace(/[^0-9]/g, ''))}
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            {contentLabel}
          </label>
          <MDEditor
            value={content}
            onChange={(val) => setContent(val || '')}
            preview="live"
            previewOptions={{
              remarkPlugins: [remarkMath],
              rehypePlugins: [[rehypeKatex, { throwOnError: false }]],
            }}
          />
        </div>

        {SOLUTION_TYPES.includes(node.type) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {solutionLabel}
            </label>
            <MDEditor
              value={solution}
              onChange={(val) => setSolution(val || '')}
              preview="live"
              previewOptions={{
                remarkPlugins: [remarkMath],
                rehypePlugins: [[rehypeKatex, { throwOnError: false }]],
              }}
            />
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-2 mt-4">
        <Button onClick={handleCancel} variant="outline">
          取消
        </Button>
        <Button onClick={handleSave}>
          保存
        </Button>
      </div>
    </div>
  );
};

export default NodeEditor;
