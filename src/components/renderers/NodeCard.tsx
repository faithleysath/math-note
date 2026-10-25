import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { MathMarkdown } from '@/components/MathMarkdown';
import { NodeBadge } from '@/components/NodeBadge';
import { AttemptList } from '@/components/AttemptList';
import { NODE_TYPE_META, type Node, type NodeType } from '@/lib/schema';
import { cn } from '@/lib/utils';

interface NodeCardProps {
  node: Node;
  number?: string;
  isSelected: boolean;
  readOnly: boolean;
  onSelect: () => void;
  actions?: ReactNode;
}

const ACCENT: Partial<Record<NodeType, string>> = {
  definition: 'border-l-4 border-blue-400',
  theorem: 'border-l-4 border-emerald-400',
  lemma: 'border-l-4 border-teal-400',
  corollary: 'border-l-4 border-cyan-400',
  example: 'border-l-4 border-orange-400 bg-orange-50/40 rounded-r-md',
  exercise: 'border-l-4 border-violet-400 bg-violet-50/40 rounded-r-md',
  note: 'border-l-4 border-amber-300 bg-amber-50/40 rounded-r-md',
};

export function NodeCard({ node, number, isSelected, readOnly, onSelect, actions }: NodeCardProps) {
  const [showSolution, setShowSolution] = useState(false);

  const selectedClass = isSelected ? 'bg-primary/5 ring-1 ring-inset ring-primary/30' : '';

  // 徽章已经显示类型，编号里就不要再重复「定理」两个字
  const typeLabel = NODE_TYPE_META[node.type].label;
  const displayNumber = number?.startsWith(`${typeLabel} `) ? number.slice(typeLabel.length + 1) : number;

  const solutionBlock = node.solution ? (
    <div className="mt-2">
      <button
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={(event) => {
          event.stopPropagation();
          setShowSolution((value) => !value);
        }}
      >
        <ChevronDown className={cn('h-3 w-3 transition-transform', showSolution && 'rotate-180')} />
        {showSolution ? '收起' : node.type === 'exercise' || node.type === 'example' ? '显示标准答案' : '展开证明'}
      </button>
      {showSolution && (
        <div className="mt-1 rounded border border-dashed border-border/70 bg-background/60 px-3 py-2">
          <MathMarkdown source={node.solution} />
        </div>
      )}
    </div>
  ) : null;

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <NodeBadge type={node.type} />
        {displayNumber && (
          <span className="text-sm font-semibold text-muted-foreground">{displayNumber}</span>
        )}
        <span className="text-[15px] font-semibold">{node.title}</span>
        {node.key && (
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {node.key}
          </span>
        )}
      </div>
      <MathMarkdown source={node.content} className="mt-2" />
      {solutionBlock}
      {(node.type === 'exercise' || node.type === 'example') && (
        <AttemptList parent={node} readOnly={readOnly} />
      )}
    </>
  );

  return (
    <div
      id={`node-${node.id}`}
      data-node-id={node.id}
      className={cn(
        'group relative scroll-mt-4 rounded-md px-3 py-2 transition-colors',
        isSelected ? selectedClass : 'hover:bg-muted/40',
        ACCENT[node.type],
      )}
      onClick={onSelect}
    >
      {actions && (
        <div className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-background/90 p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
          {actions}
        </div>
      )}

      {node.type === 'chapter' && (
        <div>
          <div className="flex flex-wrap items-baseline gap-3 pr-24">
            {number && <span className="text-sm font-semibold text-indigo-600">{number}</span>}
            <h2 className="text-2xl font-bold tracking-tight">{node.title}</h2>
          </div>
          <MathMarkdown source={node.content} className="mt-3" />
        </div>
      )}

      {node.type === 'section' && (
        <div>
          <div className="flex flex-wrap items-baseline gap-3 pr-24">
            {number && <span className="text-sm font-semibold text-sky-600">{number}</span>}
            <h3 className="text-xl font-semibold tracking-tight">{node.title}</h3>
          </div>
          <MathMarkdown source={node.content} className="mt-2" />
        </div>
      )}

      {node.type !== 'chapter' && node.type !== 'section' && body}
    </div>
  );
}
