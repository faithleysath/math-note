import { useState, useEffect } from 'react';
import { Input } from './ui/input';
import { searchNodes } from '../lib/db';
import type { Node } from '../lib/types';
import { useAppStore } from '../stores/useAppStore';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchProps {
  onSelectNode?: (node: Node) => void;
}

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
              <p className="font-semibold">{node.title}</p>
              <p className="text-xs text-muted-foreground truncate">{node.content}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;
