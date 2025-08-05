import { createContext } from 'react';
import type { Node } from '../lib/types';

export interface AppContextType {
  selectedNode: Node | null;
  setSelectedNodeById: (id: string | null) => void;
  expandedBranchId: string | null;
  setExpandedBranchId: (id: string | null) => void;
}

export const AppContext = createContext<AppContextType | undefined>(undefined);
