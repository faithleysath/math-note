import type { Node, NodeType } from '../lib/schema';

/** 树 / 搜索结果里的短前缀 */
export function nodePrefix(node: Pick<Node, 'type' | 'kind'>): string {
  switch (node.type) {
    case 'definition':
      return 'Def: ';
    case 'proposition':
      switch (node.kind) {
        case 'lemma':
          return 'Lem: ';
        case 'corollary':
          return 'Cor: ';
        case 'property':
          return 'Prop: ';
        case 'formula':
          return 'Fml: ';
        case 'criterion':
          return 'Crit: ';
        case 'claim':
          return 'Claim: ';
        default:
          return 'Th: ';
      }
    case 'proof':
      return 'Pf: ';
    case 'problem':
      switch (node.kind) {
        case 'exercise':
          return 'Ex: ';
        case 'exploration':
          return 'Exp: ';
        case 'review':
          return 'Rev: ';
        default:
          return 'Eg: ';
      }
    case 'note':
      return 'Note: ';
    case 'counterexample':
      return 'Cex: ';
    case 'attempt':
      return 'Sol: ';
    default:
      return '';
  }
}

/** 树里的文字颜色 */
export function nodeTextColor(node: Pick<Node, 'type' | 'kind'>): string {
  switch (node.type) {
    case 'definition':
      return 'text-blue-600 dark:text-blue-400';
    case 'proposition':
      switch (node.kind) {
        case 'lemma':
          return 'text-teal-600 dark:text-teal-400';
        case 'corollary':
          return 'text-cyan-600 dark:text-cyan-400';
        case 'property':
          return 'text-emerald-600 dark:text-emerald-400';
        case 'formula':
          return 'text-lime-700 dark:text-lime-400';
        case 'criterion':
          return 'text-green-700 dark:text-green-400';
        case 'claim':
          return 'text-amber-700 dark:text-amber-400';
        default:
          return 'text-green-600 dark:text-green-400';
      }
    case 'proof':
      return 'text-red-600 dark:text-red-400';
    case 'problem':
      switch (node.kind) {
        case 'exercise':
          return 'text-purple-600 dark:text-purple-400';
        case 'exploration':
          return 'text-fuchsia-600 dark:text-fuchsia-400';
        case 'review':
          return 'text-violet-600 dark:text-violet-400';
        default:
          return 'text-orange-600 dark:text-orange-400';
      }
    case 'note':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'counterexample':
      return 'text-rose-600 dark:text-rose-400';
    case 'attempt':
      return 'text-rose-700 dark:text-rose-300';
    default:
      return '';
  }
}

/** 搜索下拉里的类型徽章 */
export function nodeBadgeColor(node: Pick<Node, 'type' | 'kind'>): string {
  if (node.type === 'section') {
    return node.kind === 'chapter' ? 'bg-slate-200 text-slate-800' : 'bg-stone-200 text-stone-800';
  }
  switch (node.type) {
    case 'branch':
      return 'bg-gray-200 text-gray-800';
    case 'definition':
      return 'bg-blue-100 text-blue-800';
    case 'proposition':
      return node.kind === 'lemma'
        ? 'bg-teal-100 text-teal-800'
        : node.kind === 'corollary'
          ? 'bg-cyan-100 text-cyan-800'
          : 'bg-green-100 text-green-800';
    case 'proof':
      return 'bg-red-100 text-red-800';
    case 'problem':
      return node.kind === 'exercise' ? 'bg-purple-100 text-purple-800' : 'bg-orange-100 text-orange-800';
    case 'note':
      return 'bg-yellow-100 text-yellow-800';
    case 'counterexample':
      return 'bg-rose-100 text-rose-800';
    case 'attempt':
      return 'bg-rose-100 text-rose-800';
    default:
      return 'bg-gray-200 text-gray-800';
  }
}

/** 新建对话框里类型按钮的边框配色 */
export const nodeTypeButtonColors: Record<NodeType, string> = {
  branch: 'border-gray-500 text-gray-500 hover:bg-gray-100',
  section: 'border-slate-500 text-slate-500 hover:bg-slate-100',
  definition: 'border-blue-500 text-blue-500 hover:bg-blue-50',
  proposition: 'border-green-500 text-green-500 hover:bg-green-50',
  proof: 'border-red-500 text-red-500 hover:bg-red-50',
  problem: 'border-orange-500 text-orange-500 hover:bg-orange-50',
  note: 'border-yellow-500 text-yellow-500 hover:bg-yellow-50',
  counterexample: 'border-rose-500 text-rose-500 hover:bg-rose-50',
  attempt: 'border-rose-500 text-rose-500 hover:bg-rose-50',
};
