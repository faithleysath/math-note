import { create } from 'zustand';
import { toast } from 'sonner';
import type { Node, Edge, AiOperation, AddNodePayload, UpdateNodePayload, DeleteNodePayload, AddEdgePayload, DeleteEdgePayload, SelectNodePayload } from '../lib/types';
import * as db from '../lib/data-provider';
import { getNodesByParent as getRemoteNodesByParent } from '../lib/remoteDb';

interface RemoteData {
  nodes: Node[];
  edges: Edge[];
}

interface AppState {
  isReadOnly: boolean;
  remoteData: RemoteData | null;
  rootNodes: Node[];
  isLoadingTree: boolean;
  loadError: boolean;
  selectedNode: Node | null;
  expandedBranchId: string | null;
  expandedNodeIds: Set<string>; // For auto-expanding the tree view
  editingNodeId: string | null; // ID of the node currently being edited
  contentVersion: number; // Triggers re-fetch of node content
  structureVersion: number; // Triggers re-fetch of lists and re-mount of components
  edgeVersion: number; // Triggers re-fetch of graph relationships
  mobileView: 'main' | 'left' | 'right';
  fetchRootNodes: () => Promise<void>;
  addBranch: (title: string) => Promise<void>;
  setSelectedNodeById: (id: string | null) => Promise<void>;
  setExpandedBranchId: (id: string | null) => void;
  setMobileView: (view: 'main' | 'left' | 'right') => void;
  setEditingNodeId: (id: string | null) => void; // Action to set the editing node
  setIsLoadingTree: (isLoading: boolean) => void;
  setLoadError: (error: boolean) => void;
  triggerContentRefresh: () => void;
  triggerStructureRefresh: () => void;
  triggerEdgeRefresh: () => void;
  addNewNode: (
    nodeData: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>,
    parent: Node,
    insertAfterNodeId: string | null
  ) => Promise<void>;
  loadRemoteData: (url: string) => Promise<void>;
  executeAiOperation: (operation: AiOperation) => Promise<{ success: boolean; message?: string }>;
}

export const useAppStore = create<AppState>((set, get) => ({
  isReadOnly: false,
  remoteData: null,
  rootNodes: [],
  isLoadingTree: true,
  loadError: false,
  selectedNode: null,
  expandedBranchId: null,
  expandedNodeIds: new Set(),
  editingNodeId: null,
  contentVersion: 0,
  structureVersion: 0,
  edgeVersion: 0,
  mobileView: 'main',
  fetchRootNodes: async () => {
    try {
      const nodes = await db.getNodesByParent(null);
      const rootNodes = nodes.filter(node => node.type === '分支');
      set({ rootNodes });

      // If there are root nodes and no branch is currently expanded, select and expand the first one.
      if (rootNodes.length > 0 && !get().expandedBranchId) {
        const firstRootNode = rootNodes[0];
        get().setExpandedBranchId(firstRootNode.id);
        get().setSelectedNodeById(firstRootNode.id);
      }

    } catch (error) {
      console.error("Failed to fetch root nodes:", error);
    }
  },
  addBranch: async (title: string) => {
    try {
      await db.addNode({
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
      const node = await db.getNode(id);
      if (node) {
        const ancestors = await db.getAncestors(node.id);
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
  setMobileView: (view) => set({ mobileView: view }),
  setEditingNodeId: (id: string | null) => {
    set({ editingNodeId: id });
  },
  setIsLoadingTree: (isLoading: boolean) => {
    set({ isLoadingTree: isLoading });
  },
  setLoadError: (error: boolean) => {
    set({ loadError: error, isLoadingTree: false });
  },
  triggerContentRefresh: () => {
    set(state => ({ contentVersion: state.contentVersion + 1 }));
  },
  triggerStructureRefresh: () => {
    set(state => ({ structureVersion: state.structureVersion + 1 }));
  },
  triggerEdgeRefresh: () => {
    set(state => ({ edgeVersion: state.edgeVersion + 1 }));
  },
  addNewNode: async (nodeData, parent, insertAfterNodeId) => {
    try {
      const newNodeId = await db.addNode(nodeData);

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
      await db.updateNode(parent.id, { children: newChildren });

      toast.success(`节点 "${nodeData.title}" 已成功添加。`);
      get().triggerStructureRefresh();
      set({ editingNodeId: newNodeId });

      // Use a timeout to ensure the UI has re-rendered before scrolling
      setTimeout(() => {
        get().setSelectedNodeById(newNodeId);
      }, 100);
    } catch (error) {
      console.error("Failed to add new node:", error);
      if (error instanceof Error && error.message.includes("read-only")) {
        toast.error("无法在只读模式下添加节点。");
      } else {
        toast.error('添加新节点失败。');
      }
    }
  },
  loadRemoteData: async (url: string) => {
    set({ isLoadingTree: true, loadError: false });
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
      
      const rootNodes = getRemoteNodesByParent(null, data).filter(node => node.type === '分支');

      set({ 
        remoteData: data, 
        isReadOnly: true,
        rootNodes: rootNodes,
        isLoadingTree: false 
      });

      get().triggerStructureRefresh();
      toast.success('只读笔记已加载。');

      // Also select and expand the first root node for remote data, if nothing is expanded yet.
      if (rootNodes.length > 0 && !get().expandedBranchId) {
        const firstRootNode = rootNodes[0];
        get().setExpandedBranchId(firstRootNode.id);
        get().setSelectedNodeById(firstRootNode.id);
      }
    } catch (error) {
      console.error('Failed to load remote data:', error);
      set({ isLoadingTree: false, loadError: true });
    }
  },
  executeAiOperation: async (operation: AiOperation) => {
    const { type, payload } = operation;
    const { triggerStructureRefresh, triggerContentRefresh, triggerEdgeRefresh, setSelectedNodeById, addNewNode } = get();
  
    try {
      switch (type) {
        case 'add_node': {
          const { nodeData, parentId, insertAfterNodeId } = payload as AddNodePayload;
          const parentNode = await db.getNode(parentId);
          if (!parentNode) {
            throw new Error(`Parent node with id ${parentId} not found.`);
          }
          await addNewNode(nodeData, parentNode, insertAfterNodeId || null);
          toast.success(`Node "${nodeData.title}" added successfully.`);
          break;
        }
  
        case 'update_node': {
          const { nodeId, updates } = payload as UpdateNodePayload;
          await db.updateNode(nodeId, updates);
          triggerContentRefresh();
          triggerStructureRefresh(); // In case title or other structural info changes
          toast.success(`Node ${nodeId} updated successfully.`);
          break;
        }
  
        case 'delete_node': {
          const { nodeId } = payload as DeleteNodePayload;
          await db.deleteNode(nodeId);
          triggerStructureRefresh();
          toast.success(`Node ${nodeId} deleted successfully.`);
          break;
        }
  
        case 'add_edge': {
          const { edgeData } = payload as AddEdgePayload;
          await db.addEdge(edgeData);
          triggerEdgeRefresh();
          toast.success(`Edge created successfully.`);
          break;
        }
  
        case 'delete_edge': {
          const { edgeId } = payload as DeleteEdgePayload;
          await db.deleteEdge(edgeId);
          triggerEdgeRefresh();
          toast.success(`Edge ${edgeId} deleted successfully.`);
          break;
        }
        
        case 'select_node': {
          const { nodeId } = payload as SelectNodePayload;
          await setSelectedNodeById(nodeId);
          toast.success(`Node ${nodeId} selected.`);
          break;
        }
  
        default: {
          // This should not happen with TypeScript checking, but it's good practice
          // to handle unexpected cases.
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const _exhaustiveCheck: never = type;
          throw new Error(`Unsupported operation type: ${type}`);
        }
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error(`Failed to execute AI operation:`, error);
      toast.error(message);
      return { success: false, message };
    }
  }
}));
