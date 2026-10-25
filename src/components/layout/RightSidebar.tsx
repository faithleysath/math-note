import { useState, useMemo } from 'react';
import { useGraphStore } from '../../stores/useGraphStore';
import RelatedNodesList from '../RelatedNodesList';
import { useRelatedNodes } from '../../hooks/useRelatedNodes';
import RelationshipGraph from '../RelationshipGraph';
import { Button } from '../ui/button';
import AddEdgeDialog from '../AddEdgeDialog';
import { Link, ChevronRight, X } from 'lucide-react';
import { ancestorNodes, inferLogicalRelations } from '../../lib/graph';
import { NODE_TYPE_META, REVIEW_STATE_LABEL } from '../../lib/schema';
import { useWindowSize } from '@/hooks/useWindowSize';

const RightSidebar = () => {
  const index = useGraphStore(state => state.index);
  const selectedId = useGraphStore(state => state.selectedId);
  const select = useGraphStore(state => state.select);
  const setMobileView = useGraphStore(state => state.setMobileView);
  const { width } = useWindowSize();
  const isMobile = width <= 768;
  const [isAddEdgeOpen, setIsAddEdgeOpen] = useState(false);
  const [reasonMode, setReasonMode] = useState<'navigation' | 'reviewed-only'>('navigation');

  const selectedNode = selectedId ? index.nodes.get(selectedId) : undefined;

  const { outgoing, incoming } = useRelatedNodes(selectedId ?? undefined);

  const derived = useMemo(() => {
    if (!selectedId) return [];
    return inferLogicalRelations(index, selectedId, { mode: reasonMode });
  }, [index, selectedId, reasonMode]);

  const ancestors = useMemo(
    () => (selectedNode ? [...ancestorNodes(index, selectedNode.id), selectedNode] : []),
    [index, selectedNode],
  );

  return (
    <div className="h-full p-4 overflow-y-auto">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-md font-semibold">详细信息</h2>
        {isMobile && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMobileView('main')}>
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {!selectedNode ? (
        <div className="flex h-[calc(100%-4rem)] items-center justify-center">
          <p className="text-muted-foreground">未选择节点。</p>
        </div>
      ) : (
        <>
          {ancestors.length > 0 && (
            <div className="mb-4">
              <h3 className="text-md font-semibold mb-2">内容导航</h3>
              <div className="flex flex-wrap items-center text-sm text-muted-foreground">
                {ancestors.map((ancestor, position) => (
                  <div key={ancestor.id} className="flex items-center">
                    <span
                      className="hover:underline cursor-pointer"
                      onClick={() => select(ancestor.id)}
                    >
                      {ancestor.title}
                    </span>
                    {position < ancestors.length - 1 && <ChevronRight className="h-4 w-4 mx-1" />}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2 text-sm mb-6">
            <div>
              <span className="font-semibold">标题:</span>
              <span className="ml-2 text-muted-foreground">{selectedNode.title}</span>
            </div>
            {selectedNode.aliases && selectedNode.aliases.length > 0 && (
              <div>
                <span className="font-semibold">别名:</span>
                <span className="ml-2 text-muted-foreground">{selectedNode.aliases.join(', ')}</span>
              </div>
            )}
            <div>
              <span className="font-semibold">类型:</span>
              <span className="ml-2 text-muted-foreground">{NODE_TYPE_META[selectedNode.type].label}</span>
            </div>
            <div>
              <span className="font-semibold">ID:</span>
              <span className="ml-2 text-muted-foreground break-all">{selectedNode.id}</span>
            </div>
            {selectedNode.tags && selectedNode.tags.length > 0 && (
              <div className="flex items-start">
                <span className="font-semibold mr-2">标签:</span>
                <div className="flex flex-wrap gap-2">
                  {selectedNode.tags.map(tag => (
                    <span key={tag} className="bg-secondary text-secondary-foreground text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {selectedNode.attempt && (
              <div>
                <span className="font-semibold">尝试:</span>
                <span className="ml-2 text-muted-foreground">
                  {[
                    selectedNode.attempt.correct === true ? '做对' : selectedNode.attempt.correct === false ? '做错' : null,
                    selectedNode.attempt.method,
                    selectedNode.attempt.durationMin != null ? `${selectedNode.attempt.durationMin} 分钟` : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </div>
            )}
            {selectedNode.citation?.book && (
              <div>
                <span className="font-semibold">来源:</span>
                <span className="ml-2 text-muted-foreground">{selectedNode.citation.book}</span>
              </div>
            )}
            <div>
              <span className="font-semibold">创建时间:</span>
              <span className="ml-2 text-muted-foreground">{new Date(selectedNode.createdAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="font-semibold">更新时间:</span>
              <span className="ml-2 text-muted-foreground">{new Date(selectedNode.updatedAt).toLocaleString()}</span>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2 border-b pb-2">
            <h3 className="text-md font-semibold">关系链接</h3>
            <Button variant="ghost" size="sm" onClick={() => setIsAddEdgeOpen(true)}>
              <Link className="h-4 w-4 mr-2" />
              链接新节点
            </Button>
          </div>
          {(incoming.length > 0 || outgoing.length > 0) && (
            <div className="mb-4">
              <RelationshipGraph selectedNode={selectedNode} incoming={incoming} outgoing={outgoing} />
            </div>
          )}
          <div className="text-sm">
            <RelatedNodesList />
          </div>

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2 border-b pb-2">
              <h3 className="text-md font-semibold">推理</h3>
              <div className="flex items-center space-x-1">
                <Button
                  size="sm"
                  variant={reasonMode === 'navigation' ? 'default' : 'outline'}
                  className="h-7"
                  onClick={() => setReasonMode('navigation')}
                >
                  全部关联
                </Button>
                <Button
                  size="sm"
                  variant={reasonMode === 'reviewed-only' ? 'default' : 'outline'}
                  className="h-7"
                  onClick={() => setReasonMode('reviewed-only')}
                >
                  仅已审核
                </Button>
              </div>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              只列能沿蕴含关系推到的结论；括号里是尚未满足的前提，不代表无条件成立。
            </p>
            {derived.length === 0 ? (
              <p className="text-sm text-muted-foreground">没有可推导的结论。</p>
            ) : (
              <ul className="space-y-2">
                {derived.map((relation) => {
                  const target = index.nodes.get(relation.to);
                  return (
                    <li key={`${relation.to}-${relation.edgePath.join('-')}`} className="text-sm">
                      <span
                        className="text-primary hover:underline cursor-pointer"
                        onClick={() => select(relation.to)}
                      >
                        {target?.title ?? relation.to}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {[
                          relation.predicate === 'iff' ? '等价' : '推导',
                          REVIEW_STATE_LABEL[relation.verification],
                          relation.unconditional ? '无条件' : '有前提',
                          relation.unresolvedConditions.length > 0
                            ? `未决：${relation.unresolvedConditions.join('；')}`
                            : null,
                          relation.requiredAssumptions.length > 0
                            ? `${relation.requiredAssumptions.length} 个结构化前提`
                            : null,
                          relation.contextId
                            ? `语境：${index.nodes.get(relation.contextId)?.title ?? relation.contextId}`
                            : '语境未知',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {isAddEdgeOpen && (
            <AddEdgeDialog
              sourceNode={selectedNode}
              isOpen={isAddEdgeOpen}
              onClose={() => setIsAddEdgeOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
};

export default RightSidebar;
