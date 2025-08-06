import type { Node, Edge } from './types';

interface RemoteData {
  nodes: Node[];
  edges: Edge[];
}

// --- Node Operations ---

export function getNode(id: string, data: RemoteData): Node | undefined {
  return data.nodes.find(node => node.id === id);
}

export function getNodesByParent(parentId: string | null, data: RemoteData): Node[] {
  console.log('%c[remoteDb] getNodesByParent called with parentId:', 'color: #999', parentId);
  // Handle both null and undefined for root nodes, as JSON parsing might omit the parentId key.
  if (parentId === null) {
    const result = data.nodes.filter(node => node.parentId === null || node.parentId === undefined);
    console.log('%c[remoteDb] Found root nodes:', 'color: #999', result);
    return result;
  }
  const result = data.nodes.filter(node => node.parentId === parentId);
  console.log(`%c[remoteDb] Found nodes for parent ${parentId}:`, 'color: #999', result);
  return result;
}

export function getOrderedDescendants(nodeId: string, data: RemoteData): Node[] {
  const result: Node[] = [];
  const nodesMap = new Map(data.nodes.map(node => [node.id, node]));
  const parentToChildrenMap = new Map<string, Node[]>();

  for (const node of nodesMap.values()) {
    if (node.parentId) {
      if (!parentToChildrenMap.has(node.parentId)) {
        parentToChildrenMap.set(node.parentId, []);
      }
      parentToChildrenMap.get(node.parentId)!.push(node);
    }
  }

  for (const [pId, children] of parentToChildrenMap.entries()) {
    const parentNode = nodesMap.get(pId);
    if (parentNode && parentNode.children.length > 0) {
      children.sort((a, b) => parentNode.children.indexOf(a.id) - parentNode.children.indexOf(b.id));
    }
  }

  const startNode = nodesMap.get(nodeId);
  if (startNode) {
    const visit = (node: Node) => {
      result.push(node);
      const children = parentToChildrenMap.get(node.id) || [];
      for (const child of children) {
        visit(child);
      }
    };
    visit(startNode);
  }
  return result;
}

export function getAncestors(nodeId: string, data: RemoteData): Node[] {
  const ancestors: Node[] = [];
  let currentId: string | null = nodeId;
  const nodesMap = new Map(data.nodes.map(node => [node.id, node]));

  while (currentId) {
    const node = nodesMap.get(currentId);
    if (node) {
      ancestors.push(node);
      currentId = node.parentId;
    } else {
      currentId = null;
    }
  }
  return ancestors.reverse();
}

// --- Edge Operations ---

export function getEdgesBySource(sourceId: string, data: RemoteData): Edge[] {
  return data.edges.filter(edge => edge.source === sourceId);
}

export function getEdgesByTarget(targetId: string, data: RemoteData): Edge[] {
  return data.edges.filter(edge => edge.target === targetId);
}

// --- Search Operations ---

export function searchNodes(term: string, data: RemoteData): Node[] {
  if (!term) return [];
  const lowerCaseTerm = term.toLowerCase();
  
  return data.nodes.filter(node => 
    node.title.toLowerCase().includes(lowerCaseTerm) ||
    node.content.toLowerCase().includes(lowerCaseTerm) ||
    !!(node.aliases?.some(alias => alias.toLowerCase().includes(lowerCaseTerm))) ||
    !!(node.tags?.some(tag => tag.toLowerCase().includes(lowerCaseTerm)))
  ).slice(0, 50); // Limit to 50 results
}
