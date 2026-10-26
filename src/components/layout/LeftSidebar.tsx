import { useState, useRef } from 'react';
import TreeView from '../TreeView';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '../ui/dialog';
import { Input } from '../ui/input';
import { useGraphStore } from '../../stores/useGraphStore';
import { toast } from 'sonner';
import Search from '../Search';
import { Upload, Download, Share2, X, Plus, BookPlus, Pencil } from 'lucide-react';
import { SCHOOL_STAGES, STAGE_LABELS, SUBJECTS, SUBJECT_LABELS, type SchoolStage, type Subject } from '../../lib/schema';
import { useWindowSize } from '@/hooks/useWindowSize';

const LeftSidebar = () => {
  const setMobileView = useGraphStore(state => state.setMobileView);
  const setExpandedBranch = useGraphStore(state => state.setExpandedBranch);
  const createNode = useGraphStore(state => state.createNode);
  const createBook = useGraphStore(state => state.createBook);
  const updateBook = useGraphStore(state => state.updateBook);
  const book = useGraphStore(state => state.book);
  const index = useGraphStore(state => state.index);
  const exportGraph = useGraphStore(state => state.exportGraph);
  const importGraph = useGraphStore(state => state.importGraph);
  const { width } = useWindowSize();
  const isMobile = width <= 768;
  const [newBranchTitle, setNewBranchTitle] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isBookDialogOpen, setIsBookDialogOpen] = useState(false);
  const [isBookConfirmOpen, setIsBookConfirmOpen] = useState(false);
  const [isEditingBook, setIsEditingBook] = useState(false);
  const [bookTitle, setBookTitle] = useState('');
  const [bookSubject, setBookSubject] = useState<Subject>('math');
  const [bookStage, setBookStage] = useState<SchoolStage>('senior');
  const [bookEdition, setBookEdition] = useState('');
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToImportRef = useRef<File | null>(null);

  const handleAddBranch = async () => {
    if (!book) {
      toast.warning('请先新建或导入教材。');
      return;
    }
    if (!newBranchTitle.trim()) return;
    try {
      const node = await createNode({
        title: newBranchTitle.trim(),
        type: 'branch',
        parentId: null,
      });
      setExpandedBranch(node.id);
      setNewBranchTitle('');
      setIsDialogOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建分支失败。');
    }
  };

  const handleExport = () => {
    try {
      const data = exportGraph();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(data, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      const safeTitle = (book?.title ?? 'backup').replace(/[\\/:*?"<>|\s]+/g, '-');
      link.download = `textbook-graph-${safeTitle}-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      toast.success('数据已成功导出。');
    } catch (error) {
      console.error('Failed to export data:', error);
      toast.error(error instanceof Error ? error.message : '数据导出失败。');
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const data = exportGraph();
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const result = await response.json();
      // Encode the URL in Base64 to make it cleaner
      const encodedUrl = btoa(result.url);
      const fullShareUrl = `${window.location.origin}?note_url=${encodedUrl}`;

      setShareUrl(fullShareUrl);
      setIsShareDialogOpen(true);

    } catch (error) {
      console.error('Failed to share data:', error);
      toast.error(`分享失败: ${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      setIsSharing(false);
    }
  };

  const resetBookForm = () => {
    setBookTitle('');
    setBookSubject('math');
    setBookStage('senior');
    setBookEdition('');
    setIsBookConfirmOpen(false);
    setIsEditingBook(false);
  };

  const openEditBook = () => {
    if (!book) return;
    setBookTitle(book.title);
    setBookSubject(book.subject);
    setBookStage(book.stage);
    setBookEdition(book.edition ?? '');
    setIsEditingBook(true);
    setIsBookDialogOpen(true);
  };

  const performCreateBook = async () => {
    try {
      await createBook({
        title: bookTitle,
        subject: bookSubject,
        stage: bookStage,
        edition: bookEdition.trim() || undefined,
      });
      toast.success(`教材「${bookTitle.trim()}」已创建。`);
      setIsBookDialogOpen(false);
      setIsBookConfirmOpen(false);
      resetBookForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '创建教材失败。');
    }
  };

  const performUpdateBook = async () => {
    try {
      await updateBook({
        title: bookTitle,
        subject: bookSubject,
        stage: bookStage,
        edition: bookEdition.trim() || undefined,
      });
      toast.success('教材信息已更新。');
      setIsBookDialogOpen(false);
      resetBookForm();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '更新教材信息失败。');
    }
  };

  const handleSubmitBook = async () => {
    if (!bookTitle.trim()) {
      toast.warning('请填写教材名称。');
      return;
    }
    if (isEditingBook) {
      await performUpdateBook();
      return;
    }
    if (index.nodes.size > 0) {
      setIsBookConfirmOpen(true);
      return;
    }
    await performCreateBook();
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      fileToImportRef.current = file;
      setIsImportConfirmOpen(true);
    }
  };

  const confirmImport = async () => {
    const file = fileToImportRef.current;
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const text = e.target?.result;
        if (typeof text !== 'string') {
          throw new Error('File content is not a string.');
        }
        const data = JSON.parse(text);
        await importGraph(data);
        toast.success('数据已成功导入。');
      } catch (error) {
        console.error('Failed to import data:', error);
        toast.error(`数据导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      } finally {
        setIsImportConfirmOpen(false);
        fileToImportRef.current = null;
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <TooltipProvider>
      <div className="h-full p-4 flex flex-col">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">目录</h2>
          <div className="flex items-center space-x-1">
            {isMobile && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileView('main')}>
                <X className="h-4 w-4" />
              </Button>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  aria-label="新建教材"
                  onClick={() => {
                    resetBookForm();
                    setIsBookDialogOpen(true);
                  }}
                >
                  <BookPlus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>新建教材</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="分享" onClick={handleShare} disabled={isSharing}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>分享 (上传并复制链接)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="导入" onClick={handleImportClick}>
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>导入</p>
              </TooltipContent>
            </Tooltip>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="导出" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>导出</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mb-3 rounded-md border px-2.5 py-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{book?.title ?? '还没有教材'}</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {book
                  ? [SUBJECT_LABELS[book.subject], STAGE_LABELS[book.stage], book.edition]
                      .filter(Boolean)
                      .join(' · ')
                  : '新建或导入一本教材后开始录入'}
              </p>
            </div>
            {book && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                aria-label="编辑教材信息"
                onClick={openEditBook}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        <div className="mb-4">
          <Search showFilters />
        </div>
        <div className="flex-grow overflow-y-auto min-h-0">
          <TreeView />
        </div>
        <div className="mt-4 flex-shrink-0">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="w-full"
                disabled={!book}
                title={!book ? '请先新建或导入教材' : undefined}
              >
                <Plus className="mr-2 h-4 w-4" />
                添加分支
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>创建新分支</DialogTitle>
              </DialogHeader>
              <div className="py-4">
                <Input
                  placeholder="请输入分支名称"
                  value={newBranchTitle}
                  onChange={(e) => setNewBranchTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddBranch()}
                />
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">
                    取消
                  </Button>
                </DialogClose>
                <Button onClick={handleAddBranch}>
                  创建
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Dialog open={isBookDialogOpen} onOpenChange={(open) => {
          setIsBookDialogOpen(open);
          if (!open) resetBookForm();
        }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingBook ? '编辑教材信息' : '新建教材'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-4">
              <div>
                <label htmlFor="book-title" className="mb-1 block text-sm font-medium">
                  教材名称
                </label>
                <Input
                  id="book-title"
                  value={bookTitle}
                  placeholder="如：九年级物理下册"
                  onChange={(e) => setBookTitle(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="book-subject" className="mb-1 block text-sm font-medium">
                    学科
                  </label>
                  <select
                    id="book-subject"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={bookSubject}
                    onChange={(e) => setBookSubject(e.target.value as Subject)}
                  >
                    {SUBJECTS.map((subject) => (
                      <option key={subject} value={subject}>
                        {SUBJECT_LABELS[subject]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="book-stage" className="mb-1 block text-sm font-medium">
                    学段
                  </label>
                  <select
                    id="book-stage"
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    value={bookStage}
                    onChange={(e) => setBookStage(e.target.value as SchoolStage)}
                  >
                    {SCHOOL_STAGES.map((stage) => (
                      <option key={stage} value={stage}>
                        {STAGE_LABELS[stage]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label htmlFor="book-edition" className="mb-1 block text-sm font-medium">
                  版本说明（可选）
                </label>
                <Input
                  id="book-edition"
                  value={bookEdition}
                  placeholder="如：人教版"
                  onChange={(e) => setBookEdition(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {isEditingBook
                  ? '修改学科或学段后，分类推荐和编号策略会立即按新配置显示。'
                  : '一本教材一份独立知识库。新建会替换当前浏览器里的活动教材。'}
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  取消
                </Button>
              </DialogClose>
              <Button onClick={handleSubmitBook}>{isEditingBook ? '保存' : '创建'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={isBookConfirmOpen} onOpenChange={setIsBookConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>替换当前教材？</AlertDialogTitle>
              <AlertDialogDescription>
                当前活动知识库里的节点、关系和推理步骤都会被清空。请先导出备份。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsBookConfirmOpen(false)}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={performCreateBook}>确认替换</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>分享链接</DialogTitle>
            </DialogHeader>
            <div className="py-4 flex items-center space-x-2">
              <Input value={shareUrl} readOnly />
              <Button onClick={() => {
                navigator.clipboard.writeText(shareUrl);
                toast.success('链接已复制到剪贴板。');
              }}>
                复制
              </Button>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  关闭
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog open={isImportConfirmOpen} onOpenChange={setIsImportConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认导入？</AlertDialogTitle>
              <AlertDialogDescription>
                这将覆盖您当前的所有数据，此操作无法撤销。请确保您已备份当前数据。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setIsImportConfirmOpen(false)}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={confirmImport}>确认导入</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

export default LeftSidebar;
