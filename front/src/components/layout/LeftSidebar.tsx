import { useState } from 'react';
import TreeView from '../TreeView';
import { Button } from '../ui/button';
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
import Search from '../Search';

const LeftSidebar = () => {
  const addBranch = useAppStore(state => state.addBranch);
  const [newBranchTitle, setNewBranchTitle] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddBranch = () => {
    if (newBranchTitle.trim()) {
      addBranch(newBranchTitle.trim());
      setNewBranchTitle('');
      setIsDialogOpen(false);
    }
  };

  return (
    <div className="h-full p-4 flex flex-col">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">目录</h2>
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
    </div>
  );
};

export default LeftSidebar;
