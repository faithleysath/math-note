import { useEffect, useState, useRef } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import LeftSidebar from "./components/layout/LeftSidebar"
import MainContent from "./components/layout/MainContent"
import RightSidebar from "./components/layout/RightSidebar"
import { useGraphStore } from "./stores/useGraphStore"
import { useHotkeys } from "./hooks/useHotkeys"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "./components/ui/button"
import { useWindowSize } from "./hooks/useWindowSize"
import { PanelLeft, PanelRight } from "lucide-react"
import { cn } from "./lib/utils"

const NotFoundPage = () => (
  <div className="h-screen w-screen bg-background text-foreground flex flex-col items-center justify-center space-y-4">
    <h1 className="text-4xl font-bold">404</h1>
    <p className="text-muted-foreground">找不到请求的笔记，它可能已过期或链接不正确。</p>
    <Button onClick={() => window.location.href = '/'}>返回主页</Button>
  </div>
);

function App() {
  const status = useGraphStore(state => state.status);
  const init = useGraphStore(state => state.init);
  const loadSnapshot = useGraphStore(state => state.loadSnapshot);
  const mobileView = useGraphStore(state => state.mobileView);
  const setMobileView = useGraphStore(state => state.setMobileView);
  const { width } = useWindowSize();
  const isMobile = width <= 768;
  const [showFabs, setShowFabs] = useState(false);
  const fabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useHotkeys();

  useEffect(() => {
    // Cleanup timer on component unmount
    return () => {
      if (fabTimer.current) {
        clearTimeout(fabTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    const initializeApp = async () => {
      const params = new URLSearchParams(window.location.search);
      const noteUrl = params.get('note_url');

      if (noteUrl) {
        let urlToLoad: string | null;
        // First, try to treat it as a direct URL
        try {
          new URL(noteUrl); // Validate if it's a full URL
          urlToLoad = noteUrl;
        } catch {
          // If it's not a valid URL, assume it's Base64 encoded
          try {
            urlToLoad = atob(noteUrl);
          } catch (error) {
            console.error("Invalid Base64 in note_url, ignoring:", error);
            urlToLoad = null;
          }
        }

        if (urlToLoad) {
          try {
            const response = await fetch(urlToLoad);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            await loadSnapshot(data, '只读分享');
          } catch (caught) {
            useGraphStore.setState({
              status: 'error',
              error: caught instanceof Error ? caught.message : '读取分享的笔记失败。',
            });
          }
        } else {
          // If note_url was present but invalid, show 404
          useGraphStore.setState({ status: 'error', error: '分享链接里的地址不合法。' });
        }
      } else {
        // If no URL parameter is found, load local data
        await init();
      }
    };

    initializeApp();
    // The dependency array is intentionally left empty to run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === 'error') {
    return <NotFoundPage />;
  }

  const handleTouchStart = () => {
    if (!isMobile) return;
    if (fabTimer.current) {
      clearTimeout(fabTimer.current);
    }
    setShowFabs(true);
    fabTimer.current = setTimeout(() => {
      setShowFabs(false);
    }, 1500); // Hide after 1.5 seconds
  };

  if (isMobile) {
    return (
      <div className="h-svh w-screen bg-background text-foreground relative overflow-hidden">
        {/* Main Content Area */}
        <div
          className={cn(
            "h-full w-full transition-filter duration-300",
            mobileView !== 'main' && "blur-sm"
          )}
          onTouchStart={handleTouchStart}
        >
          <MainContent />
        </div>

        {/* Left Sidebar Overlay */}
        <div className={cn(
          "absolute inset-0 z-20 bg-background/80 backdrop-blur-sm transition-transform duration-300 ease-in-out",
          mobileView === 'left' ? 'translate-x-0' : '-translate-x-full'
        )}>
          <LeftSidebar />
        </div>

        {/* Right Sidebar Overlay */}
        <div className={cn(
          "absolute inset-0 z-20 bg-background/80 backdrop-blur-sm transition-transform duration-300 ease-in-out",
          mobileView === 'right' ? 'translate-x-0' : 'translate-x-full'
        )}>
          <RightSidebar />
        </div>

        {/* Floating Action Buttons */}
        {mobileView === 'main' && showFabs && (
          <>
            <div className="absolute left-4 top-1/2 -translate-y-1/2 z-30 animate-in fade-in duration-300">
              <Button
                size="icon"
                onClick={() => setMobileView('left')}
                className="bg-background/60 text-foreground/90 backdrop-blur-sm border border-border/30 shadow-lg hover:bg-background/80 transition-colors"
              >
                <PanelLeft />
              </Button>
            </div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 z-30 animate-in fade-in duration-300">
              <Button
                size="icon"
                onClick={() => setMobileView('right')}
                className="bg-background/60 text-foreground/90 backdrop-blur-sm border border-border/30 shadow-lg hover:bg-background/80 transition-colors"
              >
                <PanelRight />
              </Button>
            </div>
          </>
        )}
        <Toaster position="top-center" />
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <ResizablePanelGroup orientation="horizontal">
        <ResizablePanel defaultSize="20%" minSize="15%">
          <LeftSidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="55%" minSize="30%">
          <MainContent />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="25%" minSize="15%">
          <RightSidebar />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster position="top-center" />
    </div>
  )
}

export default App
