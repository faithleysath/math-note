import { ChevronRight } from 'lucide-react';
import { NodeBadge } from '@/components/NodeBadge';
import { childIds } from '@/lib/graph';
import { NODE_TYPE_META } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';
import { cn } from '@/lib/utils';

const SHORT_COLOR: Record<string, string> = {
  definition: 'text-blue-600',
  theorem: 'text-emerald-600',
  lemma: 'text-teal-600',
  corollary: 'text-cyan-600',
  example: 'text-orange-600',
  exercise: 'text-violet-600',
  note: 'text-amber-700',
  branch: 'text-slate-600',
  chapter: 'text-indigo-600',
  section: 'text-sky-600',
  attempt: 'text-rose-600',
};

export function TreeNode({ id, depth = 0 }: { id: string; depth?: number }) {
  const index = useGraphStore((state) => state.index);
  const selectedId = useGraphStore((state) => state.selectedId);
  const expandedIds = useGraphStore((state) => state.expandedIds);
  const select = useGraphStore((state) => state.select);
  const toggleExpanded = useGraphStore((state) => state.toggleExpanded);
  const setExpandedBranch = useGraphStore((state) => state.setExpandedBranch);
  const expandedBranchId = useGraphStore((state) => state.expandedBranchId);

  const node = index.nodes.get(id);
  if (!node || node.type === 'attempt') return null;

  const children = childIds(index, id).filter((childId) => index.nodes.get(childId)?.type !== 'attempt');
  const expanded = expandedIds.has(id);
  const selected = selectedId === id;
  const isBranch = node.type === 'branch';

  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-0.5 rounded pr-1 text-[13px]',
          selected ? 'bg-primary/10 font-medium' : 'hover:bg-accent',
          isBranch && expandedBranchId === id && 'bg-primary/5',
        )}
        style={{ paddingLeft: depth * 10 + 2 }}
      >
        {children.length > 0 ? (
          <button
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded hover:bg-muted"
            onClick={(event) => {
              event.stopPropagation();
              toggleExpanded(id);
            }}
            aria-label={expanded ? '收起' : '展开'}
          >
            <ChevronRight className={cn('h-3 w-3 transition-transform', expanded && 'rotate-90')} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        <button
          className="flex min-w-0 flex-1 items-center gap-1 py-0.5 text-left"
          onClick={() => {
            select(id);
            if (isBranch) setExpandedBranch(id);
          }}
        >
          <span className={cn('shrink-0 font-mono text-[10px]', SHORT_COLOR[node.type])}>
            {NODE_TYPE_META[node.type].short}
          </span>
          <span className="truncate">{node.title || '未命名'}</span>
        </button>
      </div>

      {expanded &&
        children.map((childId) => <TreeNode key={childId} id={childId} depth={depth + 1} />)}
    </div>
  );
}

export function TreeView() {
  const index = useGraphStore((state) => state.index);

  if (index.roots.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        还没有内容。
        <div className="mt-2 flex justify-center">
          <NodeBadge type="branch" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {index.roots.map((id) => (
        <TreeNode key={id} id={id} />
      ))}
    </div>
  );
}

export default TreeView;
