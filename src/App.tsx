import { useEffect } from "react"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import LeftSidebar from "./components/layout/LeftSidebar"
import MainContent from "./components/layout/MainContent"
import RightSidebar from "./components/layout/RightSidebar"
import { useAppStore } from "./stores/useAppStore"
import { useHotkeys } from "./hooks/useHotkeys"
import { Toaster } from "@/components/ui/sonner"

function App() {
  const structureVersion = useAppStore(state => state.structureVersion);
  const loadRemoteData = useAppStore(state => state.loadRemoteData);
  const fetchRootNodes = useAppStore(state => state.fetchRootNodes);

  useHotkeys();

  useEffect(() => {
    const initializeApp = async () => {
      const hash = window.location.hash.substring(1);
      if (hash) {
        try {
          // 验证 hash 是否是有效的 URL
          const url = new URL(hash);
          await loadRemoteData(url.toString());
        } catch (error) {
          console.error("Invalid URL in hash, loading local data:", error);
          // 如果 hash 无效，则加载本地数据
          await fetchRootNodes();
        }
      } else {
        // 如果没有 hash，则加载本地数据
        await fetchRootNodes();
      }
    };

    initializeApp();
  }, [loadRemoteData, fetchRootNodes]);


  return (
    <div className="h-screen w-screen bg-background text-foreground">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={20} minSize={15}>
          <LeftSidebar />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={55} minSize={30} key={structureVersion}>
          <MainContent />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={25} minSize={15}>
          <RightSidebar />
        </ResizablePanel>
      </ResizablePanelGroup>
      <Toaster />
    </div>
  )
}

export default App
