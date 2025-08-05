import React, { useState, type ReactNode } from 'react';
import type { Node } from '../lib/types';
import { getNode } from '../lib/db';
import { AppContext } from './AppContextDefinition';

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);

  const setSelectedNodeById = async (id: string | null) => {
    console.log(`Attempting to select node with ID: ${id}`);
    if (id === null) {
      setSelectedNode(null);
      console.log('Selected node cleared.');
      return;
    }
    try {
      const node = await getNode(id);
      setSelectedNode(node || null);
      console.log('Node fetched and state set:', node);
    } catch (error) {
      console.error(`Failed to fetch node with id ${id}:`, error);
      setSelectedNode(null);
    }
  };

  const value = { selectedNode, setSelectedNodeById, expandedBranchId, setExpandedBranchId };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
