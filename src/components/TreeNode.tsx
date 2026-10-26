import { useState } from 'react';
import type { Node } from '../lib/schema';
import { useGraphStore } from '../stores/useGraphStore';
import { numberDisplayFor } from '../lib/graph';
import { titleCarriesNumber } from '../lib/display';
import { subjectProfile } from '../lib/subjects';
import { Button } from './ui/button';
import { Trash2 } from 'lucide-react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import { useWindowSize } from '@/hooks/useWindowSize';
import { nodePrefix, nodeTextColor } from './nodeColors';

interface TreeNodeProps {
  node: Node;
  numberPrefix?: string;
}

/** 目录里的编号：把「第 1 章」「§ 1.1」压成「1.」「1.1.」 */
function treePrefix(displayNumber?: string): string {
  if (!displayNumber) return '';
  const digits = displayNumber.replace(/[^0-9.]/g, '');
  return digits ? `${digits}.` : '';
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, numberPrefix = '' }) => {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const index = useGraphStore((state) => state.index);
  const book = useGraphStore((state) => state.book);
  const select = useGraphStore((state) => state.select);
  const setExpandedBranch = useGraphStore((state) => state.setExpandedBranch);
  const toggleExpanded = useGraphStore((state) => state.toggleExpanded);
  const expandedBranchId = useGraphStore((state) => state.expandedBranchId);
  const expandedIds = useGraphStore((state) => state.expandedIds);
  const setMobileView = useGraphStore((state) => state.setMobileView);

  const { width } = useWindowSize();
  const isMobile = width <= 768;

  const children = (index.childrenOf.get(node.id) ?? [])
    .map((id) => index.nodes.get(id))
    .filter((child): child is Node => Boolean(child));

  const hasChildren = children.length > 0;
  const isBranch = node.type === 'branch';
  const isExpanded = isBranch ? expandedBranchId === node.id : expandedIds.has(node.id);

  const handleRowClick = () => {
    select(node.id);
    if (isMobile) {
      setMobileView('main');
    }
    if (isBranch) {
      // For branches, always toggle via global context for accordion effect,
      // even if it has no children. This allows showing the "add node" button.
      setExpandedBranch(isExpanded ? null : node.id);
    } else if (hasChildren) {
      toggleExpanded(node.id);
    }
  };

  const typePrefix = nodePrefix(node);
  const colorClass = nodeTextColor(node);

  return (
    <li className="ml-2 group">
      <div className="flex items-center justify-between cursor-pointer rounded-md p-1 transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-800" onClick={handleRowClick}>
        <div className="flex items-center">
          {hasChildren && (
            <span className="mr-1 text-lg w-4 text-center">
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          <span className={`${!hasChildren ? 'ml-[22px]' : ''} ${colorClass}`}>{`${numberPrefix}${typePrefix}${node.title}`}</span>
        </div>
        {isBranch && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        )}
      </div>
      {isExpanded && hasChildren && (
        <ul>
          {children.map((child) => {
            const childNumber =
              child.type === 'section'
                ? numberDisplayFor(index, child, subjectProfile(book?.subject).numberingMode)
                : null;
            // 编号经常已经写在标题里（如「第十七章 欧姆定律」），不要在目录里重复
            const childPrefix =
              childNumber && !titleCarriesNumber(child.title, childNumber.text)
                ? treePrefix(childNumber.text)
                : '';
            return (
              <TreeNode
                key={child.id}
                node={child}
                numberPrefix={childPrefix ? `${childPrefix} ` : ''}
              />
            );
          })}
        </ul>
      )}
      {isDeleteDialogOpen && (
        <ConfirmDeleteDialog
          node={node}
          isOpen={isDeleteDialogOpen}
          onClose={() => setIsDeleteDialogOpen(false)}
          onConfirm={() => {
            void useGraphStore.getState().deleteSubtree(node.id);
            setIsDeleteDialogOpen(false);
          }}
        />
      )}
    </li>
  );
};

export default TreeNode;
