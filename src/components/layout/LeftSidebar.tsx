import { useRef, useState } from 'react';
import { BookOpen, Download, Link2, Loader2, Plus, Settings, Sparkles, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { AiConfigDialog } from '@/components/AiConfigDialog';
import { AiHandwritingDialog } from '@/components/AiHandwritingDialog';
import { Search } from '@/components/Search';
import { TreeView } from '@/components/TreeView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ancestorIds } from '@/lib/graph';
import type { Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';

export function LeftSidebar() {
  const index = useGraphStore((state) => state.index);
  const readOnly = useGraphStore((state) => state.readOnly);
  const sourceLabel = useGraphStore((state) => state.sourceLabel);
  const select = useGraphStore((state) => state.select);
  const expandedIds = useGraphStore((state) => state.expandedIds);
  const setExpandedBranch = useGraphStore((state) => state.setExpandedBranch);
  const exportGraph = useGraphStore((state) => state.exportGraph);
  const importGraph = useGraphStore((state) => state.importGraph);
  const loadSample = useGraphStore((state) => state.loadSample);
  const clearAll = useGraphStore((state) => state.clearAll);

  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [branchTitle, setBranchTitle] = useState('');
  const [importData, setImportData] = useState<unknown>(null);
  const [importName, setImportName] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const createBranch = async () => {
    try {
      const node = await useGraphStore.getState().createNode({
        type: 'branch',
        title: branchTitle,
        parentId: null,
      });
      setNewBranchOpen(false);
      setBranchTitle('');
      setExpandedBranch(node.id);
      select(node.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建失败。');
    }
  };

  const jumpTo = (node: Node) => {
    select(node.id);
    const trail = ancestorIds(index, node.id);
    const rootId = trail[0] ?? node.id;
    const next = new Set(expandedIds);
    for (const id of [...trail, node.id]) next.add(id);
    useGraphStore.setState({ expandedIds: next, expandedBranchId: rootId });
  };

  const handleExport = () => {
    const data = exportGraph();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `math-note-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    try {
      const text = await file.text();
      setImportData(JSON.parse(text));
      setImportName(file.name);
    } catch {
      toast.error('这个文件不是合法的 JSON。');
    }
  };

  const confirmImport = async () => {
    try {
      await importGraph(importData);
      setImportData(null);
      toast.success('导入完成。');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导入失败。');
    }
  };

  const handleShare = async () => {
    setSharing(true);
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportGraph()),
      });
      if (!response.ok) throw new Error(await response.text());
      const result = (await response.json()) as { url: string };
      const encoded = btoa(result.url);
      setShareUrl(`${window.location.origin}?note_url=${encoded}`);
    } catch (error) {
      toast.error(
        `分享失败：${error instanceof Error ? error.message : '未知错误'}（本地开发时没有 /api/upload，部署到 Vercel 后才可用）`,
      );
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">数学笔记</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {sourceLabel}
        </span>
      </div>

      <div className="space-y-2 px-2 py-2">
        <Search onSelect={jumpTo} clearOnSelect />
        {!readOnly && (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start text-xs"
            onClick={() => setNewBranchOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            新建分支
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <TreeView />
      </div>

      <div className="grid grid-cols-2 gap-1 border-t p-2 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          disabled={readOnly}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-1 h-3.5 w-3.5" />
          导入
        </Button>
        <Button variant="ghost" size="sm" className="justify-start" onClick={handleExport}>
          <Download className="mr-1 h-3.5 w-3.5" />
          导出
        </Button>
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => void handleShare()} disabled={sharing}>
          {sharing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Link2 className="mr-1 h-3.5 w-3.5" />}
          分享
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          disabled={readOnly}
          onClick={() => setAiOpen(true)}
        >
          <Sparkles className="mr-1 h-3.5 w-3.5" />
          手写导入
        </Button>
        <Button variant="ghost" size="sm" className="justify-start" onClick={() => void loadSample()}>
          <BookOpen className="mr-1 h-3.5 w-3.5" />
          示例
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="justify-start"
          disabled={readOnly}
          onClick={() => setClearOpen(true)}
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" />
          清空
        </Button>
        <div className="col-span-2 flex items-center justify-end">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Settings className="h-3.5 w-3.5" />
            AI 设置
            <AiConfigDialog />
          </span>
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleImportFile(file);
          event.target.value = '';
        }}
      />

      <Dialog open={newBranchOpen} onOpenChange={setNewBranchOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>新建分支</DialogTitle>
            <DialogDescription>分支是最顶层，比如「数学分析」「高等代数」。</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={branchTitle}
            placeholder="分支名"
            onChange={(event) => setBranchTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) void createBranch();
            }}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewBranchOpen(false)}>
              取消
            </Button>
            <Button onClick={() => void createBranch()} disabled={!branchTitle.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={importData !== null} onOpenChange={(open) => (open ? undefined : setImportData(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>导入会覆盖现有数据</AlertDialogTitle>
            <AlertDialogDescription>
              文件：{importName}。导入会清空浏览器里当前的笔记，建议先导出一份备份。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmImport()}>确认导入</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>清空所有笔记？</AlertDialogTitle>
            <AlertDialogDescription>所有节点和关系都会被删除，无法恢复。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void clearAll();
                setClearOpen(false);
              }}
            >
              确认清空
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={Boolean(shareUrl)} onOpenChange={(open) => (open ? undefined : setShareUrl(''))}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>只读分享链接</DialogTitle>
            <DialogDescription>打开这个链接的人只能看，不能改。</DialogDescription>
          </DialogHeader>
          <Input readOnly value={shareUrl} onFocus={(event) => event.target.select()} />
          <DialogFooter>
            <Button
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl);
                toast.success('已复制。');
              }}
            >
              复制链接
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {aiOpen && <AiHandwritingDialog isOpen onClose={() => setAiOpen(false)} />}
    </div>
  );
}

export default LeftSidebar;
