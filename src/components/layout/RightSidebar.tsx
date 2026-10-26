import { useState, useMemo } from 'react';
import { useGraphStore } from '../../stores/useGraphStore';
import RelatedNodesList from '../RelatedNodesList';
import { useRelatedNodes } from '../../hooks/useRelatedNodes';
import RelationshipGraph from '../RelationshipGraph';
import { Button } from '../ui/button';
import AddEdgeDialog from '../AddEdgeDialog';
import StepDialog from '../StepDialog';
import { Link, ChevronRight, X } from 'lucide-react';
import {
  ancestorNodes,
  coveredKnowledge,
  coveringProblems,
  stepsForNode,
} from '../../lib/graph';
import { typeLabel, type Node } from '../../lib/schema';
import { useWindowSize } from '@/hooks/useWindowSize';

const RightSidebar = () => {
  const index = useGraphStore(state => state.index);
  const selectedId = useGraphStore(state => state.selectedId);
  const select = useGraphStore(state => state.select);
  const setMobileView = useGraphStore(state => state.setMobileView);
  const { width } = useWindowSize();
  const isMobile = width <= 768;
  const [isAddEdgeOpen, setIsAddEdgeOpen] = useState(false);
  const [isStepOpen, setIsStepOpen] = useState(false);

  const selectedNode = selectedId ? index.nodes.get(selectedId) : undefined;

  const { outgoing, incoming } = useRelatedNodes(selectedId ?? undefined);

  const relatedSteps = useMemo(() => {
    if (!selectedId) return [];
    const { asConclusion, asPremise } = stepsForNode(index, selectedId);
    const seen = new Set<string>();
    const merged: { step: (typeof asConclusion)[number]; role: 'conclusion' | 'premise' }[] = [];
    for (const step of asConclusion) {
      if (seen.has(step.id)) continue;
      seen.add(step.id);
      merged.push({ step, role: 'conclusion' });
    }
    for (const step of asPremise) {
      if (seen.has(step.id)) continue;
      seen.add(step.id);
      merged.push({ step, role: 'premise' });
    }
    return merged;
  }, [index, selectedId]);

  const deleteStep = useGraphStore((state) => state.deleteStep);

  const coversPanel = useMemo(() => {
    if (!selectedId || !selectedNode) return { mode: 'none' as const, items: [] as Node[] };
    if (selectedNode.type === 'problem') {
      return { mode: 'outgoing' as const, items: coveredKnowledge(index, selectedId) };
    }
    return { mode: 'incoming' as const, items: coveringProblems(index, selectedId) };
  }, [index, selectedId, selectedNode]);

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
              <span className="ml-2 text-muted-foreground">{typeLabel(selectedNode)}</span>
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
            {selectedNode.citation?.source && (
              <div>
                <span className="font-semibold">来源:</span>
                <span className="ml-2 text-muted-foreground">{selectedNode.citation.source}</span>
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

          {coversPanel.items.length > 0 && (
            <div className="mt-6">
              <div className="mb-2 border-b pb-2">
                <h3 className="text-md font-semibold">
                  {coversPanel.mode === 'outgoing'
                    ? `本题考查的知识点（${coversPanel.items.length}）`
                    : `考查此知识点的题目（${coversPanel.items.length}）`}
                </h3>
              </div>
              <ul className="space-y-1">
                {coversPanel.items.map(item => (
                  <li key={item.id} className="flex items-baseline gap-2 text-sm">
                    <button
                      className="text-left text-primary hover:underline"
                      onClick={() => select(item.id)}
                    >
                      {item.title}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{typeLabel(item)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-muted-foreground">按 covers 关系统计。</p>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center justify-between mb-2 border-b pb-2">
              <h3 className="text-md font-semibold">推理步骤</h3>
              <Button variant="ghost" size="sm" onClick={() => setIsStepOpen(true)}>
                <Link className="h-4 w-4 mr-2" />
                新建步骤
              </Button>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              多个前提必须同时成立才能推出结论。单个前提就够的情况请用关系边。
            </p>
            {relatedSteps.length === 0 ? (
              <p className="text-sm text-muted-foreground">还没有涉及这个节点的推理步骤。</p>
            ) : (
              <ul className="space-y-2">
                {relatedSteps.map(({ step, role }) => {
                  const premiseTitles = step.premiseIds
                    .map((id) => index.nodes.get(id)?.title ?? id)
                    .join(' + ');
                  const conclusionTitle = index.nodes.get(step.conclusionId)?.title ?? step.conclusionId;
                  return (
                    <li key={step.id} className="text-sm flex items-start group">
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          {role === 'conclusion' ? '作为结论' : '作为前提'}
                        </p>
                        <p>
                          {premiseTitles} ⇒ {conclusionTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            `规则：${step.rule}`,
                            step.contextId
                              ? `语境：${index.nodes.get(step.contextId)?.title ?? step.contextId}`
                              : '语境未知',
                          ].join(' · ')}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => void deleteStep(step.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {isStepOpen && (
            <StepDialog
              isOpen={isStepOpen}
              onClose={() => setIsStepOpen(false)}
              defaultConclusionId={selectedNode.id}
            />
          )}
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
