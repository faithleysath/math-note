import { useAppStore } from '../stores/useAppStore';
import * as localDb from './db';
import * as remoteDb from './remoteDb';
import type { Node, Edge } from './types';

// This file acts as a proxy to the database, switching between local (IndexedDB)
// and remote (in-memory JSON) data sources based on the app's read-only state.

// --- Node Operations ---

export async function getNode(id: string): Promise<Node | undefined> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.getNode(id, remoteData);
  }
  return localDb.getNode(id);
}

export async function getNodesByParent(parentId: string | null): Promise<Node[]> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.getNodesByParent(parentId, remoteData);
  }
  return localDb.getNodesByParent(parentId);
}

export async function getOrderedDescendants(nodeId: string): Promise<Node[]> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.getOrderedDescendants(nodeId, remoteData);
  }
  return localDb.getOrderedDescendants(nodeId);
}

export async function getAncestors(nodeId: string): Promise<Node[]> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.getAncestors(nodeId, remoteData);
  }
  return localDb.getAncestors(nodeId);
}

// --- Edge Operations ---

export async function getEdgesBySource(sourceId: string): Promise<Edge[]> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.getEdgesBySource(sourceId, remoteData);
  }
  return localDb.getEdgesBySource(sourceId);
}

export async function getEdgesByTarget(targetId: string): Promise<Edge[]> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.getEdgesByTarget(targetId, remoteData);
  }
  return localDb.getEdgesByTarget(targetId);
}

// --- Search Operations ---

export async function searchNodes(term: string): Promise<Node[]> {
  const { isReadOnly, remoteData } = useAppStore.getState();
  if (isReadOnly && remoteData) {
    return remoteDb.searchNodes(term, remoteData);
  }
  return localDb.searchNodes(term);
}

// --- Write Operations ---
// These operations are disabled in read-only mode.

export async function addNode(node: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  const { isReadOnly } = useAppStore.getState();
  if (isReadOnly) {
    throw new Error("Cannot add node in read-only mode.");
  }
  return localDb.addNode(node);
}

export async function updateNode(id: string, updates: Partial<Node>): Promise<number> {
  const { isReadOnly } = useAppStore.getState();
  if (isReadOnly) {
    throw new Error("Cannot update node in read-only mode.");
  }
  return localDb.updateNode(id, updates);
}

export async function deleteNode(id: string): Promise<void> {
  const { isReadOnly } = useAppStore.getState();
  if (isReadOnly) {
    throw new Error("Cannot delete node in read-only mode.");
  }
  return localDb.deleteNode(id);
}

export async function addEdge(edge: Omit<Edge, 'id'>): Promise<string> {
  const { isReadOnly } = useAppStore.getState();
  if (isReadOnly) {
    throw new Error("Cannot add edge in read-only mode.");
  }
  return localDb.addEdge(edge);
}

export async function deleteEdge(id: string): Promise<void> {
  const { isReadOnly } = useAppStore.getState();
  if (isReadOnly) {
    throw new Error("Cannot delete edge in read-only mode.");
  }
  return localDb.deleteEdge(id);
}
