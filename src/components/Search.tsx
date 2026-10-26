import { useState, useMemo } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Input } from './ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select';
import { nodesMatching, searchNodes, type SearchFilter } from '../lib/graph';
import { NODE_TYPE_META, typeLabel, type Node, type NodeType } from '../lib/schema';
import { nodeBadgeColor } from './nodeColors';
import { useGraphStore } from '../stores/useGraphStore';
import { filterGroupsFor } from '../lib/subjects';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchProps {
  onSelectNode?: (node: Node) => void;
  /** 是否显示类型 / 细分筛选（全局搜索用） */
  showFilters?: boolean;
}

const Search = ({ onSelectNode, showFilters = false }: SearchProps) => {
  const index = useGraphStore(state => state.index);
  const book = useGraphStore(state => state.book);
  const select = useGraphStore(state => state.select);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const filterGroups = useMemo(() => filterGroupsFor(book?.subject), [book?.subject]);

  const filter = useMemo<SearchFilter | undefined>(() => {
    if (!filterValue) return undefined;
    const [type, kind] = filterValue.split(':');
    return { type: type as NodeType, kind };
  }, [filterValue]);

  const results = useMemo(() => {
    const term = debouncedSearchTerm.trim();
    if (term.length > 1) {
      return searchNodes(index, term, 50, filter).map(hit => hit.node);
    }
    // 只选了筛选器、没输关键词时，直接浏览该类型
    if (term.length === 0 && filter) {
      return nodesMatching(index, filter, 30);
    }
    return [] as Node[];
  }, [debouncedSearchTerm, index, filter]);

  const handleSelectNode = (node: Node) => {
    if (onSelectNode) {
      onSelectNode(node);
    } else {
      select(node.id);
    }
    setSearchTerm('');
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <Input
        placeholder="搜索..."
        value={searchTerm}
        onChange={(e) => {
          setSearchTerm(e.target.value);
          setIsOpen(true);
        }}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)} // Delay to allow click
        onFocus={() => setIsOpen(true)}
      />
      {showFilters && (
        <div className="mt-1.5 flex items-center gap-2">
          <Select
            value={filterValue || 'all'}
            onValueChange={(value) => {
              setFilterValue(value === 'all' ? '' : value);
              setIsOpen(true);
            }}
          >
            <SelectTrigger
              size="sm"
              aria-label="按类型筛选"
              className={cn(
                'h-6 w-auto gap-1 rounded-full px-2 text-[11px] focus-visible:ring-2',
                filterValue
                  ? 'border-solid bg-secondary text-secondary-foreground'
                  : 'border-dashed bg-transparent text-muted-foreground hover:bg-accent',
              )}
            >
              <SlidersHorizontal className="h-3 w-3" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="all">全部类型</SelectItem>
              {filterGroups.map((group) => (
                <SelectGroup key={group.label}>
                  <SelectLabel>{group.label}</SelectLabel>
                  {group.options.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          {filterValue && (
            <button
              type="button"
              className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => setFilterValue('')}
            >
              清除
            </button>
          )}
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
          {results.map(node => (
            <div
              key={node.id}
              className="p-2 hover:bg-accent cursor-pointer"
              onMouseDown={(e) => e.preventDefault()} // Prevent onBlur from firing before onClick
              onClick={() => handleSelectNode(node)}
            >
              <div className="flex justify-between items-center">
                <p className="font-semibold truncate">{node.title}</p>
                <span className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  nodeBadgeColor(node)
                )}>
                  {typeLabel(node) || NODE_TYPE_META[node.type].label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate mt-1">{node.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;
