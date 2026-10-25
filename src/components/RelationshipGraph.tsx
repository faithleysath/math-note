import { useEffect, useMemo, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { PREDICATE_SPECS, mermaidArrow } from '@/lib/predicates';
import { useGraphStore } from '@/stores/useGraphStore';

interface RelationshipGraphProps {
  nodeId: string;
}

/** mermaid 的 id 只认字母数字下划线，标题里的 $ 和引号会把图弄坏 */
function safeId(id: string): string {
  return `n_${id.replace(/[^a-zA-Z0-9]/g, '')}`;
}

function safeLabel(title: string): string {
  const cleaned = title
    .replace(/\$[^$]*\$/g, 'φ') // 公式换成中性符号，避免 KaTeX 语法进 mermaid
    .replace(/["<>{}[\]()|]/g, '')
    .slice(0, 28);
  return cleaned || '未命名';
}

export function RelationshipGraph({ nodeId }: RelationshipGraphProps) {
  const index = useGraphStore((state) => state.index);
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const renderId = useMemo(() => `rel-${Math.random().toString(36).slice(2)}`, []);

  const edges = useMemo(() => {
    const related = index.edges.filter((edge) => edge.from === nodeId || edge.to === nodeId);
    return related.slice(0, 24);
  }, [index, nodeId]);

  useEffect(() => {
    const node = index.nodes.get(nodeId);
    if (!node || edges.length === 0) return;

    let cancelled = false;
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });

    const lines = ['graph LR'];
    lines.push(`  ${safeId(nodeId)}["${safeLabel(node.title)}"]`);
    lines.push(`  style ${safeId(nodeId)} fill:#1d4ed8,color:#fff,stroke:#1e3a8a`);

    const declared = new Set<string>([safeId(nodeId)]);

    for (const edge of edges) {
      const other = index.nodes.get(edge.from === nodeId ? edge.to : edge.from);
      if (!other) continue;
      const otherId = safeId(other.id);
      if (!declared.has(otherId)) {
        lines.push(`  ${otherId}["${safeLabel(other.title)}"]`);
        declared.add(otherId);
      }
      const label = PREDICATE_SPECS[edge.predicate].fromLabel;
      const arrow = mermaidArrow(edge.predicate);
      lines.push(`  ${safeId(edge.from)} ${arrow}|"${label}"| ${safeId(edge.to)}`);
    }

    const definition = lines.join('\n');

    mermaid
      .render(renderId, definition)
      .then(({ svg }) => {
        if (cancelled) return;
        setFailed(false);
        if (containerRef.current) containerRef.current.innerHTML = svg;
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [edges, index, nodeId, renderId]);

  if (edges.length === 0) {
    return <p className="text-xs text-muted-foreground">还没有关系。点「添加关系」建一条。</p>;
  }

  return (
    <div>
      {failed ? (
        <p className="text-xs text-muted-foreground">关系图渲染失败，但关系本身没问题。</p>
      ) : (
        <div ref={containerRef} className="w-full overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full" />
      )}
    </div>
  );
}

export default RelationshipGraph;
