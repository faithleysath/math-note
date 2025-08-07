/**
 * 代表知识图谱中的一个内容单元。
 * 它可以是任何东西，从一个宽泛的学科到一个具体的定义或练习题。
 */
export interface Node {
  /** 节点的唯一标识符 (例如, UUID)。 */
  id: string;

  /** 此节点代表的内容类型。 */
  type: '分支' | '主章节' | '子章节' | '定义' | '定理' | '引理' | '推论' | '例题' | '笔记' | '练习' | '解题记录';

  /** 节点的标题，例如 "集合与映射" 或 "集合的定义"。标号应由程序根据顺序动态生成。 */
  title: string;

  /** 
   * 节点的主要内容，以 Markdown 格式存储。具体用途取决于节点类型：
   * - '分支', '主章节', '子章节': 对该部分的介绍、概述或学习目标。
   * - '定义', '定理', '笔记': 具体的文本内容。
   * - '例题', '练习': 题干描述。
   * - '解题记录': 对个人解法的评判或备注。
   */
  content: string;

  /**
   * 可选字段，用于存放解法或证明内容。
   * - 对于 '定理' 类型，这里是“教科书式证明”。
   * - 对于 '例题'/'练习' 类型，这里是“标准答案”。
   * - 对于 '解题记录' 类型，这里是“个人解法”。
   */
  solution?: string;

  /** 层级结构中父节点的 ID。根节点 ('分支') 的 parentId 为 `null`。 */
  parentId: string | null;

  /** 用于维持顺序的子节点 ID 的有序列表。 */
  children: string[];

  /** 用于分类和筛选的标签列表。 */
  tags?: string[];

  /** 别名，用于增强检索 */
  aliases?: string[];

  /** 来源 */
  source?: string;

  /** 节点创建时的时间戳。 */
  createdAt: number;

  /** 节点最后更新时的时间戳。 */
  updatedAt: number;
}

/**
 * 定义了节点之间所有可能的关系类型，以确保一致性。
 */
export type EdgeLabel = 
  | '是...的定义' // A 是 B 的定义 (例如, 定义关联到章节或定理)
  | '是...的定理' // A 是 B 的定理 (例如, 定理关联到章节或定义)
  | '引用' // A 引用 B (例如, 定理引用定义，笔记引用定理，解法引用定理)
  | '依赖' // A 依赖 B (例如, 一个定理的证明依赖另一个定理)
  | '证明'     // A 证明 B (例如, 笔记或例题证明定理)
  | '是...的例题' // A 是 B 的例题 (例如, 例题关联到章节或定义)
  | '是...的练习题' // A 是 B 的练习题 (例如, 习题关联到章节)
  | '是...的解法' // A 是 B 的解题记录
  | '充分条件' // A 是 B 的充分条件 (A => B)
  | '必要条件' // A 是 B 的必要条件 (B => A)
  | '充要条件'; // A 是 B 的充要条件 (A <=> B)

/**
 * 代表两个节点之间的有向连接。
 * 用于创建非层级关系，如引用或关联。
 */
export interface Edge {
  /** 边的唯一标识符。 */
  id: string;

  /** 边起点的节点 ID。 */
  source: string;

  /** 边终点的节点 ID。 */
  target: string;

  /** 描述关系性质的标签，必须是预定义的 EdgeLabel 类型之一。 */
  label: EdgeLabel;

  /** 对该关系的额外描述，例如解释一个“引用”的具体原因。 */
  description?: string;
}

/**
 * A processed node, with additional properties for display purposes.
 */
export type ProcessedNode = Node & { displayNumber: string; isChapter: boolean };
