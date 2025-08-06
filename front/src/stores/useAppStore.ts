import { create } from 'zustand';
import type { Node } from '../lib/types';
import { getNode, getNodesByParent, addNode } from '../lib/db';

interface AppState {
  rootNodes: Node[];
  isLoadingTree: boolean;
  selectedNode: Node | null;
  expandedBranchId: string | null;
  editingNodeId: string | null; // ID of the node currently being edited
  contentVersion: number; // Triggers re-fetch of node content
  structureVersion: number; // Triggers re-fetch of lists and re-mount of components
  fetchRootNodes: () => Promise<void>;
  addBranch: (title: string) => Promise<void>;
  setSelectedNodeById: (id: string | null) => Promise<void>;
  setExpandedBranchId: (id: string | null) => void;
  setEditingNodeId: (id: string | null) => void; // Action to set the editing node
  triggerContentRefresh: () => void;
  triggerStructureRefresh: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  rootNodes: [],
  isLoadingTree: true,
  selectedNode: null,
  expandedBranchId: null,
  editingNodeId: null,
  contentVersion: 0,
  structureVersion: 0,
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
  setEditingNodeId: (id: string | null) => {
    set({ editingNodeId: id });
  },
  triggerContentRefresh: () => {
    set(state => ({ contentVersion: state.contentVersion + 1 }));
  },
  triggerStructureRefresh: () => {
    set(state => ({ structureVersion: state.structureVersion + 1 }));
  },
}));
