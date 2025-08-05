import Dexie, { type Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import type { Node, Edge } from './types';

export class MathNoteDB extends Dexie {
  nodes!: Table<Node>;
  edges!: Table<Edge>;

  constructor() {
    super('MathNoteDB');
    this.version(1).stores({
      // The 'id' field is the primary key, so it's indexed by default.
      // We add indexes for fields that we will query frequently.
      nodes: '&id, parentId, type',
      // For edges, we want to efficiently query by source, target, or label.
      edges: '&id, source, target, label',
    });
  }
}

export const db = new MathNoteDB();

// --- Node Operations ---

/**
 * Adds a new node to the database.
 * Automatically generates a UUID for the id and sets timestamps.
 * @param node - The node object to add, without id, createdAt, or updatedAt.
 */
export async function addNode(node: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>) {
  const now = Date.now();
  const fullNode: Node = {
    id: uuidv4(),
    ...node,
    createdAt: now,
    updatedAt: now,
  };
  return await db.nodes.add(fullNode);
}

/**
 * Retrieves a single node by its ID.
 * @param id - The ID of the node to retrieve.
 */
export async function getNode(id: string) {
  return await db.nodes.get(id);
}

/**
 * Updates an existing node.
 * Automatically updates the updatedAt timestamp.
 * @param id - The ID of the node to update.
 * @param updates - An object containing the fields to update.
 */
export async function updateNode(id: string, updates: Partial<Node>) {
  const now = Date.now();
  return await db.nodes.update(id, { ...updates, updatedAt: now });
}

/**
 * Deletes a node and its associated edges from the database.
 * @param id - The ID of the node to delete.
 */
export async function deleteNode(id: string) {
  return await db.transaction('rw', db.nodes, db.edges, async () => {
    // Delete edges where the node is either a source or a target
    await db.edges.where('source').equals(id).delete();
    await db.edges.where('target').equals(id).delete();
    // Delete the node itself
    await db.nodes.delete(id);
  });
}

/**
 * Retrieves all children of a given parent node.
 * @param parentId - The ID of the parent node.
 */
export async function getNodesByParent(parentId: string | null) {
    if (parentId === null) {
        // Special case for root nodes
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return await db.nodes.where('parentId').equals(null as any).toArray();
    }
    return await db.nodes.where('parentId').equals(parentId).toArray();
}


// --- Edge Operations ---

/**
 * Adds a new edge to the database.
 * Automatically generates a UUID for the id.
 * @param edge - The edge object to add, without an id.
 */
export async function addEdge(edge: Omit<Edge, 'id'>) {
  const fullEdge: Edge = {
    id: uuidv4(),
    ...edge,
  };
  return await db.edges.add(fullEdge);
}

/**
 * Retrieves a single edge by its ID.
 * @param id - The ID of the edge to retrieve.
 */
export async function getEdge(id: string) {
    return await db.edges.get(id);
}

/**
 * Retrieves all edges originating from a specific source node.
 * @param sourceId - The ID of the source node.
 */
export async function getEdgesBySource(sourceId: string) {
  return await db.edges.where('source').equals(sourceId).toArray();
}

/**
 * Retrieves all edges pointing to a specific target node.
 * @param targetId - The ID of the target node.
 */
export async function getEdgesByTarget(targetId: string) {
    return await db.edges.where('target').equals(targetId).toArray();
}

/**
 * Deletes an edge by its ID.
 * @param id - The ID of the edge to delete.
 */
export async function deleteEdge(id: string) {
  return await db.edges.delete(id);
}
