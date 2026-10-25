import type { Node, NodeType, Predicate } from './schema';

// =============================================================================
// 谓词注册表
// =============================================================================
// 这张表是关系的唯一真相来源：UI 按钮、方向判断、校验规则、显示文案、
// 图谱箭头、推理规则全部从这里生成，不再散落在各个组件里。

export type PredicateFamily = 'epistemic' | 'evidential' | 'logical';

export interface PredicateSpec {
  family: PredicateFamily;
  /** from 侧看这条边叫什么 */
  fromLabel: string;
  /** to 侧（反向）看这条边叫什么 */
  inverseLabel: string;
  /** 拼句子用的动词 */
  verb: string;
  /** 可传递：A→B→C 蕴含 A→C */
  transitive: boolean;
  /** 对称：A↔B 与 B↔A 是同一事实 */
  symmetric: boolean;
  /** 构成等价类（只对 symmetric + transitive 有意义） */
  equivalence: boolean;
  /** 传递关系禁止成环（成环意味着逻辑上自洽但无信息量，且闭包会爆炸） */
  forbidCycle: boolean;
  /** 允许出现的 from / to 节点类型 */
  from: NodeType[];
  to: NodeType[];
  /** 是否提供「方向反转」的输入方式（如 必要条件 = implies 反向） */
  swappable: boolean;
}

const CONTENT: NodeType[] = [
  'chapter',
  'section',
  'definition',
  'theorem',
  'lemma',
  'corollary',
  'example',
  'exercise',
  'note',
  'attempt',
];

const CLAIMS: NodeType[] = ['definition', 'theorem', 'lemma', 'corollary'];

export const PREDICATE_SPECS: Record<Predicate, PredicateSpec> = {
  'depends-on': {
    family: 'epistemic',
    fromLabel: '依赖',
    inverseLabel: '被依赖',
    verb: '依赖',
    transitive: true,
    symmetric: false,
    equivalence: false,
    forbidCycle: true,
    from: CONTENT,
    to: CLAIMS,
    swappable: false,
  },
  cites: {
    family: 'epistemic',
    fromLabel: '提及',
    inverseLabel: '被提及',
    verb: '提及',
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: CONTENT,
    to: CONTENT,
    swappable: false,
  },
  proves: {
    family: 'evidential',
    fromLabel: '证明',
    inverseLabel: '被证明',
    verb: '证明了',
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: ['note', 'example', 'attempt', 'theorem'],
    to: ['theorem', 'lemma', 'corollary'],
    swappable: false,
  },
  refutes: {
    family: 'evidential',
    fromLabel: '反例',
    inverseLabel: '被反驳',
    verb: '反驳了',
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: ['note', 'example', 'exercise', 'attempt'],
    to: ['theorem', 'lemma', 'corollary', 'note'],
    swappable: false,
  },
  implies: {
    family: 'logical',
    fromLabel: '充分条件',
    inverseLabel: '必要条件',
    verb: '⇒',
    transitive: true,
    symmetric: false,
    equivalence: false,
    forbidCycle: true,
    from: [...CLAIMS, 'note'],
    to: [...CLAIMS, 'note'],
    swappable: true,
  },
  iff: {
    family: 'logical',
    fromLabel: '等价于',
    inverseLabel: '等价于',
    verb: '⇔',
    transitive: true,
    symmetric: true,
    equivalence: true,
    forbidCycle: true,
    from: [...CLAIMS, 'note'],
    to: [...CLAIMS, 'note'],
    swappable: false,
  },
  generalizes: {
    family: 'logical',
    fromLabel: '推广',
    inverseLabel: '特例',
    verb: '推广了',
    transitive: true,
    symmetric: false,
    equivalence: false,
    forbidCycle: true,
    from: [...CLAIMS, 'note'],
    to: [...CLAIMS, 'note'],
    swappable: true,
  },
};

export const FAMILY_META: Record<PredicateFamily, { label: string; order: number }> = {
  epistemic: { label: '引用与依赖', order: 1 },
  evidential: { label: '论证', order: 2 },
  logical: { label: '逻辑关系', order: 3 },
};

export const PREDICATE_LIST = Object.keys(PREDICATE_SPECS) as Predicate[];

export function predicatesByFamily(): { family: PredicateFamily; label: string; predicates: Predicate[] }[] {
  return (Object.keys(FAMILY_META) as PredicateFamily[])
    .sort((a, b) => FAMILY_META[a].order - FAMILY_META[b].order)
    .map((family) => ({
      family,
      label: FAMILY_META[family].label,
      predicates: PREDICATE_LIST.filter((p) => PREDICATE_SPECS[p].family === family),
    }));
}

// =============================================================================
// 方向与允许性
// =============================================================================

export interface ApplicablePredicate {
  predicate: Predicate;
  /** true 表示这条边应当存成 target → source */
  reversed: boolean;
}

/**
 * 给定两个节点类型，列出所有可用的谓词。
 * 反向也可用的谓词会带上 reversed 标记，由 UI 让用户选择方向。
 */
export function applicablePredicates(fromType: NodeType, toType: NodeType): ApplicablePredicate[] {
  const result: ApplicablePredicate[] = [];
  for (const predicate of PREDICATE_LIST) {
    const spec = PREDICATE_SPECS[predicate];
    const forwardOk = spec.from.includes(fromType) && spec.to.includes(toType);
    const backwardOk = spec.from.includes(toType) && spec.to.includes(fromType);
    if (forwardOk) {
      result.push({ predicate, reversed: false });
    }
    // 可换方向的说法（充分条件 / 必要条件）两个方向都给，
    // 单向关系在正方向不成立时才给出反向选项。
    if (backwardOk && (spec.swappable || !forwardOk)) {
      result.push({ predicate, reversed: true });
    }
  }
  return result;
}

export function isDirectionAllowed(predicate: Predicate, fromType: NodeType, toType: NodeType): boolean {
  const spec = PREDICATE_SPECS[predicate];
  return spec.from.includes(fromType) && spec.to.includes(toType);
}

/** 对称谓词的规范化：保证只存一条（按 id 字典序） */
export function canonicalizePair(
  predicate: Predicate,
  fromId: string,
  toId: string,
): { from: string; to: string } {
  if (PREDICATE_SPECS[predicate].symmetric && fromId > toId) {
    return { from: toId, to: fromId };
  }
  return { from: fromId, to: toId };
}

// =============================================================================
// 显示
// =============================================================================

export interface EdgeDescription {
  label: string;
  sentence: string;
  otherId: string;
  direction: 'out' | 'in';
}

export function describeEdge(edge: { from: string; to: string; predicate: Predicate }, viewerId: string, nodes: Map<string, Node>): EdgeDescription {
  const spec = PREDICATE_SPECS[edge.predicate];
  const fromNode = nodes.get(edge.from);
  const toNode = nodes.get(edge.to);
  const fromTitle = fromNode?.title ?? edge.from;
  const toTitle = toNode?.title ?? edge.to;
  const isFrom = viewerId === edge.from;
  const sentence = `${fromTitle} ${spec.verb} ${toTitle}`;
  return {
    label: isFrom ? spec.fromLabel : spec.inverseLabel,
    sentence,
    otherId: isFrom ? edge.to : edge.from,
    direction: isFrom ? 'out' : 'in',
  };
}

/** 图谱里用的箭头 */
export function mermaidArrow(predicate: Predicate): string {
  switch (predicate) {
    case 'implies':
      return '==>';
    case 'iff':
      return '<-->';
    case 'proves':
      return '==>';
    case 'cites':
    case 'refutes':
      return '-.->';
    default:
      return '-->';
  }
}

export function predicateLabel(predicate: Predicate): string {
  return `${PREDICATE_SPECS[predicate].fromLabel}（${predicate}）`;
}
