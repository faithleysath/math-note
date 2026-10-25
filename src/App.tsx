import { useEffect, useState } from 'react';
import { BookOpen, Menu, PanelRight } from 'lucide-react';
import LeftSidebar from '@/components/layout/LeftSidebar';
import MainContent from '@/components/layout/MainContent';
import RightSidebar from '@/components/layout/RightSidebar';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { Toaster } from '@/components/ui/sonner';
import { useHotkeys } from '@/hooks/useHotkeys';
import { useWindowSize } from '@/hooks/useWindowSize';
import { useGraphStore } from '@/stores/useGraphStore';

function LoadingScreen() {
  return (
    <div className="flex h-svh items-center justify-center text-sm text-muted-foreground">
      正在读取本地笔记…
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div className="flex h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-lg font-semibold">打不开这份笔记</p>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
      <Button onClick={() => window.location.assign('/')}>回到本地笔记</Button>
    </div>
  );
}

function App() {
  const status = useGraphStore((state) => state.status);
  const error = useGraphStore((state) => state.error);
  const init = useGraphStore((state) => state.init);
  const loadSnapshot = useGraphStore((state) => state.loadSnapshot);
  const { width } = useWindowSize();
  const isMobile = width <= 768;

  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  useHotkeys();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const noteUrl = params.get('note_url');

    if (!noteUrl) {
      void init();
      return;
    }

    let url = noteUrl;
    if (!/^https?:/i.test(noteUrl)) {
      try {
        url = atob(noteUrl);
      } catch {
        useGraphStore.setState({ status: 'error', error: '分享链接里的地址不合法。' });
        return;
      }
    }

    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`读取快照失败（${response.status}）`);
        const data = await response.json();
        await loadSnapshot(data, '只读分享');
      } catch (caught) {
        useGraphStore.setState({
          status: 'error',
          error: caught instanceof Error ? caught.message : '读取快照失败。',
        });
      }
    })();
  }, [init, loadSnapshot]);

  if (status === 'loading') return <LoadingScreen />;
  if (status === 'error') return <ErrorScreen message={error ?? '未知错误'} />;

  if (isMobile) {
    return (
      <div className="relative flex h-svh w-screen flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLeftOpen(true)}>
            <Menu className="h-4 w-4" />
          </Button>
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">数学笔记</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-8 w-8"
            onClick={() => setRightOpen(true)}
          >
            <PanelRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <MainContent />
        </div>

        <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
          <SheetContent side="left" className="w-[85vw] max-w-sm p-0">
            <SheetTitle className="sr-only">目录</SheetTitle>
            <LeftSidebar />
          </SheetContent>
        </Sheet>
        <Sheet open={rightOpen} onOpenChange={setRightOpen}>
          <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
            <SheetTitle className="sr-only">详情</SheetTitle>
            <RightSidebar />
          </SheetContent>
        </Sheet>
        <Toaster />
      </div>
    );
  }

  return (
    <div className="h-svh w-screen overflow-hidden">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={18} minSize={13} maxSize={30}>
          <LeftSidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={58} minSize={35}>
          <MainContent />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={24} minSize={16} maxSize={36}>
          <RightSidebar />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster />
    </div>
  );
}

export default App;
