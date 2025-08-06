import { useState, useEffect } from 'react';
import MDEditor from '@uiw/react-md-editor';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Node } from '../../lib/types';
import { useAppStore } from '../../stores/useAppStore';
import { updateNode } from '../../lib/db';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

interface NodeEditorProps {
  node: Node;
}

const NodeEditor = ({ node }: NodeEditorProps) => {
  const [title, setTitle] = useState(node.title);
  const [content, setContent] = useState(node.content);
  const [solution, setSolution] = useState(node.solution || '');
  const setEditingNodeId = useAppStore(state => state.setEditingNodeId);
  const triggerContentRefresh = useAppStore(state => state.triggerContentRefresh);

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
  }, [node]);

  const handleSave = async () => {
    try {
      await updateNode(node.id, { title, content, solution });
      setEditingNodeId(null); // Exit editing mode
      triggerContentRefresh(); // Trigger a content refresh
    } catch (error) {
      console.error("Failed to save node:", error);
      // Handle error UI if necessary
    }
  };

  const handleCancel = () => {
    setEditingNodeId(null); // Exit editing mode
  };

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
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            内容 (题干)
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

        {['定理', '例题', '练习', '解题记录'].includes(node.type) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              解法 / 证明
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
