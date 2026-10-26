import {
  KIND_LABELS,
  KIND_OPTIONS,
  NODE_TYPE_META,
  SUBJECTS,
  SUBJECT_LABELS,
  type NodeType,
  type Predicate,
  type Subject,
} from './schema';

/**
 * 学科配置。它是代码里的静态注册表，不是插件平台：
 * 只影响编辑器推荐哪些 kind / 关系、以及是否自动生成教材编号。
 * 数据层仍然接受全学科合法 kind，跨学科内容可以放进「更多分类」。
 */

export type NumberingMode = 'generated' | 'source-first';

export interface SubjectProfile {
  subject: Subject;
  label: string;
  /** 编辑器优先展示的 kind，不构成数据合法性限制 */
  preferredKinds: Partial<Record<NodeType, readonly string[]>>;
  /** 关系创建器优先展示的谓词 */
  preferredPredicates: readonly Predicate[];
  numberingMode: NumberingMode;
}

const CORE_PREDICATES: readonly Predicate[] = [
  'depends-on',
  'covers',
  'uses',
  'proves',
  'refutes',
  'implies',
  'iff',
  'generalizes',
  'cites',
];

const SCIENCE_PREDICATES: readonly Predicate[] = [
  'depends-on',
  'covers',
  'uses',
  'supports',
  'proves',
  'implies',
  'iff',
  'generalizes',
  'cites',
  'is-a',
  'part-of',
];

export const SUBJECT_PROFILES: Record<Subject, SubjectProfile> = {
  math: {
    subject: 'math',
    label: SUBJECT_LABELS.math,
    preferredKinds: {
      section: ['chapter', 'section', 'subsection', 'topic'],
      definition: ['notation'],
      proposition: ['theorem', 'lemma', 'corollary', 'property', 'formula', 'criterion', 'claim'],
      proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
      problem: ['example', 'exercise', 'exploration', 'review'],
      note: ['explanation', 'method', 'summary', 'history', 'context', 'topic', 'remark'],
      counterexample: ['numerical', 'geometric', 'other'],
    },
    preferredPredicates: CORE_PREDICATES,
    numberingMode: 'generated',
  },
  physics: {
    subject: 'physics',
    label: SUBJECT_LABELS.physics,
    preferredKinds: {
      section: ['chapter', 'section', 'subsection', 'topic'],
      definition: ['notation'],
      proposition: ['law', 'principle', 'formula', 'property', 'claim', 'theorem', 'criterion'],
      proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
      problem: ['example', 'exercise', 'exploration', 'review'],
      note: [
        'experiment',
        'phenomenon',
        'model',
        'process',
        'structure',
        'explanation',
        'method',
        'summary',
        'context',
        'remark',
        'history',
        'topic',
      ],
      counterexample: ['numerical', 'geometric', 'other'],
    },
    preferredPredicates: SCIENCE_PREDICATES,
    numberingMode: 'source-first',
  },
  chemistry: {
    subject: 'chemistry',
    label: SUBJECT_LABELS.chemistry,
    preferredKinds: {
      section: ['chapter', 'section', 'subsection', 'topic'],
      definition: ['notation'],
      proposition: ['law', 'reaction', 'principle', 'formula', 'property', 'claim', 'theorem', 'criterion'],
      proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
      problem: ['example', 'exercise', 'exploration', 'review'],
      note: [
        'experiment',
        'process',
        'structure',
        'model',
        'phenomenon',
        'explanation',
        'method',
        'summary',
        'context',
        'remark',
        'history',
        'topic',
      ],
      counterexample: ['numerical', 'geometric', 'other'],
    },
    preferredPredicates: SCIENCE_PREDICATES,
    numberingMode: 'source-first',
  },
  biology: {
    subject: 'biology',
    label: SUBJECT_LABELS.biology,
    preferredKinds: {
      section: ['chapter', 'section', 'subsection', 'topic'],
      definition: ['notation'],
      proposition: ['law', 'principle', 'property', 'claim', 'formula', 'theorem', 'criterion'],
      proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
      problem: ['example', 'exercise', 'exploration', 'review'],
      note: [
        'structure',
        'process',
        'experiment',
        'phenomenon',
        'model',
        'explanation',
        'method',
        'summary',
        'context',
        'remark',
        'history',
        'topic',
      ],
      counterexample: ['numerical', 'geometric', 'other'],
    },
    preferredPredicates: SCIENCE_PREDICATES,
    numberingMode: 'source-first',
  },
  science: {
    subject: 'science',
    label: SUBJECT_LABELS.science,
    preferredKinds: {
      section: ['chapter', 'section', 'subsection', 'topic'],
      definition: ['notation'],
      proposition: ['law', 'principle', 'reaction', 'formula', 'property', 'claim', 'theorem', 'criterion'],
      proof: ['direct', 'contradiction', 'induction', 'geometric', 'other'],
      problem: ['example', 'exercise', 'exploration', 'review'],
      note: [
        'experiment',
        'model',
        'phenomenon',
        'process',
        'structure',
        'explanation',
        'method',
        'summary',
        'context',
        'remark',
        'history',
        'topic',
      ],
      counterexample: ['numerical', 'geometric', 'other'],
    },
    preferredPredicates: SCIENCE_PREDICATES,
    numberingMode: 'source-first',
  },
};

export function subjectProfile(subject: Subject | null | undefined): SubjectProfile {
  return SUBJECT_PROFILES[subject ?? 'math'];
}

export function isSubject(value: unknown): value is Subject {
  return typeof value === 'string' && (SUBJECTS as readonly string[]).includes(value);
}

export interface KindOptions {
  preferred: string[];
  more: string[];
}

/**
 * 某个 type 在当前学科下的 kind 推荐顺序。
 * `more` 仍然来自 KIND_OPTIONS 全集，跨学科内容不会被拒绝。
 */
export function kindOptionsFor(subject: Subject | null | undefined, type: NodeType): KindOptions {
  const all = KIND_OPTIONS[type];
  const preferred = (subjectProfile(subject).preferredKinds[type] ?? []).filter((kind) =>
    all.includes(kind),
  );
  const preferredSet = new Set(preferred);
  return {
    preferred: [...preferred],
    more: all.filter((kind) => !preferredSet.has(kind)),
  };
}

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterGroup {
  label: string;
  options: FilterOption[];
}

const FILTER_STRUCTURE: { label: string; types: NodeType[] }[] = [
  { label: '结构', types: ['section'] },
  { label: '知识', types: ['definition', 'note'] },
  { label: '命题', types: ['proposition'] },
  { label: '题目', types: ['problem'] },
  { label: '其他', types: ['proof', 'counterexample', 'attempt'] },
];

/** 搜索框的筛选器：推荐 kind 在前，其余 kind 仍能选到 */
export function filterGroupsFor(subject: Subject | null | undefined): FilterGroup[] {
  const groups: FilterGroup[] = [];
  for (const group of FILTER_STRUCTURE) {
    const raw: (FilterOption & { type?: NodeType })[] = [];
    for (const type of group.types) {
      const kinds = KIND_OPTIONS[type];
      if (kinds.length <= 1) {
        raw.push({ value: type, label: NODE_TYPE_META[type].label });
        continue;
      }
      raw.push({ value: type, label: `全部${NODE_TYPE_META[type].label}` });
      const { preferred, more } = kindOptionsFor(subject, type);
      for (const kind of [...preferred, ...more]) {
        const label = KIND_LABELS[kind] ?? kind;
        raw.push({ value: `${type}:${kind}`, label, type });
      }
    }
    // 不同 type 可能有同名 kind（如「主题」「几何法」），重复时带上类型前缀
    const counts = new Map<string, number>();
    for (const option of raw) counts.set(option.label, (counts.get(option.label) ?? 0) + 1);
    const options: FilterOption[] = raw.map((option) =>
      option.type && (counts.get(option.label) ?? 0) > 1
        ? {
            value: option.value,
            label: `${NODE_TYPE_META[option.type].label} · ${option.label}`,
          }
        : { value: option.value, label: option.label },
    );
    if (options.length > 0) groups.push({ label: group.label, options });
  }
  return groups;
}

/** 关系按钮的排序：当前学科推荐的谓词在前 */
export function predicatePreference(subject: Subject | null | undefined): Map<Predicate, number> {
  const order = new Map<Predicate, number>();
  subjectProfile(subject).preferredPredicates.forEach((predicate, index) => order.set(predicate, index));
  return order;
}
