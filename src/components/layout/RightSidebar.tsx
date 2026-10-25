import { useEffect, useMemo, useState } from 'react';
import { Link2, Trash2 } from 'lucide-react';
import AddEdgeDialog from '@/components/AddEdgeDialog';
import { RelationshipGraph } from '@/components/RelationshipGraph';
import { NodeBadge } from '@/components/NodeBadge';
import { Button } from '@/components/ui/button';
import { ancestorNodes, equivalenceClasses, reachable } from '@/lib/graph';
import { describeEdge, FAMILY_META } from '@/lib/predicates';
import type { PredicateFamily } from '@/lib/predicates';
import { NODE_TYPE_META } from '@/lib/schema';
import { useGraphStore } from '@/stores/useGraphStore';

function Section({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function RightSidebar() {
  const index = useGraphStore((state) => state.index);
  const selectedId = useGraphStore((state) => state.selectedId);
  const select = useGraphStore((state) => state.select);
  const deleteEdge = useGraphStore((state) => state.deleteEdge);
  const setEditing = useGraphStore((state) => state.setEditing);
  const readOnly = useGraphStore((state) => state.readOnly);

  const [edgeDialogOpen, setEdgeDialogOpen] = useState(false);
  const [showIndirect, setShowIndirect] = useState(false);

  const node = selectedId ? index.nodes.get(selectedId) : null;

  useEffect(() => {
    setShowIndirect(false);
  }, [selectedId]);

  const relations = useMemo(() => {
    if (!node) return [];
    return index.edges
      .filter((edge) => edge.from === node.id || edge.to === node.id)
      .map((edge) => ({ edge, ...describeEdge(edge, node.id, index.nodes) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [index, node]);

  const grouped = useMemo(() => {
    const groups = new Map<PredicateFamily, typeof relations>();
    for (const relation of relations) {
      const family = relation.edge.predicate;
      const key =
        family === 'depends-on' || family === 'cites'
          ? 'epistemic'
          : family === 'proves' || family === 'refutes'
            ? 'evidential'
            : 'logical';
      const list = groups.get(key) ?? [];
      list.push(relation);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(
      (a, b) => FAMILY_META[a[0]].order - FAMILY_META[b[0]].order,
    );
  }, [relations]);

  const indirect = useMemo(() => {
    if (!node) return [];
    const ids = reachable(index, node.id, 'depends-on');
    return [...ids]
      .map((id) => index.nodes.get(id))
      .filter(Boolean)
      .map((item) => item!);
  }, [index, node]);

  const equivalent = useMemo(() => {
    if (!node) return [];
    const classes = equivalenceClasses(index, 'iff');
    const found = classes.find((group) => group.includes(node.id));
    if (!found) return [];
    return found
      .filter((id) => id !== node.id)
      .map((id) => index.nodes.get(id))
      .filter(Boolean)
      .map((item) => item!);
  }, [index, node]);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">未选择节点</p>
      </div>
    );
  }

  const trail = ancestorNodes(index, node.id);
  const number = index.numbering.get(node.id);

  return (
    <div className="h-full overflow-y-auto p-3">
      <Section title="位置">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-muted-foreground">
          {trail.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              <button className="hover:underline" onClick={() => select(ancestor.id)}>
                {ancestor.title}
              </button>
              <span>/</span>
            </span>
          ))}
          <span className="font-medium text-foreground">{node.title}</span>
        </div>
      </Section>

      <Section title="节点">
        <div className="space-y-1.5 text-xs">
          <div className="flex items-center gap-2">
            <NodeBadge type={node.type} />
            {number && <span className="font-semibold text-foreground">{number}</span>}
          </div>
          {node.key && (
            <div className="flex gap-1">
              <span className="text-muted-foreground">术语键</span>
              <span className="font-mono">{node.key}</span>
            </div>
          )}
          {node.aliases?.length ? (
            <div className="flex flex-wrap gap-1">
              <span className="text-muted-foreground">别名</span>
              {node.aliases.map((alias) => (
                <span key={alias} className="rounded bg-muted px-1">
                  {alias}
                </span>
              ))}
            </div>
          ) : null}
          {node.tags?.length ? (
            <div className="flex flex-wrap gap-1">
              <span className="text-muted-foreground">标签</span>
              {node.tags.map((tag) => (
                <span key={tag} className="rounded bg-muted px-1">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          {node.citation && (node.citation.book || node.citation.page) && (
            <div className="text-muted-foreground">
              出处：{[node.citation.book, node.citation.page && `p.${node.citation.page}`, node.citation.theoremNo]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          {node.attempt && (
            <div className="flex flex-wrap gap-2 text-muted-foreground">
              {node.attempt.correct === true && <span className="text-emerald-600">做对</span>}
              {node.attempt.correct === false && <span className="text-rose-600">做错</span>}
              {node.attempt.method && <span>{node.attempt.method}</span>}
              {typeof node.attempt.durationMin === 'number' && <span>{node.attempt.durationMin} 分钟</span>}
            </div>
          )}
        </div>
        {!readOnly && (
          <Button
            size="sm"
            variant="outline"
            className="mt-2 h-7 text-xs"
            onClick={() => setEditing(node.id)}
          >
            编辑
          </Button>
        )}
      </Section>

      <Section
        title={`关系（${relations.length}）`}
        extra={
          !readOnly ? (
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setEdgeDialogOpen(true)}>
              <Link2 className="mr-1 h-3 w-3" />
              添加
            </Button>
          ) : null
        }
      >
        {relations.length === 0 && <p className="text-xs text-muted-foreground">还没有关系。</p>}
        <div className="space-y-3">
          {grouped.map(([family, list]) => (
            <div key={family}>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">
                {FAMILY_META[family].label}
              </p>
              <ul className="space-y-1">
                {list.map((relation) => {
                  const other = index.nodes.get(relation.otherId);
                  return (
                    <li key={relation.edge.id} className="group rounded border bg-background px-2 py-1">
                      <div className="flex items-start gap-1">
                        <span className="mt-0.5 shrink-0 rounded bg-muted px-1 text-[11px]">
                          {relation.label}
                        </span>
                        <button
                          className="flex-1 truncate text-left text-xs hover:underline"
                          onClick={() => select(relation.otherId)}
                        >
                          {other?.title ?? relation.otherId}
                        </button>
                        {!readOnly && (
                          <button
                            className="opacity-0 transition-opacity group-hover:opacity-100"
                            title="删除关系"
                            onClick={() => void deleteEdge(relation.edge.id)}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </button>
                        )}
                      </div>
                      {relation.edge.condition && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          前提：{relation.edge.condition}
                        </p>
                      )}
                      {relation.edge.note && (
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{relation.edge.note}</p>
                      )}
                      {relation.edge.status && relation.edge.status !== 'asserted' && (
                        <p className="mt-0.5 text-[11px] text-amber-600">
                          {relation.edge.status === 'conjecture' ? '猜想' : '已推翻'}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {indirect.length > 0 && (
        <Section
          title={`间接依赖（${indirect.length}）`}
          extra={
            <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => setShowIndirect((v) => !v)}>
              {showIndirect ? '收起' : '展开'}
            </Button>
          }
        >
          {showIndirect && (
            <ul className="space-y-0.5">
              {indirect.map((item) => (
                <li key={item.id}>
                  <button className="text-xs text-muted-foreground hover:underline" onClick={() => select(item.id)}>
                    · {index.numbering.get(item.id) ?? NODE_TYPE_META[item.type].label} {item.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {equivalent.length > 0 && (
        <Section title={`等价命题（${equivalent.length}）`}>
          <ul className="space-y-0.5">
            {equivalent.map((item) => (
              <li key={item.id}>
                <button className="text-xs text-muted-foreground hover:underline" onClick={() => select(item.id)}>
                  · {index.numbering.get(item.id) ?? item.title} {item.title}
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="关系图">
        <RelationshipGraph nodeId={node.id} />
      </Section>

      {edgeDialogOpen && (
        <AddEdgeDialog sourceId={node.id} isOpen={edgeDialogOpen} onClose={() => setEdgeDialogOpen(false)} />
      )}
    </div>
  );
}

export default RightSidebar;
