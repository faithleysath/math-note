import { useState } from 'react';
import type { Node } from '../lib/schema';
import { useGraphStore } from '../stores/useGraphStore';
import { Button } from './ui/button';
import { Trash2 } from 'lucide-react';
import ConfirmDeleteDialog from './ConfirmDeleteDialog';
import { useWindowSize } from '@/hooks/useWindowSize';

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

  const typePrefix =
    node.type === 'definition' ? 'Def: ' :
    node.type === 'theorem' ? 'Th: ' :
    node.type === 'lemma' ? 'Lem: ' :
    node.type === 'corollary' ? 'Cor: ' :
    node.type === 'example' ? 'Eg: ' :
    node.type === 'exercise' ? 'Ex: ' :
    node.type === 'attempt' ? 'Sol: ' :
    node.type === 'note' ? 'Note: ' :
    node.type === 'proof' ? 'Pf: ' :
    node.type === 'concept' ? 'Con: ' :
    node.type === 'context' ? 'Ctx: ' :
    node.type === 'counterexample' ? 'Cex: ' :
    '';

  const colorClass =
    node.type === 'definition' ? 'text-blue-600 dark:text-blue-400' :
    node.type === 'theorem' ? 'text-green-600 dark:text-green-400' :
    node.type === 'lemma' ? 'text-teal-600 dark:text-teal-400' :
    node.type === 'corollary' ? 'text-cyan-600 dark:text-cyan-400' :
    node.type === 'example' ? 'text-orange-600 dark:text-orange-400' :
    node.type === 'exercise' ? 'text-purple-600 dark:text-purple-400' :
    node.type === 'attempt' ? 'text-red-600 dark:text-red-400' :
    node.type === 'note' ? 'text-yellow-600 dark:text-yellow-400' :
    node.type === 'proof' ? 'text-red-600 dark:text-red-400' :
    node.type === 'concept' ? 'text-indigo-600 dark:text-indigo-400' :
    node.type === 'context' ? 'text-zinc-600 dark:text-zinc-400' :
    node.type === 'counterexample' ? 'text-rose-600 dark:text-rose-400' :
    '';

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
            const childPrefix =
              child.type === 'chapter' || child.type === 'section'
                ? treePrefix(index.numbering.get(child.id))
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
