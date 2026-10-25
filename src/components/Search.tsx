import { useMemo, useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { NodeBadge } from '@/components/NodeBadge';
import { Input } from '@/components/ui/input';
import { ancestorNodes, searchNodes, type SearchHit } from '@/lib/graph';
import type { Node } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';
import { cn } from '@/lib/utils';

interface SearchProps {
  onSelect: (node: Node) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  /** 选项被点击后是否清空输入 */
  clearOnSelect?: boolean;
}

const FIELD_LABEL: Record<SearchHit['field'], string> = {
  key: '术语键',
  title: '标题',
  alias: '别名',
  tag: '标签',
  content: '正文',
};

export function Search({
  onSelect,
  placeholder = '搜索标题、正文、别名、标签…',
  autoFocus,
  className,
  clearOnSelect = false,
}: SearchProps) {
  const index = useGraphStore((state) => state.index);
  const [term, setTerm] = useState('');

  const hits = useMemo(() => searchNodes(index, term, 20), [index, term]);

  return (
    <div className={cn('relative', className)}>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={term}
          placeholder={placeholder}
          className="h-8 pl-7 text-sm"
          onChange={(event) => setTerm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setTerm('');
            if (event.key === 'Enter' && hits.length > 0) {
              onSelect(hits[0].node);
              if (clearOnSelect) setTerm('');
            }
          }}
        />
      </div>

      {term.trim() && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 shadow-lg">
          {hits.length === 0 && (
            <div className="px-2 py-3 text-center text-xs text-muted-foreground">没有匹配的节点</div>
          )}
          {hits.map((hit) => {
            const trail = ancestorNodes(index, hit.node.id)
              .slice(-3)
              .map((node) => node.title)
              .join(' / ');
            return (
              <button
                key={hit.node.id}
                className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left hover:bg-accent"
                onClick={() => {
                  onSelect(hit.node);
                  if (clearOnSelect) setTerm('');
                }}
              >
                <div className="flex w-full items-center gap-2">
                  <NodeBadge type={hit.node.type} />
                  <span className="truncate text-sm font-medium">{hit.node.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {FIELD_LABEL[hit.field]}
                  </span>
                </div>
                {trail && <span className="truncate text-[11px] text-muted-foreground">{trail}</span>}
                {hit.snippet && (
                  <span className="truncate text-[11px] text-muted-foreground">…{hit.snippet}…</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Search;
