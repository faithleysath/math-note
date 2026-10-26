import type { NodeType, Predicate } from './schema';

// =============================================================================
// 谓词注册表（恰好 9 种）
// =============================================================================
// 这张表是关系的唯一真相来源：UI 按钮、方向判断、校验规则、显示文案、
// 图谱箭头、推理规则全部从这里生成。

type PredicateFamily = 'semantic' | 'epistemic' | 'evidential' | 'logical';

interface TypePair {
  from: NodeType;
  to: NodeType;
}

interface PredicateSpec {
  family: PredicateFamily;
  /** from 侧看这条边叫什么 */
  fromLabel: string;
  /** to 侧（反向）看这条边叫什么 */
  inverseLabel: string;
  /** 拼句子用的动词 */
  verb: string;
  /** 这条关系是否参与数学推理（implies / iff） */
  logical: boolean;
  /**
   * 可传递：A→B→C 蕴含 A→C。
   * 只对结构/学习查询有意义；数学推理必须逐边检查条件与语境。
   */
  transitive: boolean;
  /** 对称：A↔B 与 B↔A 是同一事实 */
  symmetric: boolean;
  /** 构成等价类 */
  equivalence: boolean;
  /**
   * 是否禁止成环。只有 depends-on（学习前置）禁止：
   * 它要求 DAG。implies / iff 允许成环。
   */
  forbidCycle: boolean;
  /** 允许出现的 from 类型 */
  from: NodeType[];
  /** 允许出现的 to 类型 */
  to: NodeType[];
  /** 需要精确到 (from,to) 组合时使用，例如 generalizes 只能同类推广 */
  pairs?: TypePair[];
  /** 是否提供「方向反转」的输入方式（充分条件 / 必要条件） */
  swappable: boolean;
}

/** 可以承载学习内容的节点（depends-on 的起点） */
const LEARNABLE: NodeType[] = [
  'section',
  'definition',
  'proposition',
  'proof',
  'problem',
  'note',
  'attempt',
  'counterexample',
];

/** 可以被依赖 / 使用 / 考查的知识点（终点） */
const KNOWLEDGE: NodeType[] = ['section', 'definition', 'proposition', 'note'];

/** 可以作为证明/解法来源的节点 */
const EVIDENCE_SOURCES: NodeType[] = ['proof', 'attempt', 'problem', 'note'];

/** cites 的端点：除 branch 外的一切 */
const CITABLE: NodeType[] = [
  'section',
  'definition',
  'proposition',
  'proof',
  'problem',
  'note',
  'counterexample',
  'attempt',
];

const CLAIMS: NodeType[] = ['proposition'];

export const PREDICATE_SPECS: Record<Predicate, PredicateSpec> = {
  'depends-on': {
    family: 'epistemic',
    fromLabel: '依赖',
    inverseLabel: '被依赖',
    verb: '依赖',
    logical: false,
    transitive: true,
    symmetric: false,
    equivalence: false,
    // 学习前置关系必须是 DAG；这不是数学矛盾
    forbidCycle: true,
    from: LEARNABLE,
    to: KNOWLEDGE,
    swappable: false,
  },
  covers: {
    family: 'semantic',
    fromLabel: '考查',
    inverseLabel: '被考查',
    verb: '考查了',
    logical: false,
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: ['problem'],
    to: KNOWLEDGE,
    swappable: false,
  },
  uses: {
    family: 'semantic',
    fromLabel: '使用',
    inverseLabel: '被使用',
    verb: '使用了',
    logical: false,
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: EVIDENCE_SOURCES,
    to: KNOWLEDGE,
    swappable: false,
  },
  proves: {
    family: 'evidential',
    fromLabel: '证明',
    inverseLabel: '被证明',
    verb: '证明了',
    logical: false,
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: ['proof'],
    to: CLAIMS,
    swappable: false,
  },
  refutes: {
    family: 'evidential',
    fromLabel: '反例',
    inverseLabel: '被反驳',
    verb: '反驳了',
    logical: false,
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: ['counterexample'],
    to: CLAIMS,
    swappable: false,
  },
  implies: {
    family: 'logical',
    fromLabel: '充分条件',
    inverseLabel: '必要条件',
    verb: '⇒',
    logical: true,
    transitive: true,
    symmetric: false,
    equivalence: false,
    // A⇒B 与 B⇒A 可以同时成立
    forbidCycle: false,
    from: CLAIMS,
    to: CLAIMS,
    swappable: true,
  },
  iff: {
    family: 'logical',
    fromLabel: '等价于',
    inverseLabel: '等价于',
    verb: '⇔',
    logical: true,
    transitive: true,
    symmetric: true,
    equivalence: true,
    forbidCycle: false,
    from: CLAIMS,
    to: CLAIMS,
    swappable: false,
  },
  generalizes: {
    family: 'logical',
    fromLabel: '推广',
    inverseLabel: '特例',
    verb: '推广了',
    logical: false,
    // 只作为已记录的语义关联，不做自动的跨语境传递推理
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: ['definition', 'proposition'],
    to: ['definition', 'proposition'],
    // 定义推广定义、命题推广命题，不能跨类型
    pairs: [
      { from: 'definition', to: 'definition' },
      { from: 'proposition', to: 'proposition' },
    ],
    swappable: true,
  },
  cites: {
    family: 'epistemic',
    fromLabel: '提及',
    inverseLabel: '被提及',
    verb: '提及了',
    logical: false,
    transitive: false,
    symmetric: false,
    equivalence: false,
    forbidCycle: false,
    from: CITABLE,
    to: CITABLE,
    swappable: false,
  },
};

const PREDICATE_LIST = Object.keys(PREDICATE_SPECS) as Predicate[];

// =============================================================================
// 方向与允许性
// =============================================================================

interface ApplicablePredicate {
  predicate: Predicate;
  /** true 表示这条边应当存成 target → source */
  reversed: boolean;
}

/** 某个谓词是否允许 fromType → toType */
export function isDirectionAllowed(predicate: Predicate, fromType: NodeType, toType: NodeType): boolean {
  const spec = PREDICATE_SPECS[predicate];
  if (spec.pairs) {
    return spec.pairs.some((pair) => pair.from === fromType && pair.to === toType);
  }
  return spec.from.includes(fromType) && spec.to.includes(toType);
}

export function applicablePredicates(fromType: NodeType, toType: NodeType): ApplicablePredicate[] {
  const result: ApplicablePredicate[] = [];
  for (const predicate of PREDICATE_LIST) {
    const spec = PREDICATE_SPECS[predicate];
    const forwardOk = isDirectionAllowed(predicate, fromType, toType);
    const backwardOk = isDirectionAllowed(predicate, toType, fromType);
    if (forwardOk) {
      result.push({ predicate, reversed: false });
    }
    // 可换方向的说法（充分条件 / 必要条件、推广 / 特例）两个方向都给
    if (backwardOk && (spec.swappable || !forwardOk)) {
      result.push({ predicate, reversed: true });
    }
  }
  return result;
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
