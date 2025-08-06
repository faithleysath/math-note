import { useEffect } from 'react';
import { useAppStore } from '../stores/useAppStore';

export const useHotkeys = () => {
  const { 
    selectedNode, 
    editingNodeId, 
    setEditingNodeId,
    setSelectedNodeById 
  } = useAppStore();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // --- Global Hotkeys ---
      // Focus search input with Cmd/Ctrl + F
      if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
        event.preventDefault();
        const searchInput = document.querySelector('input[placeholder="搜索..."]') as HTMLInputElement;
        searchInput?.focus();
      }

      // --- Contextual Hotkeys (depend on selectedNode) ---
      if (selectedNode) {
        // Enter edit mode with 'E'
        if (event.key === 'e' && !editingNodeId) {
          event.preventDefault();
          setEditingNodeId(selectedNode.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedNode, editingNodeId, setEditingNodeId, setSelectedNodeById]);
};
