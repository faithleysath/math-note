import { useEffect } from 'react';
import { useGraphStore } from '../stores/useGraphStore';

export const useHotkeys = () => {
  const selectedId = useGraphStore((state) => state.selectedId);
  const editingId = useGraphStore((state) => state.editingId);

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
      if (selectedId) {
        // Enter edit mode with Cmd/Ctrl + E
        if ((event.metaKey || event.ctrlKey) && event.key === 'e' && !editingId) {
          event.preventDefault();
          useGraphStore.getState().setEditing(selectedId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedId, editingId]);
};
