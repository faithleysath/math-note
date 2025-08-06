import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { searchNodes } from '../lib/db';
import type { Node } from '../lib/types';
import { useAppStore } from '../stores/useAppStore';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchProps {
  onSelectNode?: (node: Node) => void;
}

const nodeTypeColors: Record<Node['type'], string> = {
  分支: 'bg-gray-200 text-gray-800',
  主章节: 'bg-slate-200 text-slate-800',
  子章节: 'bg-stone-200 text-stone-800',
  定义: 'bg-blue-100 text-blue-800',
  定理: 'bg-green-100 text-green-800',
  引理: 'bg-teal-100 text-teal-800',
  推论: 'bg-cyan-100 text-cyan-800',
  例题: 'bg-orange-100 text-orange-800',
  练习: 'bg-purple-100 text-purple-800',
  解题记录: 'bg-red-100 text-red-800',
  笔记: 'bg-yellow-100 text-yellow-800',
};

const Search = ({ onSelectNode }: SearchProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Node[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const setSelectedNodeById = useAppStore(state => state.setSelectedNodeById);
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

  useEffect(() => {
    if (debouncedSearchTerm.length > 1) {
      searchNodes(debouncedSearchTerm).then(setResults);
    } else {
      setResults([]);
    }
  }, [debouncedSearchTerm]);

  const handleSelectNode = (node: Node) => {
    if (onSelectNode) {
      onSelectNode(node);
    } else {
      setSelectedNodeById(node.id);
    }
    setSearchTerm('');
    setResults([]);
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
                  {node.type}
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
