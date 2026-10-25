import { useState, useMemo } from 'react';
import { Input } from './ui/input';
import { searchNodes } from '../lib/graph';
import { NODE_TYPE_META, typeLabel, type Node } from '../lib/schema';
import { nodeBadgeColor } from './nodeColors';
import { useGraphStore } from '../stores/useGraphStore';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchProps {
  onSelectNode?: (node: Node) => void;
}

const Search = ({ onSelectNode }: SearchProps) => {
  const index = useGraphStore(state => state.index);
  const select = useGraphStore(state => state.select);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  const results = useMemo(() => {
    if (debouncedSearchTerm.length > 1) {
      return searchNodes(index, debouncedSearchTerm).map(hit => hit.node);
    }
    return [] as Node[];
  }, [debouncedSearchTerm, index]);

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
