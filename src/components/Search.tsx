import { useState, useMemo } from 'react';
import { Input } from './ui/input';
import { searchNodes } from '../lib/graph';
import { NODE_TYPE_META, type Node, type NodeType } from '../lib/schema';
import { useGraphStore } from '../stores/useGraphStore';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchProps {
  onSelectNode?: (node: Node) => void;
}

const nodeTypeColors: Record<NodeType, string> = {
  branch: 'bg-gray-200 text-gray-800',
  chapter: 'bg-slate-200 text-slate-800',
  section: 'bg-stone-200 text-stone-800',
  definition: 'bg-blue-100 text-blue-800',
  theorem: 'bg-green-100 text-green-800',
  lemma: 'bg-teal-100 text-teal-800',
  corollary: 'bg-cyan-100 text-cyan-800',
  example: 'bg-orange-100 text-orange-800',
  exercise: 'bg-purple-100 text-purple-800',
  attempt: 'bg-red-100 text-red-800',
  note: 'bg-yellow-100 text-yellow-800',
  proof: 'bg-red-100 text-red-800',
  concept: 'bg-indigo-100 text-indigo-800',
  context: 'bg-zinc-100 text-zinc-800',
  counterexample: 'bg-rose-100 text-rose-800',
};

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
                  nodeTypeColors[node.type] || 'bg-gray-200 text-gray-800'
                )}>
                  {NODE_TYPE_META[node.type].label}
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
