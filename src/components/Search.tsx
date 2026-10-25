import { useState, useMemo } from 'react';
import { Input } from './ui/input';
import { nodesMatching, searchNodes, type SearchFilter } from '../lib/graph';
import { NODE_TYPE_META, typeLabel, type Node, type NodeType } from '../lib/schema';
import { nodeBadgeColor } from './nodeColors';
import { useGraphStore } from '../stores/useGraphStore';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';

interface SearchProps {
  onSelectNode?: (node: Node) => void;
  /** 是否显示类型 / 细分筛选（全局搜索用） */
  showFilters?: boolean;
}

/** 筛选器选项：按 type 或 type + kind */
const FILTER_GROUPS: { label: string; options: { value: string; label: string }[] }[] = [
  { label: '结构', options: [{ value: 'section', label: '章节' }] },
  {
    label: '知识',
    options: [
      { value: 'definition', label: '定义' },
      { value: 'note', label: '笔记（全部）' },
      { value: 'note:method', label: '方法' },
      { value: 'note:context', label: '语境' },
      { value: 'note:summary', label: '总结' },
      { value: 'note:history', label: '数学文化' },
    ],
  },
  {
    label: '命题',
    options: [
      { value: 'proposition', label: '命题（全部）' },
      { value: 'proposition:theorem', label: '定理' },
      { value: 'proposition:lemma', label: '引理' },
      { value: 'proposition:corollary', label: '推论' },
      { value: 'proposition:property', label: '性质' },
      { value: 'proposition:formula', label: '公式' },
      { value: 'proposition:criterion', label: '判定' },
      { value: 'proposition:claim', label: '断言' },
    ],
  },
  {
    label: '题目',
    options: [
      { value: 'problem', label: '题目（全部）' },
      { value: 'problem:example', label: '例题' },
      { value: 'problem:exercise', label: '练习' },
      { value: 'problem:exploration', label: '探究' },
      { value: 'problem:review', label: '复习' },
    ],
  },
  {
    label: '其他',
    options: [
      { value: 'proof', label: '证明' },
      { value: 'counterexample', label: '反例' },
      { value: 'attempt', label: '解题记录' },
    ],
  },
];

const Search = ({ onSelectNode, showFilters = false }: SearchProps) => {
  const index = useGraphStore(state => state.index);
  const select = useGraphStore(state => state.select);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [filterValue, setFilterValue] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 300);

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
        <div className="mt-1 flex items-center justify-end gap-1">
          <select
            aria-label="按类型筛选"
            className="h-7 rounded-md border bg-background px-1 text-xs text-muted-foreground"
            value={filterValue}
            onChange={(e) => {
              setFilterValue(e.target.value);
              setIsOpen(true);
            }}
            onBlur={() => setTimeout(() => setIsOpen(false), 150)}
          >
            <option value="">全部类型</option>
            {FILTER_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
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
