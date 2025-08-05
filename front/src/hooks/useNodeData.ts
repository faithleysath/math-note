import { useState, useEffect } from 'react';
import { getNode } from '../lib/db';
import type { Node } from '../lib/types';

/**
 * A hook to fetch the full data for a single node by its ID.
 * It handles loading and caching of the fetched node data.
 * @param nodeId The ID of the node to fetch.
 */
export function useNodeData(nodeId: string | undefined) {
  const [node, setNode] = useState<Node | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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
  }, [nodeId]);

  return { node, loading };
}
