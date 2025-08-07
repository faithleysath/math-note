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
import { useAppStore } from '../../stores/useAppStore';
import { exportData, importData } from '../../lib/data-provider';
import { toast } from 'sonner';
import Search from '../Search';
import { Upload, Download, Share2, X } from 'lucide-react';
import { useWindowSize } from '@/hooks/useWindowSize';

const LeftSidebar = () => {
  const setMobileView = useAppStore(state => state.setMobileView);
  const { width } = useWindowSize();
  const isMobile = width <= 768;
  const addBranch = useAppStore(state => state.addBranch);
  const fetchRootNodes = useAppStore(state => state.fetchRootNodes);
  const [newBranchTitle, setNewBranchTitle] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToImportRef = useRef<File | null>(null);

  const handleAddBranch = () => {
    if (newBranchTitle.trim()) {
      addBranch(newBranchTitle.trim());
      setNewBranchTitle('');
      setIsDialogOpen(false);
    }
  };

  const handleExport = async () => {
    try {
      const data = await exportData();
      const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(
        JSON.stringify(data, null, 2)
      )}`;
      const link = document.createElement("a");
      link.href = jsonString;
      link.download = `math-note-backup-${new Date().toISOString()}.json`;
      link.click();
      toast.success('数据已成功导出。');
    } catch (error) {
      console.error('Failed to export data:', error);
      toast.error('数据导出失败。');
    }
  };

  const handleShare = async () => {
    setIsSharing(true);
    try {
      const data = await exportData();
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
        // Basic validation
        if (!data.nodes || !data.edges) {
          throw new Error('Invalid data format.');
        }
        await importData(data);
        await fetchRootNodes(); // Manually refetch root nodes to update the tree view
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleShare} disabled={isSharing}>
                  <Share2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>分享 (上传并复制链接)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleImportClick}>
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
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleExport}>
                  <Download className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>导出</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="mb-4">
          <Search />
        </div>
        <div className="flex-grow overflow-y-auto">
          <TreeView />
        </div>
        <div className="mt-4">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="w-full">
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
