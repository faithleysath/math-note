import { useState, useEffect, useMemo } from 'react';
import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { toast } from 'sonner';
import type { Node } from '../../lib/types';
import { useAppStore } from '../../stores/useAppStore';
import { updateNode } from '../../lib/data-provider';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface NodeEditorProps {
  node: Node;
}

const NodeEditor = ({ node }: NodeEditorProps) => {
  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(node.content);
  const [solution, setSolution] = useState(node.solution || '');
  const [tags, setTags] = useState(node.tags?.join(', ') || '');
  const [source, setSource] = useState(node.source || '');
  const setEditingNodeId = useAppStore(state => state.setEditingNodeId);
  const triggerContentRefresh = useAppStore(state => state.triggerContentRefresh);
  const triggerStructureRefresh = useAppStore(state => state.triggerStructureRefresh);

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
  }, [title, content, solution]); // Re-bind when content changes to save the latest state

  useEffect(() => {
    setTitle(node.title);
    setContent(node.content);
    setSolution(node.solution || '');
    setTags(node.tags?.join(', ') || '');
    setSource(node.source || '');
  }, [node]);

  const handleSave = async () => {
    try {
      const tagsArray = tags.split(',').map(tag => tag.trim()).filter(Boolean);
      await updateNode(node.id, { title, content, solution, tags: tagsArray, source });
      toast.success(`节点 "${title}" 已保存。`);
      setEditingNodeId(null); // Exit editing mode
      triggerContentRefresh(); // Trigger a content refresh
      triggerStructureRefresh(); // Trigger a structure refresh
    } catch (error) {
      console.error("Failed to save node:", error);
      if (error instanceof Error && error.message.includes("read-only")) {
        toast.error("无法在只读模式下保存节点。");
      } else {
        toast.error('保存失败。');
      }
    }
  };

  const handleCancel = () => {
    setEditingNodeId(null); // Exit editing mode
  };

  const contentLabel = useMemo(() => {
    switch (node.type) {
      case '例题':
      case '练习':
        return '题干';
      case '定理':
      case '引理':
      case '推论':
        return '陈述';
      default:
        return '内容';
    }
  }, [node.type]);

  const solutionLabel = useMemo(() => {
    switch (node.type) {
      case '例题':
      case '练习':
        return '标准答案';
      case '定理':
      case '引理':
      case '推论':
        return '证明';
      case '解题记录':
        return '个人解法';
      default:
        return '解法';
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

        {['定理', '引理', '推论', '例题', '练习', '解题记录'].includes(node.type) && (
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
