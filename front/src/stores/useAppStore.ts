import { create } from 'zustand';
import type { Node } from '../lib/types';
import { getNode, getNodesByParent, addNode } from '../lib/db';

interface AppState {
  rootNodes: Node[];
  isLoadingTree: boolean;
  selectedNode: Node | null;
  expandedBranchId: string | null;
  fetchRootNodes: () => Promise<void>;
  addBranch: (title: string) => Promise<void>;
  setSelectedNodeById: (id: string | null) => Promise<void>;
  setExpandedBranchId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  rootNodes: [],
  isLoadingTree: true,
  selectedNode: null,
  expandedBranchId: null,
  fetchRootNodes: async () => {
    set({ isLoadingTree: true });
    try {
      const nodes = await getNodesByParent(null);
      // 只显示“分支”类型的节点作为根节点
      set({ rootNodes: nodes.filter(node => node.type === '分支'), isLoadingTree: false });
    } catch (error) {
      console.error("Failed to fetch root nodes:", error);
      set({ isLoadingTree: false });
    }
  },
  addBranch: async (title: string) => {
    try {
      await addNode({
        title,
        type: '分支',
        content: '',
        parentId: null,
        children: [],
      });
      // Refresh the tree
      await get().fetchRootNodes();
    } catch (error) {
      console.error("Failed to add branch:", error);
    }
  },
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
