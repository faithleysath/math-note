import { useState, useEffect } from 'react';
import { getNode } from '../lib/data-provider';
import type { Node } from '../lib/types';
import { useAppStore } from '../stores/useAppStore';

/**
 * A hook to fetch the full data for a single node by its ID.
 * It handles loading and caching of the fetched node data.
 * @param nodeId The ID of the node to fetch.
 */
export function useNodeData(nodeId: string | undefined) {
  const [node, setNode] = useState<Node | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const contentVersion = useAppStore(state => state.contentVersion);

  useEffect(() => {
    if (!nodeId) {
      setNode(null);
      setLoading(false);
      return;
    }

    let isMounted = true;
    setLoading(true);

    getNode(nodeId).then(data => {
      if (isMounted) {
        setNode(data);
        setLoading(false);
      }
    }).catch(() => {
      if (isMounted) {
        setNode(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [nodeId, contentVersion]); // Re-fetch when nodeId or contentVersion changes

  return { node, loading };
}
