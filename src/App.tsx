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
  const setIsLoadingTree = useAppStore(state => state.setIsLoadingTree);


  useHotkeys();

  useEffect(() => {
    const initializeApp = async () => {
      const params = new URLSearchParams(window.location.search);
      const noteUrl = params.get('note_url');
      let urlToLoad: string | null = null;

      if (noteUrl) {
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
      }

      if (urlToLoad) {
        await loadRemoteData(urlToLoad);
      } else {
        // If no valid URL is found, load local data
        setIsLoadingTree(true);
        await fetchRootNodes();
        setIsLoadingTree(false);
      }
    };

    initializeApp();
    // The dependency array is intentionally left empty to run only once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


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
