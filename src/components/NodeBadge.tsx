import { NODE_TYPE_META, type NodeType } from '@/lib/schema';
import { cn } from '@/lib/utils';

const COLORS: Record<NodeType, string> = {
  branch: 'border-slate-300 bg-slate-100 text-slate-700',
  chapter: 'border-indigo-300 bg-indigo-100 text-indigo-700',
  section: 'border-sky-300 bg-sky-100 text-sky-700',
  definition: 'border-blue-300 bg-blue-100 text-blue-700',
  theorem: 'border-emerald-300 bg-emerald-100 text-emerald-700',
  lemma: 'border-teal-300 bg-teal-100 text-teal-700',
  corollary: 'border-cyan-300 bg-cyan-100 text-cyan-700',
  example: 'border-orange-300 bg-orange-100 text-orange-700',
  exercise: 'border-violet-300 bg-violet-100 text-violet-700',
  note: 'border-amber-300 bg-amber-100 text-amber-800',
  attempt: 'border-rose-300 bg-rose-100 text-rose-700',
};

export function NodeBadge({ type, className }: { type: NodeType; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4',
        COLORS[type],
        className,
      )}
    >
      {NODE_TYPE_META[type].label}
    </span>
  );
}
