import { create } from 'zustand';
import type { Node } from '../lib/types';
import { getNode } from '../lib/db';

interface AppState {
  selectedNode: Node | null;
  expandedBranchId: string | null;
  setSelectedNodeById: (id: string | null) => Promise<void>;
  setExpandedBranchId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  selectedNode: null,
  expandedBranchId: null,
  setSelectedNodeById: async (id: string | null) => {
    console.log(`Attempting to select node with ID: ${id}`);
    if (id === null) {
      set({ selectedNode: null });
      console.log('Selected node cleared.');
      return;
    }
    try {
      const node = await getNode(id);
      set({ selectedNode: node || null });
      console.log('Node fetched and state set:', node);
    } catch (error) {
      console.error(`Failed to fetch node with id ${id}:`, error);
      set({ selectedNode: null });
    }
  },
  setExpandedBranchId: (id: string | null) => {
    set({ expandedBranchId: id });
  },
}));
