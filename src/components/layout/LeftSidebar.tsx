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
import { Upload, Download, X, Plus, BookPlus, Pencil, ImagePlus } from 'lucide-react';
import { SCHOOL_STAGES, STAGE_LABELS, SUBJECTS, SUBJECT_LABELS, type SchoolStage, type Subject } from '../../lib/schema';
import { EXCHANGE_MIME, exchangeFileName, isExchangeFileName, readExchangePackage, toArrayBuffer } from '../../lib/exchange';
import { useWindowSize } from '@/hooks/useWindowSize';

const LeftSidebar = () => {
  const setMobileView = useGraphStore(state => state.setMobileView);
  const setExpandedBranch = useGraphStore(state => state.setExpandedBranch);
  const createNode = useGraphStore(state => state.createNode);
  const createBook = useGraphStore(state => state.createBook);
  const updateBook = useGraphStore(state => state.updateBook);
  const book = useGraphStore(state => state.book);
  const index = useGraphStore(state => state.index);
  const exportExchangePackage = useGraphStore(state => state.exportExchangePackage);
  const importGraph = useGraphStore(state => state.importGraph);
  const loadAssetFiles = useGraphStore(state => state.loadAssetFiles);
  const assetCount = useGraphStore(state => state.assetCount);
  const missingAssetIds = useGraphStore(state => state.missingAssetIds);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToImportRef = useRef<File | null>(null);
  const assetInputRef = useRef<HTMLInputElement>(null);

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

  const handleExport = async () => {
    try {
      const bytes = await exportExchangePackage();
      const blob = new Blob([toArrayBuffer(bytes)], { type: EXCHANGE_MIME });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exchangeFileName(book?.title);
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.success('交换包（.tbg，含图片）已导出。');
    } catch (error) {
      console.error('Failed to export data:', error);
      toast.error(error instanceof Error ? error.message : '数据导出失败。');
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

    try {
      if (isExchangeFileName(file.name, file.type)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const pkg = await readExchangePackage(bytes);
        await importGraph(pkg.graph, { assets: pkg.assets });
        toast.success(
          `交换包已导入：${pkg.manifest.counts.nodes} 个节点 / ${pkg.manifest.counts.edges} 条关系 / ${pkg.assets.length} 张图。`,
        );
      } else {
        const text = await file.text();
        const data = JSON.parse(text);
        await importGraph(data);
        toast.success('JSON 数据已导入；图片可在左侧「载入图片…」补充。');
      }
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

  const handleAssetFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const files = Array.from(input.files ?? []);
    // 清空 value：不重置的话，再选同一批文件不会触发 change
    input.value = '';
    if (files.length === 0) return;

    try {
      const result = await loadAssetFiles(files);
      const failed = result.badHash.length + result.unknown.length + result.tooLarge.length;
      const notes: string[] = [];
      if (result.matched > 0) {
        notes.push(failed === 0 ? `${result.matched} 张全部匹配` : `${result.matched} 张匹配成功`);
      }
      if (result.badHash.length > 0) {
        notes.push(`${result.badHash.length} 张哈希不符：${result.badHash.join(', ')}`);
      }
      if (result.unknown.length > 0) {
        notes.push(`${result.unknown.length} 个文件不属于本书`);
      }
      if (result.tooLarge.length > 0) {
        notes.push(`${result.tooLarge.length} 张超过 8 MiB，已跳过`);
      }
      if (notes.length === 0) return;
      if (failed > 0) toast.warning(notes.join('；'));
      else toast.success(notes.join('；'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '载入图片失败。');
    }
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
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="导入" onClick={handleImportClick}>
                  <Upload className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>导入（.tbg 交换包 / .json）</p>
              </TooltipContent>
            </Tooltip>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".tbg,.json,application/x-textbook-graph,application/json"
              className="hidden"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="导出" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>导出交换包（.tbg，含图片）</p>
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
          {book && (
            <div className="mt-2 flex items-center justify-between gap-2 border-t pt-2">
              <span className="min-w-0 truncate text-[11px] text-muted-foreground">
                {assetCount === 0
                  ? '无本地资源'
                  : missingAssetIds.length > 0
                    ? `资源 ${assetCount} 张 · 缺 ${missingAssetIds.length} 张`
                    : `资源 ${assetCount} 张`}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-6 shrink-0 gap-1 px-2 text-[11px]"
                onClick={() => assetInputRef.current?.click()}
              >
                <ImagePlus className="h-3 w-3" />
                载入图片…
              </Button>
              <input
                ref={assetInputRef}
                type="file"
                multiple
                accept="image/*"
                className="hidden"
                onChange={handleAssetFiles}
              />
            </div>
          )}
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
        <AlertDialog open={isImportConfirmOpen} onOpenChange={setIsImportConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认导入？</AlertDialogTitle>
              <AlertDialogDescription>
                支持 .tbg 交换包（数据 + 图片）和旧版 .json（只有数据）。导入会覆盖当前所有数据，此操作无法撤销；失败不会改动原数据。
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
