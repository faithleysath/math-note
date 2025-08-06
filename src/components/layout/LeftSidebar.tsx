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
import { Upload, Download, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const expirationOptions = [
  { label: '30 分钟', value: 1800 },
  { label: '1 小时', value: 3600 },
  { label: '1 天', value: 86400 },
  { label: '7 天', value: 604800 },
  { label: '永久', value: 3153600000 }, // 100 year as "permanent"
];

type Unit = 'minutes' | 'hours' | 'days';

const LeftSidebar = () => {
  const addBranch = useAppStore(state => state.addBranch);
  const fetchRootNodes = useAppStore(state => state.fetchRootNodes);
  const [newBranchTitle, setNewBranchTitle] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isExpirationDialogOpen, setIsExpirationDialogOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileToImportRef = useRef<File | null>(null);

  // State for custom expiration
  const [customDuration, setCustomDuration] = useState<number | ''>('');
  const [customUnit, setCustomUnit] = useState<Unit>('hours');

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

  const handleShare = async (expirationInSeconds: number) => {
    if (expirationInSeconds < 60) {
      toast.warning('有效期最短为 1 分钟。');
      return;
    }
    setIsSharing(true);
    setIsExpirationDialogOpen(false); // Close the selection dialog
    try {
      const data = await exportData();
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, expirationInSeconds }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }

      const result = await response.json();
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

  const handleCustomShare = () => {
    if (typeof customDuration !== 'number' || customDuration <= 0) {
      toast.warning('请输入一个有效的持续时间。');
      return;
    }
    let seconds = 0;
    switch (customUnit) {
      case 'minutes':
        seconds = customDuration * 60;
        break;
      case 'hours':
        seconds = customDuration * 3600;
        break;
      case 'days':
        seconds = customDuration * 86400;
        break;
    }
    handleShare(seconds);
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
        if (!data.nodes || !data.edges) {
          throw new Error('Invalid data format.');
        }
        await importData(data);
        await fetchRootNodes();
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsExpirationDialogOpen(true)} disabled={isSharing}>
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

        {/* Expiration Selection Dialog */}
        <Dialog open={isExpirationDialogOpen} onOpenChange={setIsExpirationDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>选择分享有效期</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="flex justify-center flex-wrap gap-2">
                {expirationOptions.map(option => (
                  <Button key={option.value} onClick={() => handleShare(option.value)} disabled={isSharing}>
                    {option.label}
                  </Button>
                ))}
              </div>
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    或自定义
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Input
                  type="number"
                  placeholder="例如: 2"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className="w-1/2"
                />
                <div className="flex items-center rounded-md border p-1">
                  <Button variant="ghost" size="sm" onClick={() => setCustomUnit('minutes')} className={cn(customUnit === 'minutes' && 'bg-muted')}>分钟</Button>
                  <Button variant="ghost" size="sm" onClick={() => setCustomUnit('hours')} className={cn(customUnit === 'hours' && 'bg-muted')}>小时</Button>
                  <Button variant="ghost" size="sm" onClick={() => setCustomUnit('days')} className={cn(customUnit === 'days' && 'bg-muted')}>天</Button>
                </div>
              </div>
               <Button onClick={handleCustomShare} disabled={isSharing} className="w-full">
                确认并分享
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Share Link Dialog */}
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
