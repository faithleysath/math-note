import { create } from 'zustand';
import { toast } from 'sonner';
import type { Node, Edge } from '../lib/types';
import { getNode, getNodesByParent, addNode, updateNode, getAncestors } from '../lib/db';

interface RemoteData {
  nodes: Node[];
  edges: Edge[];
}

interface AppState {
  isReadOnly: boolean;
  remoteData: RemoteData | null;
  rootNodes: Node[];
  isLoadingTree: boolean;
  selectedNode: Node | null;
  expandedBranchId: string | null;
  expandedNodeIds: Set<string>; // For auto-expanding the tree view
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
  addNewNode: (
    nodeData: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>,
    parent: Node,
    insertAfterNodeId: string | null
  ) => Promise<void>;
  loadRemoteData: (url: string) => Promise<void>;
}

export const useAppStore = create<AppState>((set, get) => ({
  isReadOnly: false,
  remoteData: null,
  rootNodes: [],
  isLoadingTree: true,
  selectedNode: null,
  expandedBranchId: null,
  expandedNodeIds: new Set(),
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
      toast.success(`分支 "${title}" 已成功创建。`);
      // Refresh the tree
      await get().fetchRootNodes();
    } catch (error) {
      console.error("Failed to add branch:", error);
      toast.error('创建分支失败。');
    }
  },
  setSelectedNodeById: async (id: string | null) => {
    if (id === null) {
      set({ selectedNode: null });
      return;
    }
    try {
      const node = await getNode(id);
      if (node) {
        const ancestors = await getAncestors(node.id);
        const ancestorIds = new Set(ancestors.map(a => a.id));
        set({ selectedNode: node, expandedNodeIds: ancestorIds });
      } else {
        set({ selectedNode: null });
      }
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
  addNewNode: async (nodeData, parent, insertAfterNodeId) => {
    try {
      const newNodeId = await addNode(nodeData);

      let newChildren: string[];
      if (insertAfterNodeId) {
        const index = parent.children.indexOf(insertAfterNodeId);
        if (index !== -1) {
          const childrenCopy = [...parent.children];
          childrenCopy.splice(index + 1, 0, newNodeId);
          newChildren = childrenCopy;
        } else {
          newChildren = [...parent.children, newNodeId];
        }
      } else {
        newChildren = [...parent.children, newNodeId];
      }
      await updateNode(parent.id, { children: newChildren });

      toast.success(`节点 "${nodeData.title}" 已成功添加。`);
      get().triggerStructureRefresh();
      set({ editingNodeId: newNodeId });

      // Use a timeout to ensure the UI has re-rendered before scrolling
      setTimeout(() => {
        get().setSelectedNodeById(newNodeId);
      }, 100);
    } catch (error) {
      console.error("Failed to add new node:", error);
      toast.error('添加新节点失败。');
    }
  },
  loadRemoteData: async (url: string) => {
    set({ isLoadingTree: true });
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      // Basic validation
      if (!data.nodes || !data.edges) {
        throw new Error('Invalid data format.');
      }
      set({ remoteData: data, isReadOnly: true });
      await get().fetchRootNodes(); // 直接在设置远程数据后获取根节点
      toast.success('只读笔记已加载。');
      set({ isLoadingTree: false });
    } catch (error) {
      console.error('Failed to load remote data:', error);
      toast.error(`加载远程笔记失败: ${error instanceof Error ? error.message : '未知错误'}`);
      set({ isLoadingTree: false });
    }
  },
}));
